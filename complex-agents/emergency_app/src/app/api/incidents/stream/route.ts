import { getRuntimeEnv } from "@/server/env";
import { jsonError, requireOperator } from "@/server/http";

export async function GET(request: Request): Promise<Response> {
  const env = await getRuntimeEnv();
  const operator = await requireOperator(request, env);
  if (operator instanceof Response) return operator;
  if (!env.INCIDENT_CHANNEL) {
    return jsonError("Realtime channel is not available; use polling", 503);
  }

  const id = env.INCIDENT_CHANNEL.idFromName("sentinel-incidents");
  const stub = env.INCIDENT_CHANNEL.get(id);
  return stub.fetch(request);
}
