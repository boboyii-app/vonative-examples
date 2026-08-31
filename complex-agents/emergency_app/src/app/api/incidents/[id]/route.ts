import { getRuntimeEnv } from "@/server/env";
import { jsonError, jsonOk, requireOperator } from "@/server/http";
import { getIncident } from "@/server/repository";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const env = await getRuntimeEnv();
  const operator = await requireOperator(request, env);
  if (operator instanceof Response) return operator;
  const { id } = await context.params;
  const incident = await getIncident(env, id);
  return incident ? jsonOk({ incident }) : jsonError("Incident not found", 404);
}
