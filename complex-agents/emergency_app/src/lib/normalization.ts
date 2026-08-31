import type { NormalizedEvent, NormalizedEventKind } from "./types";

export class EventNormalizationError extends Error {
  status = 400;

  constructor(message: string) {
    super(message);
    this.name = "EventNormalizationError";
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function eventType(value: unknown): NormalizedEventKind | undefined {
  const normalized = stringValue(value)?.toLowerCase().replaceAll("_", ".");
  if (!normalized) return undefined;

  const aliases: Record<string, NormalizedEventKind> = {
    "call.started": "call.started",
    "call.start": "call.started",
    "session.started": "call.started",
    "session.start": "call.started",
    "call.lifecycle.started": "call.started",
    "call.connected": "call.started",
    "call.initiated": "call.started",
    "call.ended": "call.ended",
    "call.end": "call.ended",
    "session.ended": "call.ended",
    "session.end": "call.ended",
    "call.lifecycle.ended": "call.ended",
    "call.disconnected": "call.ended",
    "transcript.segment": "transcript.segment",
    "transcript.segment.created": "transcript.segment",
    "transcript.updated": "transcript.segment",
    "transcript.final": "transcript.segment",
    transcript: "transcript.segment",
    "analysis.completed": "analysis.completed",
    "analysis.complete": "analysis.completed",
    "analysis.result": "analysis.completed",
    "analysis.updated": "analysis.completed",
    "triage.classified": "analysis.completed",
    "triage.analysis.completed": "analysis.completed",
    "recording.reference": "recording.reference",
    "recording.reference.created": "recording.reference",
    "recording.created": "recording.reference",
    "recording.ready": "recording.reference",
    "escalation.ready": "triage.escalation_ready",
    "triage.escalation.ready": "triage.escalation_ready",
    "triage.escalation_ready": "triage.escalation_ready",
  };

  return aliases[normalized];
}

function validTimestamp(value: unknown, fallback: string): string {
  const candidate = stringValue(value);
  if (!candidate) return fallback;
  return Number.isNaN(Date.parse(candidate)) ? fallback : candidate;
}

/**
 * Convert a Vonative webhook (or a scenario event with the same shape) into
 * the small event contract consumed by the incident processor. The original
 * event ID is mandatory so retries can be safely ignored.
 */
export function normalizeVonativeEvent(
  input: unknown,
  options: { source?: "vonative" | "scenario"; receivedAt?: string } = {},
): NormalizedEvent {
  if (!isRecord(input)) {
    throw new EventNormalizationError("Event must be a JSON object");
  }

  const source = options.source || (input.source === "scenario" ? "scenario" : "vonative");
  const kind = eventType(input.type ?? input.event_type ?? input.name);
  if (!kind) {
    throw new EventNormalizationError(
      "Unsupported event type. Expected a call, transcript, analysis, recording, or escalation event",
    );
  }

  const eventId = stringValue(input.id ?? input.event_id ?? input.eventId);
  if (!eventId) {
    throw new EventNormalizationError("Event id is required for idempotency");
  }

  const nestedData = isRecord(input.data)
    ? input.data
    : isRecord(input.payload)
      ? input.payload
      : {};
  const data = { ...nestedData };
  const callId = stringValue(
    input.call_id ?? input.callId ?? input.session_id ?? input.sessionId ?? data.callId ?? data.call_id,
  );
  const sessionId = stringValue(input.session_id ?? input.sessionId ?? data.sessionId ?? data.session_id);
  const incidentId = stringValue(input.incident_id ?? input.incidentId ?? data.incidentId ?? data.incident_id);
  const defaultReceivedAt = validTimestamp(options.receivedAt, new Date().toISOString());
  const receivedAt = validTimestamp(
    input.received_at ?? input.receivedAt,
    defaultReceivedAt,
  );
  const occurredAt = validTimestamp(
    input.occurred_at ?? input.occurredAt ?? input.timestamp,
    receivedAt,
  );

  return {
    eventId,
    kind,
    receivedAt,
    occurredAt,
    source,
    sessionId,
    callId,
    incidentId,
    data,
  };
}

export function normalizeScenarioEvent(
  input: unknown,
  receivedAt = new Date().toISOString(),
): NormalizedEvent {
  return normalizeVonativeEvent(input, { source: "scenario", receivedAt });
}
