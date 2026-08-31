import { describe, expect, it } from "vitest";
import type { Incident } from "./types";
import { calculateMetrics, filterIncidents } from "./filters";

const incidents: Incident[] = [
  { id: "one", title: "Garki flood", type: "flood", category: "disaster", severity: "high", status: "new", location: { address: "Garki", latitude: 9, longitude: 7, geocodingStatus: "matched" }, summary: "Flood", confidence: 0.8, source: "vonative", simulated: false, unverified: true, escalationReady: false, analysisStatus: "completed", createdAt: "2026-01-02T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z", facts: [], transcript: [], timeline: [], relatedReports: [] },
  { id: "two", title: "Resolved report", type: "other", category: "security", severity: "low", status: "resolved", location: { address: "Wuse", latitude: 9, longitude: 7, geocodingStatus: "matched" }, summary: "Closed", confidence: 0.8, source: "vonative", simulated: false, unverified: true, escalationReady: false, analysisStatus: "pending_review", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", facts: [], transcript: [], timeline: [], relatedReports: [] },
];

describe("incident filters", () => {
  it("filters by severity", () => {
    const result = filterIncidents(incidents, { severity: "high" });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("one");
  });

  it("searches location and title", () => {
    expect(filterIncidents(incidents, { search: "Garki" })[0].id).toBe("one");
  });

  it("calculates overview metrics independently of feed filters", () => {
    expect(calculateMetrics(incidents)).toEqual({ total: 2, active: 1, critical: 0, unassigned: 1 });
  });
});
