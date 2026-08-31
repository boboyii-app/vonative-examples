import { normalizeFinalCallReport, reportOrganizationId } from "@/lib/final-call-report";
import { EventNormalizationError } from "@/lib/normalization";
import { processNormalizedEvent } from "@/server/incident-service";
import { getRuntimeEnv } from "@/server/env";
import { jsonError, jsonOk } from "@/server/http";
import { verifyCustomerWebhook } from "@/server/auth";
import { enrichReportLocation } from "@/server/geocoding";
import { allowsFinalCallReport } from "@/server/call-sources";

export async function POST(request: Request): Promise<Response> {
  const env = await getRuntimeEnv();
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return jsonError("Request body is required", 400);
  }
  if (!(await verifyCustomerWebhook(request, rawBody, env))) return jsonError("Invalid webhook signature", 401);
  let body: unknown;
  try { body = JSON.parse(rawBody) as unknown; } catch { return jsonError("Request body must be JSON", 400); }
  if (env.SENTINEL_ORGANIZATION_ID && reportOrganizationId(body) !== env.SENTINEL_ORGANIZATION_ID) return jsonError("Webhook organization is not allowed", 403);
  if (!(await allowsFinalCallReport(env, body))) return jsonError("Call source is not enabled for Sentinel", 403);

  try {
    body = await enrichReportLocation(body, env);
    const results = [];
    for (const event of normalizeFinalCallReport(body)) {
      const result = await processNormalizedEvent(env, event);
      results.push({
        eventId: event.eventId,
        duplicate: result.duplicate,
        created: result.created,
        incidentId: result.incident?.id || null,
      });
    }
    return jsonOk({ accepted: results.length, results });
  } catch (error) {
    if (error instanceof EventNormalizationError) {
      return jsonError(error.message, error.status);
    }
    return jsonError("Unable to process Vonative event", 500);
  }
}
