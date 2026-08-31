import { EventNormalizationError, isRecord, normalizeVonativeEvent } from "./normalization";
import type { NormalizedEvent } from "./types";

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

/** Converts the webhook-service's finalized end-of-call report into Sentinel events. */
export function normalizeFinalCallReport(input: unknown, receivedAt = new Date().toISOString()): NormalizedEvent[] {
  if (!isRecord(input)) throw new EventNormalizationError("Final call report must be a JSON object");
  const message = record(input.message);
  if (message.type !== "end-of-call-report") {
    throw new EventNormalizationError("Expected an end-of-call-report webhook");
  }
  const eventId = stringValue(message.event_id ?? message.eventId);
  const call = record(message.call);
  const callId = stringValue(call.id);
  if (!eventId || !callId) throw new EventNormalizationError("Final call report requires event_id and call.id");
  const artifact = record(message.artifact);
  const analysis = record(message.analysis);
  const triage = record(analysis.emergency_triage ?? analysis.emergencyTriage ?? analysis.structured_data ?? analysis.structuredData);
  const occurredAt = stringValue(call.endedAt ?? message.timestamp) || receivedAt;
  const base = { callId, occurredAt, receivedAt, incidentId: `inc-${callId}` };
  const analysisStatus = stringValue(message.analysis_status ?? message.analysisStatus ?? analysis.status) || "pending_review";
  const analysisError = stringValue(message.analysis_error ?? message.analysisError ?? analysis.error);
  const collection = record(message.data_collection ?? message.dataCollection);
  const collectionFields = record(collection.fields);
  const customer = record(call.customer);
  const callerPhoneNumber = stringValue(
    call.caller_phone_number ?? call.callerPhoneNumber ?? customer.number,
  );
  const callerFacts = Object.entries(collectionFields).flatMap(([label, field]) => {
    const item = record(field); const value = item.value;
    return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
      ? [{ label: label.replaceAll("_", " "), value: String(value), source: "caller", confidence: 1, verified: false }]
      : [];
  });
  const phoneFact = callerPhoneNumber
    ? [{ label: "Caller phone number", value: callerPhoneNumber, source: "vonative", confidence: 1, verified: false }]
    : [];
  const data = { ...triage, callerPhoneNumber, summary: triage.summary ?? analysis.summary, analysisStatus, analysisError, dataCollection: collection, facts: [...phoneFact, ...callerFacts, ...(Array.isArray(triage.facts) ? triage.facts : [])] };
  const events: NormalizedEvent[] = [normalizeVonativeEvent({ id: `${eventId}:call`, type: "call.started", ...base, data }, { source: "vonative", receivedAt })];

  const messages = Array.isArray(artifact.messages) ? artifact.messages : [];
  for (let index = 0; index < messages.length; index += 1) {
    const item = record(messages[index]);
    const text = stringValue(item.text ?? item.content ?? item.message);
    if (!text) continue;
    events.push(normalizeVonativeEvent({ id: `${eventId}:transcript:${index}`, type: "transcript.segment", ...base, occurredAt: stringValue(item.at ?? item.timestamp) || occurredAt, data: { segmentId: stringValue(item.id) || `${eventId}-segment-${index}`, text, speaker: item.speaker ?? item.role } }, { source: "vonative", receivedAt }));
  }
  if (!messages.length) {
    const transcript = stringValue(artifact.transcript);
    if (transcript) events.push(normalizeVonativeEvent({ id: `${eventId}:transcript`, type: "transcript.segment", ...base, data: { segmentId: `${eventId}-transcript`, text: transcript, speaker: "caller" } }, { source: "vonative", receivedAt }));
  }
  events.push(normalizeVonativeEvent({ id: `${eventId}:analysis`, type: "analysis.completed", ...base, data }, { source: "vonative", receivedAt }));
  const recordingReference = stringValue(artifact.recording_reference ?? artifact.recordingReference);
  if (recordingReference) events.push(normalizeVonativeEvent({ id: `${eventId}:recording`, type: "recording.reference", ...base, data: { reference: recordingReference } }, { source: "vonative", receivedAt }));
  if (triage.escalation_recommendation === true || triage.escalationRecommendation === true) events.push(normalizeVonativeEvent({ id: `${eventId}:escalation`, type: "triage.escalation_ready", ...base, data: { reason: triage.escalation_reason ?? triage.escalationReason } }, { source: "vonative", receivedAt }));
  events.push(normalizeVonativeEvent({ id: `${eventId}:ended`, type: "call.ended", ...base, data: { analysisStatus, analysisError } }, { source: "vonative", receivedAt }));
  return events;
}

export function reportOrganizationId(input: unknown): string | undefined {
  if (!isRecord(input)) return undefined;
  const metadata = record(record(record(input.message).call).metadata);
  const value = metadata.organization_id ?? metadata.organizationId;
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}
