import { beforeEach, describe, expect, it } from "vitest";
import { normalizeScenarioEvent } from "@/lib/normalization";
import { applyOperatorAction, mayAutomaticallyMergeCriticalIncidents, processNormalizedEvent } from "./incident-service";
import { getIncident, resetMemoryStore } from "./repository";

const env = {};

beforeEach(() => resetMemoryStore());

describe("incident event processing", () => {
  it("is idempotent and does not merge proposed critical duplicates", async () => {
    const event = normalizeScenarioEvent({
      id: "event-critical-1",
      type: "analysis.completed",
      incidentId: "new-critical",
      callId: "call-critical",
      receivedAt: "2026-08-30T12:00:00.000Z",
      data: {
        title: "Warehouse fire",
        category: "disaster",
        type: "fire",
        severity: "critical",
        relatedReports: [{ reportId: "report-2", title: "Smoke nearby", confidence: 0.91 }],
      },
    });

    const first = await processNormalizedEvent(env, event);
    const retry = await processNormalizedEvent(env, event);
    expect(first.created).toBe(true);
    expect(retry.duplicate).toBe(true);
    expect(first.incident?.relatedReports[0].status).toBe("proposed");
    const escalation = await processNormalizedEvent(
      env,
      normalizeScenarioEvent({
        id: "event-critical-escalation",
        type: "triage.escalation_ready",
        incidentId: "new-critical",
        data: { reason: "critical" },
      }),
    );
    expect(escalation.incident?.status).toBe("new");
    expect(escalation.incident?.escalationReady).toBe(true);
    expect(mayAutomaticallyMergeCriticalIncidents()).toBe(false);
  });

  it("preserves a previous transcript when a revision arrives", async () => {
    await processNormalizedEvent(
      env,
      normalizeScenarioEvent({
        id: "transcript-1",
        type: "transcript.segment",
        incidentId: "transcript-incident",
        data: { segmentId: "segment-1", speaker: "caller", text: "There is smoke" },
      }),
    );
    const result = await processNormalizedEvent(
      env,
      normalizeScenarioEvent({
        id: "transcript-2",
        type: "transcript.segment",
        incidentId: "transcript-incident",
        data: {
          segmentId: "segment-2",
          revisionOf: "segment-1",
          speaker: "caller",
          text: "There is heavy smoke",
        },
      }),
    );

    expect(result.incident?.transcript).toHaveLength(2);
    expect(result.incident?.transcript[0].revised).toBe(true);
    expect(result.incident?.transcript[1].revisionOf).toBe("segment-1");
  });

  it("uses the template's structured location value for the incident location", async () => {
    const result = await processNormalizedEvent(
      env,
      normalizeScenarioEvent({
        id: "structured-location",
        type: "analysis.completed",
        incidentId: "location-incident",
        data: { location: { location: "Ikorodu" } },
      }),
    );

    expect(result.incident?.location.reportedAddress).toBe("Ikorodu");
    expect(result.incident?.location.address).toBe("Ikorodu");
  });
});

describe("human operator actions", () => {
  it("changes lifecycle state only after an explicit action", async () => {
    const event = normalizeScenarioEvent({
      id: "action-incident-1",
      type: "call.started",
      incidentId: "action-incident",
      data: { title: "Unverified report" },
    });
    const created = await processNormalizedEvent(env, event);
    expect(created.incident?.status).toBe("new");

    const result = await applyOperatorAction(env, "action-incident", { action: "acknowledge" }, "Operator Ada");
    expect(result.incident.status).toBe("acknowledged");
    expect(result.action.actor).toBe("Operator Ada");
    expect((await getIncident(env, "action-incident"))?.timeline.at(-1)?.source).toBe("operator");
  });
});
