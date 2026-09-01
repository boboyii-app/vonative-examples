import { describe, expect, it } from "vitest";
import { normalizeFinalCallReport, reportOrganizationId } from "./final-call-report";

const report = {
  message: {
    type: "end-of-call-report",
    event_id: "end-of-call-report:session-7:2026-08-30T12:00:00.000Z",
    call: {
      id: "session-7",
      endedAt: "2026-08-30T12:00:00.000Z",
      customer: { number: "+2348012345678" },
      metadata: { organization_id: "emergency-org" },
    },
    artifact: {
      messages: [{ id: "m-1", role: "caller", content: "There is smoke at the market." }],
      recording_reference: "session:session-7",
    },
    analysis_status: "completed",
    analysis: {
      summary: "Possible market fire.",
      emergency_triage: {
        title: "Smoke reported near market",
        category: "disaster",
        type: "fire",
        severity: "critical",
        confidence: 0.91,
        escalation_recommendation: true,
      },
    },
    data_collection: {
      fields: {
        incident_type: { value: "fire" },
        location: { value: { location: "Ikorodu" } },
      },
    },
  },
};

describe("final call report normalization", () => {
  it("expands one finalized call into idempotent real-call events", () => {
    const events = normalizeFinalCallReport(report, "2026-08-30T12:01:00.000Z");
    expect(events.map((event) => event.kind)).toEqual([
      "call.started",
      "transcript.segment",
      "analysis.completed",
      "recording.reference",
      "triage.escalation_ready",
      "call.ended",
    ]);
    expect(events[2].data).toMatchObject({ severity: "critical", analysisStatus: "completed" });
    expect(events[2].data.facts).toContainEqual(expect.objectContaining({
      label: "Caller phone number",
      value: "+2348012345678",
      source: "vonative",
    }));
    expect(events[2].data.facts).toContainEqual(expect.objectContaining({ label: "location", value: "Ikorodu" }));
    expect(events[2].data.location).toMatchObject({ location: "Ikorodu" });
    expect(events[0].callId).toBe("session-7");
  });

  it("keeps real calls visible when analysis is unavailable", () => {
    const pending = structuredClone(report) as { message: { analysis_status: string; analysis: Record<string, unknown> } };
    pending.message.analysis_status = "pending_review";
    pending.message.analysis = { error: "analysis timeout" };
    const events = normalizeFinalCallReport(pending);
    expect(events.find((event) => event.kind === "analysis.completed")?.data).toMatchObject({
      analysisStatus: "pending_review",
      analysisError: "analysis timeout",
    });
  });

  it("reads the customer webhook organization boundary", () => {
    expect(reportOrganizationId(report)).toBe("emergency-org");
  });
});
