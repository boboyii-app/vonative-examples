import {
  INCIDENT_TYPES,
  SEVERITIES,
  type Incident,
  type IncidentFact,
  type NormalizedEvent,
  type OperatorAction,
  type OperatorActionType,
  type RelatedReport,
  type TimelineEntry,
  type TranscriptSegment,
} from "@/lib/types";
import { isRecord } from "@/lib/normalization";
import type { SentinelEnv } from "./env";
import {
  claimEvent,
  findIncidentByCallId,
  getIncident,
  recordOperatorAction,
  saveIncident,
} from "./repository";
import { broadcastIncidentUpdate } from "./realtime";

export class IncidentServiceError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "IncidentServiceError";
    this.status = status;
  }
}

function id(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return undefined;
}

function enumValue<T extends readonly string[]>(value: unknown, values: T): T[number] | undefined {
  const candidate = stringValue(value)?.toLowerCase();
  return candidate && values.includes(candidate as T[number])
    ? (candidate as T[number])
    : undefined;
}

function sourceValue(value: unknown, fallback: IncidentFact["source"]): IncidentFact["source"] {
  const candidate = stringValue(value)?.toLowerCase();
  return candidate === "caller" ||
    candidate === "ai" ||
    candidate === "operator" ||
    candidate === "vonative" ||
    candidate === "scenario"
    ? candidate
    : fallback;
}

function payload(event: NormalizedEvent): Record<string, unknown> {
  const nested = isRecord(event.data.analysis) ? event.data.analysis : undefined;
  return nested ? { ...event.data, ...nested } : event.data;
}

function locationFrom(
  data: Record<string, unknown>,
  current: Incident["location"],
): Incident["location"] {
  const raw = isRecord(data.location) ? data.location : data;
  const coordinates = Array.isArray(raw.coordinates) ? raw.coordinates : undefined;
  const latitude =
    numberValue(raw.latitude ?? raw.lat) ??
    (coordinates && numberValue(coordinates[1]));
  const longitude =
    numberValue(raw.longitude ?? raw.lng ?? raw.lon) ??
    (coordinates && numberValue(coordinates[0]));
  const reportedAddress = stringValue(raw.reported_address ?? raw.reportedAddress ?? raw.address ?? raw.locationName ?? raw.place) || stringValue(data.location);
  const geocodingStatus = stringValue(raw.geocoding_status ?? raw.geocodingStatus);
  const geocodingConfidence = numberValue(raw.geocoding_confidence ?? raw.geocodingConfidence ?? raw.confidence);
  const hasCoordinates = latitude !== undefined && longitude !== undefined;
  return {
    latitude: hasCoordinates ? latitude : current.latitude,
    longitude: hasCoordinates ? longitude : current.longitude,
    address: stringValue(raw.formatted_address ?? raw.formattedAddress ?? raw.address) || current.address,
    reportedAddress: reportedAddress || current.reportedAddress,
    geocodingStatus:
      geocodingStatus === "matched" || geocodingStatus === "ambiguous" || geocodingStatus === "unresolved" || geocodingStatus === "not_requested" || geocodingStatus === "verified"
        ? geocodingStatus
        : hasCoordinates ? "matched" : current.geocodingStatus,
    geocodingConfidence: geocodingConfidence ?? current.geocodingConfidence,
    geocodingProvider: stringValue(raw.geocoding_provider ?? raw.geocodingProvider) || current.geocodingProvider,
    geocodingFeatureId: stringValue(raw.geocoding_feature_id ?? raw.geocodingFeatureId ?? raw.feature_id) || current.geocodingFeatureId,
  };
}

function factList(event: NormalizedEvent): IncidentFact[] {
  const rawFactsValue = payload(event).facts;
  const rawFacts: unknown[] = Array.isArray(rawFactsValue)
    ? rawFactsValue
    : isRecord(rawFactsValue)
      ? Object.entries(rawFactsValue).map(([label, value]) => ({ label, value }))
      : [];
  const fallbackSource: IncidentFact["source"] = event.source === "scenario" ? "scenario" : "ai";
  return rawFacts.flatMap((rawFact, index) => {
    if (!isRecord(rawFact)) return [];
    const value = stringValue(rawFact.value ?? rawFact.text ?? rawFact.answer);
    if (!value) return [];
    const label = stringValue(rawFact.label ?? rawFact.name ?? rawFact.key) || `Fact ${index + 1}`;
    return [
      {
        id: stringValue(rawFact.id) || `${event.eventId}-fact-${index}`,
        label,
        value,
        source: sourceValue(rawFact.source, fallbackSource),
        confidence: Math.max(0, Math.min(1, numberValue(rawFact.confidence) ?? 0.7)),
        verified: rawFact.verified === true && rawFact.source === "operator",
      },
    ];
  });
}

