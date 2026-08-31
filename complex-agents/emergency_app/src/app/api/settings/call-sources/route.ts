import { listCallSources, saveCallSource } from "@/server/call-sources";
import { getRuntimeEnv } from "@/server/env";
import { jsonError, jsonOk, requireOperator } from "@/server/http";

export async function GET(request: Request): Promise<Response> { const env = await getRuntimeEnv(); const operator = await requireOperator(request, env); if (operator instanceof Response) return operator; return jsonOk({ sources: await listCallSources(env) }); }
export async function POST(request: Request): Promise<Response> { const env = await getRuntimeEnv(); const operator = await requireOperator(request, env); if (operator instanceof Response) return operator; try { return jsonOk({ source: await saveCallSource(env, await request.json(), operator.name) }, { status: 201 }); } catch (error) { return jsonError(error instanceof Error ? error.message : "Unable to save call source", 400); } }
