import { isRecord } from "@/lib/normalization";
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

/** Enriches a verified final-call report; provider keys and calls stay in Sentinel. */
export async function enrichReportLocation(report: unknown, env: SentinelEnv): Promise<unknown> {
  if (!isRecord(report)) return report;
  const message = isRecord(report.message) ? report.message : undefined;
  const triage = triageFrom(report);
  if (!message || !triage) return report;
  const reportedAddress = text(triage.address) ?? collectionAddress(message);
  const query = [reportedAddress, text(triage.landmark), text(triage.city), text(triage.state), text(triage.country)]
    .filter(Boolean).join(", ");
  const location: Record<string, unknown> = {
    reported_address: reportedAddress,
    geocoding_provider: "maptiler",
    geocoding_status: "not_requested",
  };
  if (!query) {
    location.geocoding_status = "unresolved";
    location.geocoding_error = "No usable address or landmark was extracted";
  } else if (!env.MAPTILER_GEOCODING_KEY) {
    location.geocoding_error = "Geocoding is not configured";
  } else {
    const url = new URL(`https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json`);
    url.searchParams.set("key", env.MAPTILER_GEOCODING_KEY);
    url.searchParams.set("limit", "2");
    if (env.MAPTILER_GEOCODING_COUNTRY) url.searchParams.set("country", env.MAPTILER_GEOCODING_COUNTRY);
    if (env.MAPTILER_GEOCODING_PROXIMITY) url.searchParams.set("proximity", env.MAPTILER_GEOCODING_PROXIMITY);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(4_000) });
      const payload = await response.json() as { features?: unknown[] };
      const features = Array.isArray(payload.features) ? payload.features.filter(isRecord) : [];
      const first = features[0];
      const geometry = first && isRecord(first.geometry) ? first.geometry : undefined;
      const coordinates = geometry && Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
      if (!response.ok || typeof coordinates[0] !== "number" || typeof coordinates[1] !== "number") {
        location.geocoding_status = "unresolved";
        location.geocoding_error = "No matching point location was found";
      } else {
        location.address = text(first.place_name) || text(first.text) || reportedAddress || query;
        location.longitude = coordinates[0];
        location.latitude = coordinates[1];
        location.geocoding_feature_id = text(first.id);
        location.geocoding_status = features.length > 1 ? "ambiguous" : "matched";
        location.geocoding_confidence = features.length > 1 ? 0.6 : 0.8;
      }
    } catch {
      location.geocoding_status = "unresolved";
      location.geocoding_error = "Geocoding lookup failed";
    }
  }
  const nextTriage = { ...triage, address: triage.address ?? reportedAddress, location };
  const analysis = isRecord(message.analysis) ? message.analysis : {};
  return { ...report, message: { ...message, analysis: { ...analysis, emergency_triage: nextTriage } } };
}