function relatedReports(event: NormalizedEvent): RelatedReport[] {
  const data = payload(event);
  const rawReportsValue = data.relatedReports ?? data.related_reports ?? data.possibleDuplicates;
  const rawReports: unknown[] = Array.isArray(rawReportsValue)
    ? rawReportsValue
    : isRecord(rawReportsValue)
      ? Object.entries(rawReportsValue).map(([reportId, title]) => ({ reportId, title }))
      : [];
  return rawReports.flatMap((rawReport, index) => {
    if (!isRecord(rawReport)) return [];
    const reportId = stringValue(rawReport.reportId ?? rawReport.report_id ?? rawReport.id);
    if (!reportId) return [];
    return [
      {
        id: stringValue(rawReport.linkId) || `${event.eventId}-related-${index}`,
        reportId,
        title: stringValue(rawReport.title ?? rawReport.summary) || "Related report",
        confidence: Math.max(0, Math.min(1, numberValue(rawReport.confidence) ?? 0.5)),
        // AI may suggest a link, but it can never merge incidents on its own.
        status: "proposed",
        source: sourceValue(rawReport.source, event.source === "scenario" ? "scenario" : "ai"),
      },
    ];
  });
}

function createIncident(event: NormalizedEvent): Incident {
  const data = payload(event);
  const incidentId = event.incidentId || `inc-${event.callId || event.eventId}`;
  const now = event.receivedAt;
  const source = event.source === "scenario" ? "scenario" : "vonative";
  const category = enumValue(data.category, ["security", "medical", "disaster"] as const) || "security";
  const type = enumValue(data.type ?? data.incidentType, INCIDENT_TYPES) || "other";
  const severity = enumValue(data.severity, SEVERITIES) || "medium";
  const reportedAddress = stringValue(data.address ?? data.locationName ?? data.place);
  const incident: Incident = {
    id: incidentId,
    title: stringValue(data.title ?? data.subject) || "New incoming emergency report",
    type,
    category,
    severity,
    status: "new",
    location: { address: reportedAddress || "Location requires verification", reportedAddress, geocodingStatus: "not_requested" },
    summary: stringValue(data.summary ?? data.description) || "Awaiting triage analysis.",
    confidence: Math.max(0, Math.min(1, numberValue(data.confidence) ?? 0.5)),
    source,
    simulated: event.source === "scenario",
    unverified: true,
    escalationReady: false,
    createdAt: now,
    updatedAt: now,
    callId: event.callId,
    analysisStatus: "pending_review",
    facts: [],
    transcript: [],
    timeline: [],
    relatedReports: [],
  };
  incident.location = locationFrom(data, incident.location);
  return incident;
}

function addTimeline(
  incident: Incident,
  event: NormalizedEvent,
  type: TimelineEntry["type"],
  label: string,
  detail?: string,
): void {
  const timelineId = `event-${event.eventId}`;
  if (incident.timeline.some((entry) => entry.id === timelineId)) return;
  incident.timeline.push({
    id: timelineId,
    type,
    label,
    detail,
    at: event.occurredAt,
    actor: event.source === "scenario" ? "Scenario simulator" : "Vonative adapter",
    source: event.source,
  });
}

function applyTranscript(incident: Incident, event: NormalizedEvent): void {
  const data = payload(event);
  const text = stringValue(data.text ?? data.transcript ?? data.utterance);
  if (!text) return;
  const segmentId = stringValue(data.segmentId ?? data.segment_id ?? data.id) || event.eventId;
  const speakerValue = stringValue(data.speaker ?? data.role)?.toLowerCase();
  const speaker: TranscriptSegment["speaker"] =
    speakerValue === "agent" || speakerValue === "assistant" || speakerValue === "operator"
      ? speakerValue === "assistant"
        ? "agent"
        : speakerValue
      : "caller";
  const revisionOf = stringValue(data.revisionOf ?? data.revision_of);
  const segment: TranscriptSegment = {
    id: segmentId,
    speaker,
    text,
    at: event.occurredAt,
    source: sourceValue(data.source, speaker === "caller" ? "caller" : event.source),
    confidence: numberValue(data.confidence),
    revised: Boolean(revisionOf) || data.revised === true,
    revisionOf,
    sourceEventId: event.eventId,
  };

  if (revisionOf) {
    const previous = incident.transcript.find((item) => item.id === revisionOf);
    if (previous) previous.revised = true;
  }
  const existingIndex = incident.transcript.findIndex((item) => item.id === segmentId);
  if (existingIndex === -1) incident.transcript.push(segment);
  else incident.transcript[existingIndex] = segment;
}

