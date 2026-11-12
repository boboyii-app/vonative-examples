import { calculateMetrics } from "@/lib/filters";
import type { Incident } from "@/lib/types";
import { getRuntimeEnv } from "@/server/env";
import { geocodeIncidentLocation } from "@/server/geocoding";
import { jsonError, jsonOk, requireOperator } from "@/server/http";
import { listIncidents, saveIncident } from "@/server/repository";

export async function GET(request: Request): Promise<Response> {
  const env = await getRuntimeEnv();
  const operator = await requireOperator(request, env);
  if (operator instanceof Response) return operator;

  const url = new URL(request.url);
  try {
    const loadedIncidents = await listIncidents(env, {
      severity: url.searchParams.get("severity") || undefined,
      category: url.searchParams.get("category") || undefined,
      status: url.searchParams.get("status") || undefined,
      search: url.searchParams.get("search") || undefined,
    });
    const incidents = await geocodePendingIncidents(env, loadedIncidents);
    return jsonOk({ incidents, metrics: calculateMetrics(incidents), operator });
  } catch {
    return jsonError("Unable to load incidents", 500);
  }
}

async function geocodePendingIncidents(
  env: Awaited<ReturnType<typeof getRuntimeEnv>>,
  incidents: Incident[],
): Promise<Incident[]> {
  const next: Incident[] = [];
  let attempts = 0;
  for (const incident of incidents) {
    const hasReportedAddress = Boolean(
      incident.location.reportedAddress ||
      (incident.location.address && incident.location.address !== "Location requires verification"),
    );
    if (attempts >= 5 || incident.location.geocodingStatus !== "not_requested" || !hasReportedAddress) {
      next.push(incident);
      continue;
    }

    attempts += 1;
    const enriched = await geocodeIncidentLocation(incident, env);
    if (enriched !== incident) await saveIncident(env, enriched);
    next.push(enriched);
  }
  return next;
}
