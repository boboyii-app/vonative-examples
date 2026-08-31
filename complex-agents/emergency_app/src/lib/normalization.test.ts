import { describe, expect, it } from "vitest";
import { EventNormalizationError, normalizeVonativeEvent } from "./normalization";

describe("normalizeVonativeEvent", () => {
  it("normalizes webhook aliases while preserving the source id and received time", () => {
    const event = normalizeVonativeEvent(
      {
        event_id: "evt-42",
        event_type: "transcript_updated",
        call_id: "call-7",
        received_at: "2026-08-30T12:00:00.000Z",
        data: { text: "I need help", speaker: "caller" },
      },
      { source: "vonative" },
    );

    expect(event).toMatchObject({
      eventId: "evt-42",
      kind: "transcript.segment",
      callId: "call-7",
      receivedAt: "2026-08-30T12:00:00.000Z",
      source: "vonative",
    });
    expect(event.data).toEqual({ text: "I need help", speaker: "caller" });
  });

  it("uses the scenario source without changing the normalized contract", () => {
    const event = normalizeVonativeEvent(
      {
        id: "scenario-1",
        type: "triage.escalation_ready",
        incidentId: "inc-1",
        data: { reason: "critical" },
      },
      { source: "scenario", receivedAt: "2026-08-30T12:01:00.000Z" },
    );

    expect(event.kind).toBe("triage.escalation_ready");
    expect(event.source).toBe("scenario");
    expect(event.incidentId).toBe("inc-1");
  });

  it("rejects events without an id or with an unsupported type", () => {
    expect(() => normalizeVonativeEvent({ type: "call.started" })).toThrow(
      EventNormalizationError,
    );
    expect(() => normalizeVonativeEvent({ id: "evt-1", type: "unknown.event" })).toThrow(
      /Unsupported event type/,
    );
  });
});