function applyAnalysis(incident: Incident, event: NormalizedEvent): void {
  const data = payload(event);
  const category = enumValue(data.category, ["security", "medical", "disaster"] as const);
  const type = enumValue(data.type ?? data.incidentType, INCIDENT_TYPES);
  const severity = enumValue(data.severity, SEVERITIES);
  if (category) incident.category = category;
  if (type) incident.type = type;
  if (severity) incident.severity = severity;
  const title = stringValue(data.title ?? data.subject);
  const summary = stringValue(data.summary ?? data.description);
  if (title) incident.title = title;
  if (summary) incident.summary = summary;
  const confidence = numberValue(data.confidence);
  if (confidence !== undefined) incident.confidence = Math.max(0, Math.min(1, confidence));
  const analysisStatus = stringValue(data.analysisStatus ?? data.analysis_status);
  if (analysisStatus === "completed" || analysisStatus === "pending_review" || analysisStatus === "failed") {
    incident.analysisStatus = analysisStatus;
  }
  const analysisError = stringValue(data.analysisError ?? data.analysis_error);
  if (analysisError) incident.analysisError = analysisError;
  incident.location = locationFrom(data, incident.location);
  if (incident.location.geocodingStatus === "unresolved" || incident.location.geocodingStatus === "ambiguous") {
    addTimeline(incident, event, "extraction", "Location requires verification", incident.location.reportedAddress || "No usable location was extracted from the call.");
  }

  for (const nextFact of factList(event)) {
    const index = incident.facts.findIndex(
      (existing) => existing.id === nextFact.id || existing.label === nextFact.label,
    );
    if (index === -1) {
      incident.facts.push(nextFact);
    } else if (!incident.facts[index].verified) {
      // Never replace a fact that an operator has explicitly verified.
      incident.facts[index] = nextFact;
    }
  }

  for (const nextReport of relatedReports(event)) {
    const index = incident.relatedReports.findIndex(
      (existing) => existing.reportId === nextReport.reportId,
    );
    if (index === -1) {
      incident.relatedReports.push(nextReport);
    } else {
      const existing = incident.relatedReports[index];
      incident.relatedReports[index] = {
        ...existing,
        ...nextReport,
        // A later AI retry cannot undo an operator's duplicate decision.
        status: existing.status === "proposed" ? nextReport.status : existing.status,
      };
    }
  }
}

export interface ProcessedEventResult {
  duplicate: boolean;
  created: boolean;
  incident: Incident | null;
}

export async function processNormalizedEvent(
  env: SentinelEnv,
  event: NormalizedEvent,
): Promise<ProcessedEventResult> {
  const claimed = await claimEvent(env, event.eventId, JSON.stringify(event));
  let incident = event.incidentId ? await getIncident(env, event.incidentId) : null;
  if (!incident && event.callId) incident = await findIncidentByCallId(env, event.callId);
  if (!claimed) {
    return { duplicate: true, created: false, incident };
  }

  const created = !incident;
  if (!incident) incident = createIncident(event);
  if (event.callId && !incident.callId) incident.callId = event.callId;

  switch (event.kind) {
    case "call.started":
      addTimeline(incident, event, "received", "Call received");
      applyAnalysis(incident, event);
      break;
    case "transcript.segment":
      applyTranscript(incident, event);
      addTimeline(incident, event, "transcript", "Transcript segment captured");
      break;
    case "analysis.completed":
      applyAnalysis(incident, event);
      addTimeline(
        incident,
        event,
        "classification",
        "AI triage classification updated",
        "Classification and extracted facts are unverified until an operator confirms them.",
      );
      break;
    case "recording.reference": {
      const recordingData = payload(event);
      const reference = stringValue(
        recordingData.reference ??
          recordingData.url ??
          recordingData.recordingReference ??
          recordingData.recording_url,
      );
      if (reference) incident.recordingReference = reference;
      if (reference) incident.recordingAvailable = true;
      addTimeline(incident, event, "recording", "Recording reference attached");
      break;
    }
    case "triage.escalation_ready":
      incident.escalationReady = true;
      addTimeline(
        incident,
        event,
        "escalation",
        "Escalation recommended",
        "Human review is required; no dispatch or escalation was performed automatically.",
      );
      break;
    case "call.ended":
      addTimeline(incident, event, "system", "Call ended");
      break;
  }

  incident.updatedAt = event.receivedAt;
  const saved = await saveIncident(env, incident);
  await broadcastIncidentUpdate(env, {
    type: created ? "incident.created" : "incident.updated",
    incident: saved,
    emittedAt: new Date().toISOString(),
  });
  return { duplicate: false, created, incident: saved };
}

