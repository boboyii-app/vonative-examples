import { isRecord } from "@/lib/normalization";
import type { SentinelEnv } from "./env";

export type CallSourceType = "assistant" | "workflow";
export interface CallSource { id: string; sourceType: CallSourceType; sourceId: string; displayName: string; enabled: boolean; createdAt: string; updatedAt: string; updatedBy: string; }

let memorySources: CallSource[] = [];
function id(): string { return `source-${crypto.randomUUID()}`; }
function hasDatabase(env: SentinelEnv): env is SentinelEnv & { DB: D1Database } { return Boolean(env.DB && typeof env.DB.prepare === "function"); }
function row(row: Record<string, unknown>): CallSource { return { id: String(row.id), sourceType: row.source_type as CallSourceType, sourceId: String(row.source_id), displayName: String(row.display_name), enabled: Boolean(row.enabled), createdAt: String(row.created_at), updatedAt: String(row.updated_at), updatedBy: String(row.updated_by) }; }
function clean(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function identifier(value: unknown): string | undefined { return typeof value === "string" ? clean(value) : typeof value === "number" && Number.isFinite(value) ? String(value) : undefined; }

export async function listCallSources(env: SentinelEnv): Promise<CallSource[]> {
  if (hasDatabase(env)) { const result = await env.DB.prepare("SELECT * FROM allowed_call_sources ORDER BY source_type, display_name").all<Record<string, unknown>>(); return result.results.map(row); }
  return structuredClone(memorySources);
}

export async function saveCallSource(env: SentinelEnv, input: unknown, actor: string, sourceRecordId?: string): Promise<CallSource> {
  if (!isRecord(input)) throw new Error("Invalid call source");
  const sourceType = clean(input.sourceType ?? input.source_type);
  const sourceId = clean(input.sourceId ?? input.source_id);
  const displayName = clean(input.displayName ?? input.display_name);
  if ((sourceType !== "assistant" && sourceType !== "workflow") || !sourceId || !displayName) throw new Error("Select a source type and provide its UUID and name");
  const now = new Date().toISOString(); const existing = sourceRecordId ? (await listCallSources(env)).find((item) => item.id === sourceRecordId) : undefined;
  const next: CallSource = { id: existing?.id || id(), sourceType, sourceId, displayName, enabled: input.enabled === undefined ? (existing?.enabled ?? true) : input.enabled === true, createdAt: existing?.createdAt || now, updatedAt: now, updatedBy: actor };
  if (hasDatabase(env)) {
    await env.DB.prepare(`INSERT INTO allowed_call_sources (id, source_type, source_id, display_name, enabled, created_at, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET source_type=excluded.source_type, source_id=excluded.source_id, display_name=excluded.display_name, enabled=excluded.enabled, updated_at=excluded.updated_at, updated_by=excluded.updated_by`).bind(next.id, next.sourceType, next.sourceId, next.displayName, next.enabled ? 1 : 0, next.createdAt, next.updatedAt, next.updatedBy).run();
    await env.DB.prepare("INSERT INTO call_source_audit (id, source_id, action, actor, detail_json, at) VALUES (?, ?, ?, ?, ?, ?)").bind(`audit-${crypto.randomUUID()}`, next.id, existing ? "updated" : "created", actor, JSON.stringify(next), now).run();
  } else { memorySources = existing ? memorySources.map((item) => item.id === existing.id ? next : item) : [...memorySources, next]; }
  return next;
}

export async function removeCallSource(env: SentinelEnv, sourceRecordId: string, actor: string): Promise<boolean> {
  const existing = (await listCallSources(env)).find((item) => item.id === sourceRecordId); if (!existing) return false;
  if (hasDatabase(env)) { await env.DB.batch([env.DB.prepare("DELETE FROM allowed_call_sources WHERE id = ?").bind(sourceRecordId), env.DB.prepare("INSERT INTO call_source_audit (id, source_id, action, actor, detail_json, at) VALUES (?, ?, ?, ?, ?, ?)").bind(`audit-${crypto.randomUUID()}`, sourceRecordId, "removed", actor, JSON.stringify(existing), new Date().toISOString())]); } else memorySources = memorySources.filter((item) => item.id !== sourceRecordId);
  return true;
}

export async function allowsFinalCallReport(env: SentinelEnv, report: unknown): Promise<boolean> {
  if (!isRecord(report) || !isRecord(report.message) || !isRecord(report.message.call)) return false;
  const call = report.message.call; const metadata = isRecord(call.metadata) ? call.metadata : {};
  const assistantId = identifier(call.assistantId ?? call.assistant_id); const workflowId = identifier(metadata.workflow_id ?? metadata.workflowId);
  const sources = await listCallSources(env); // Deliberately fail closed until Settings contains an enabled UUID.
  return sources.some((source) => source.enabled && ((source.sourceType === "assistant" && source.sourceId === assistantId) || (source.sourceType === "workflow" && source.sourceId === workflowId)));
}
