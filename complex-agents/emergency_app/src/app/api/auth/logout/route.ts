import { clearSessionCookie } from "@/server/auth";
import { jsonOk } from "@/server/http";

export async function POST(): Promise<Response> {
  const response = jsonOk({ ok: true });
  response.headers.append("set-cookie", clearSessionCookie());
  return response;
}
