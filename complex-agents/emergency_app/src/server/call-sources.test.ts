import { beforeEach, describe, expect, it } from "vitest";
import { allowsFinalCallReport, saveCallSource } from "./call-sources";

const env = {};
const report = { message: { call: { assistantId: "b401c29f-0e62-4f1c-bb9c-1e94d21de132", metadata: { workflow_id: "ba2b0a9c-a14c-42b2-83f9-f6dd5c6c42e1" } } } };

describe("allowed call sources", () => {
  beforeEach(async () => { /* fresh module memory is sufficient for this isolated suite */ });
  it("fails closed, then accepts either configured UUID type", async () => {
    expect(await allowsFinalCallReport(env, report)).toBe(false);
    await saveCallSource(env, { sourceType: "assistant", sourceId: report.message.call.assistantId, displayName: "Emergency assistant" }, "Operator Ada");
    expect(await allowsFinalCallReport(env, report)).toBe(true);
    expect(await allowsFinalCallReport(env, { message: { call: { assistantId: "different", metadata: { workflow_id: report.message.call.metadata.workflow_id } } } })).toBe(false);
  });
});
