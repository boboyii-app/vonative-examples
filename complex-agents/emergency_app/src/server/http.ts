import type { Operator } from "@/lib/types";
import { operatorFromRequest } from "./auth";
import type { SentinelEnv } from "./env";

export async function requireOperator(
  request: Request,
  env: SentinelEnv,
): Promise<Operator | Response> {
  const operator = await operatorFromRequest(request, env);
  return operator || jsonError("Authentication required", 401);
}

export function jsonError(message: string, status: number, details?: unknown): Response {
  return Response.json(
    { error: message, ...(details === undefined ? {} : { details }) },
    {
      status,
      headers: { "cache-control": "no-store" },
    },
  );
}

export function jsonOk<T>(data: T, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("cache-control", "no-store");
  return Response.json(data, { ...init, headers });
}
