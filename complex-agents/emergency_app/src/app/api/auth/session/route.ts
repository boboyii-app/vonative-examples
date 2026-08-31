import { operatorFromRequest } from "@/server/auth";
import { getRuntimeEnv } from "@/server/env";
import { jsonOk } from "@/server/http";

export async function GET(request: Request): Promise<Response> {
  const env = await getRuntimeEnv();
  const operator = await operatorFromRequest(request, env);
  return jsonOk({ authenticated: Boolean(operator), operator: operator || null });
}
