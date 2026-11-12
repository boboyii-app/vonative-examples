import { isRecord } from "@/lib/normalization";
import type { Incident, IncidentLocation } from "@/lib/types";
import type { SentinelEnv } from "./env";

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function collectionAddress(message: Record<string, unknown>): string | undefined {
  const collection = isRecord(message.data_collection ?? message.dataCollection)
    ? (message.data_collection ?? message.dataCollection) as Record<string, unknown>
    : {};
  const fields = isRecord(collection.fields) ? collection.fields : {};
  const value = isRecord(fields.address) ? fields.address.value : undefined;
  const legacyValue = isRecord(fields.location) ? fields.location.value : undefined;
  const address = isRecord(value) ? value.address ?? value.formatted_address : value;
  const legacyAddress = isRecord(legacyValue) ? legacyValue.address ?? legacyValue.location : legacyValue;
  return text(address) ?? text(legacyAddress);
}

function triageFrom(report: Record<string, unknown>): Record<string, unknown> | null {
  const message = isRecord(report.message) ? report.message : null;
  const analysis = message && isRecord(message.analysis) ? message.analysis : null;
  if (!analysis) return null;
  const triage = analysis.emergency_triage ?? analysis.emergencyTriage ?? analysis.structured_data ?? analysis.structuredData;
  return isRecord(triage) ? triage : null;
}

function hasCoordinates(location: IncidentLocation): boolean {
  return typeof location.latitude === "number" && Number.isFinite(location.latitude) &&
    typeof location.longitude === "number" && Number.isFinite(location.longitude);
}

/** Look up a caller-reported address without allowing the model to invent coordinates. */
async function geocodeQuery(
  query: string,
  reportedAddress: string | undefined,
  env: SentinelEnv,
): Promise<Partial<IncidentLocation> & { geocodingStatus: IncidentLocation["geocodingStatus"] }> {
  const location: Partial<IncidentLocation> & { geocodingStatus: IncidentLocation["geocodingStatus"] } = {
    reportedAddress,
    geocodingProvider: "maptiler",
    geocodingStatus: "not_requested",
  };

  if (!query) {
    location.geocodingStatus = "unresolved";
    return location;
  }
  if (!env.MAPTILER_GEOCODING_KEY) {
    location.geocodingStatus = "unresolved";
    return location;
  }

  const url = new URL(`https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json`);
  url.searchParams.set("key", env.MAPTILER_GEOCODING_KEY);
  url.searchParams.set("limit", "2");
  url.searchParams.set("country", env.MAPTILER_GEOCODING_COUNTRY || "ng");
  if (env.MAPTILER_GEOCODING_PROXIMITY) url.searchParams.set("proximity", env.MAPTILER_GEOCODING_PROXIMITY);

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(4_000) });
    const payload = await response.json() as { features?: unknown[] };
    const features = Array.isArray(payload.features) ? payload.features.filter(isRecord) : [];
    const first = features[0];
    const geometry = first && isRecord(first.geometry) ? first.geometry : undefined;
    const coordinates = geometry && Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
    if (!response.ok || typeof coordinates[0] !== "number" || typeof coordinates[1] !== "number") {
      location.geocodingStatus = "unresolved";
    } else {
      location.address = text(first.place_name) || text(first.text) || reportedAddress || query;
      location.longitude = coordinates[0];
      location.latitude = coordinates[1];
      location.geocodingFeatureId = text(first.id);
      location.geocodingStatus = features.length > 1 ? "ambiguous" : "matched";
      location.geocodingConfidence = features.length > 1 ? 0.6 : 0.8;
    }
  } catch {
    location.geocodingStatus = "unresolved";
  }

  return location;
}

/**
 * Enriches a verified final-call report; provider keys and calls stay in Sentinel.
 * The analysis only supplies the reported address and context. MapTiler supplies
 * the coordinates used by the map.
 */
export async function enrichReportLocation(report: unknown, env: SentinelEnv): Promise<unknown> {
  if (!isRecord(report)) return report;
  const message = isRecord(report.message) ? report.message : undefined;
  // A final-call report can arrive before post-call analysis completes. The
  // caller-collected address is still safe to geocode, so do not wait for an
  // optional emergency_triage object before enriching its location.
  const triage = triageFrom(report) || {};
  if (!message) return report;

  const reportedAddress = text(triage.address) ?? collectionAddress(message);
  const query = [
    reportedAddress,
    text(triage.landmark),
    text(triage.city),
    text(triage.state),
    text(triage.country) ?? "Nigeria",
  ].filter(Boolean).join(", ");
  const location = await geocodeQuery(query, reportedAddress, env);
  const nextTriage = {
    ...triage,
    address: triage.address ?? reportedAddress,
    location,
  };
  const analysis = isRecord(message.analysis) ? message.analysis : {};
  return { ...report, message: { ...message, analysis: { ...analysis, emergency_triage: nextTriage } } };
}

/** Retry location enrichment for older incidents that arrived before geocoding was configured. */
export async function geocodeIncidentLocation(incident: Incident, env: SentinelEnv): Promise<Incident> {
  const current = incident.location;
  if (hasCoordinates(current) || current.geocodingStatus !== "not_requested") return incident;

  const reportedAddress = current.reportedAddress ||
    (current.address !== "Location requires verification" ? current.address : undefined);
  if (!reportedAddress) return incident;

  const location = await geocodeQuery(`${reportedAddress}, Nigeria`, reportedAddress, env);
  return {
    ...incident,
    location: {
      ...current,
      ...location,
      address: location.address || current.address,
    },
  };
}
