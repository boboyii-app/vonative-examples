import { calculateMetrics } from "@/lib/filters";
import { getRuntimeEnv } from "@/server/env";
import { jsonError, jsonOk, requireOperator } from "@/server/http";
import { listIncidents } from "@/server/repository";

export async function GET(request: Request): Promise<Response> {
  const env = await getRuntimeEnv();
  const operator = await requireOperator(request, env);
  if (operator instanceof Response) return operator;

  const url = new URL(request.url);
  try {
    const incidents = await listIncidents(env, {
      severity: url.searchParams.get("severity") || undefined,
      category: url.searchParams.get("category") || undefined,
      status: url.searchParams.get("status") || undefined,
      search: url.searchParams.get("search") || undefined,
    });
    return jsonOk({ incidents, metrics: calculateMetrics(incidents), operator });
  } catch {
    return jsonError("Unable to load incidents", 500);
  }
}