function actionLabel(action: OperatorActionType): string {
  return action.replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

const ACTIONS: OperatorActionType[] = [
  "acknowledge",
  "assign",
  "escalate",
  "resolve",
  "review_duplicate",
  "verify_location",
];

export interface OperatorActionInput {
  action?: unknown;
  note?: unknown;
  assignee?: unknown;
  relatedReportId?: unknown;
  decision?: unknown;
  address?: unknown;
  latitude?: unknown;
  longitude?: unknown;
}

export async function applyOperatorAction(
  env: SentinelEnv,
  incidentId: string,
  input: OperatorActionInput,
  actor: string,
): Promise<{ incident: Incident; action: OperatorAction }> {
  const incident = await getIncident(env, incidentId);
  if (!incident) throw new IncidentServiceError("Incident not found", 404);
  const action = stringValue(input.action) as OperatorActionType | undefined;
  if (!action || !ACTIONS.includes(action)) {
    throw new IncidentServiceError("Unsupported operator action", 400);
  }

  const at = new Date().toISOString();
  const note = stringValue(input.note);
  const assignee = action === "assign" ? stringValue(input.assignee) || actor : undefined;
  switch (action) {
    case "acknowledge":
      if (incident.status === "new") incident.status = "acknowledged";
      break;
    case "assign": {
      incident.assignedTo = assignee || actor;
      if (incident.status !== "resolved") incident.status = "assigned";
      break;
    }
    case "escalate":
      incident.status = "escalated";
      incident.escalationReady = false;
      break;
    case "resolve":
      incident.status = "resolved";
      incident.escalationReady = false;
      break;
    case "review_duplicate": {
      const relatedReportId = stringValue(input.relatedReportId);
      const related = relatedReportId
        ? incident.relatedReports.find((item) => item.reportId === relatedReportId)
        : incident.relatedReports[0];
      if (!related) {
        throw new IncidentServiceError("Select a proposed related report before reviewing it", 400);
      }
      const decision = stringValue(input.decision)?.toLowerCase();
      related.status = decision === "not_duplicate" ? "not_duplicate" : "reviewed";
      break;
    }
    case "verify_location": {
      const latitude = numberValue(input.latitude);
      const longitude = numberValue(input.longitude);
      const address = stringValue(input.address);
      if (latitude === undefined || longitude === undefined || !address) {
        throw new IncidentServiceError("A verified address, latitude, and longitude are required", 400);
      }
      incident.location = {
        ...incident.location,
        address,
        latitude,
        longitude,
        geocodingStatus: "verified",
        geocodingConfidence: 1,
        geocodingProvider: "operator",
      };
      break;
    }
  }

  const operatorAction: OperatorAction = {
    id: id("action"),
    incidentId,
    action,
    actor,
    note,
    relatedReportId: stringValue(input.relatedReportId),
    assignee,
    at,
  };
  incident.timeline.push({
    id: `operator-${operatorAction.id}`,
    type: "operator",
    label: `${actionLabel(action)} recorded`,
    detail: note,
    at,
    actor,
    source: "operator",
  });
  incident.updatedAt = at;
  const saved = await saveIncident(env, incident);
  await recordOperatorAction(env, operatorAction);
  await broadcastIncidentUpdate(env, {
    type: "incident.action",
    incident: saved,
    action: operatorAction,
    emittedAt: at,
  });
  return { incident: saved, action: operatorAction };
}

/** Explicit policy guard: AI suggestions must never merge critical incidents. */
export function mayAutomaticallyMergeCriticalIncidents(): false {
  return false;
}
