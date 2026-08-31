import { createSessionCookie, verifyDemoPasscode } from "@/server/auth";
import { getRuntimeEnv } from "@/server/env";
import { jsonError, jsonOk } from "@/server/http";

export async function POST(request: Request): Promise<Response> {
  const env = await getRuntimeEnv();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Request body must be JSON", 400);
  }

  const passcode =
    typeof body === "object" && body !== null && "passcode" in body
      ? (body as { passcode?: unknown }).passcode
      : undefined;
  if (typeof passcode !== "string" || !passcode) {
    return jsonError("A demo operator passcode is required", 400);
  }

  const operator = await verifyDemoPasscode(passcode, env);
  if (!operator) return jsonError("Invalid operator passcode", 401);

  const response = jsonOk({ operator });
  response.headers.append("set-cookie", await createSessionCookie(env));
  return response;
}
