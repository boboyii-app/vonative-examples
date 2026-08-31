import { DEFAULT_MAP_STYLE_URL } from "@/lib/constants";
import { getRuntimeEnv } from "@/server/env";
import { jsonOk, requireOperator } from "@/server/http";

export async function GET(request: Request): Promise<Response> {
  const env = await getRuntimeEnv();
  const operator = await requireOperator(request, env);
  if (operator instanceof Response) return operator;
  return jsonOk({
    mapStyleUrl: env.NEXT_PUBLIC_MAP_STYLE_URL || DEFAULT_MAP_STYLE_URL,
  });
}
