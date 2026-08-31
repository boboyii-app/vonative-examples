import { describe, expect, it } from "vitest";
import { mayAutomaticallyMergeCriticalIncidents } from "./incident-service";

describe("realtime safety policy", () => {
  it("never permits automatic critical incident merging", () => {
    expect(mayAutomaticallyMergeCriticalIncidents()).toBe(false);
  });
});
