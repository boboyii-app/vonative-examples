import { removeCallSource, saveCallSource } from "@/server/call-sources";
import { getRuntimeEnv } from "@/server/env";
import { jsonError, jsonOk, requireOperator } from "@/server/http";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> { const env = await getRuntimeEnv(); const operator = await requireOperator(request, env); if (operator instanceof Response) return operator; try { return jsonOk({ source: await saveCallSource(env, await request.json(), operator.name, (await params).id) }); } catch (error) { return jsonError(error instanceof Error ? error.message : "Unable to update call source", 400); } }
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> { const env = await getRuntimeEnv(); const operator = await requireOperator(request, env); if (operator instanceof Response) return operator; if (!(await removeCallSource(env, (await params).id, operator.name))) return jsonError("Call source not found", 404); return jsonOk({ deleted: true }); }
