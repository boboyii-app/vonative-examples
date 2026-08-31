import { DEFAULT_MAP_STYLE_URL } from "@/lib/constants";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export interface SentinelEnv {
  ASSETS?: Fetcher;
  DB?: D1Database;
  INCIDENT_CHANNEL?: DurableObjectNamespace;
  DEMO_OPERATOR_SECRET?: string;
  DEMO_OPERATOR_NAME?: string;
  VONATIVE_WEBHOOK_SECRET?: string;
  SENTINEL_ORGANIZATION_ID?: string;
  MAPTILER_GEOCODING_KEY?: string;
  MAPTILER_GEOCODING_COUNTRY?: string;
  MAPTILER_GEOCODING_PROXIMITY?: string;
  NEXT_PUBLIC_MAP_STYLE_URL?: string;
}

function localEnv(): SentinelEnv {
  const processEnv = typeof process === "undefined" ? undefined : process.env;
  const isLocalDevelopment =
    processEnv?.NODE_ENV === "development" || processEnv?.NODE_ENV === "test";
  return {
    DEMO_OPERATOR_SECRET:
      processEnv?.DEMO_OPERATOR_SECRET || (isLocalDevelopment ? "sentinel-demo" : undefined),
    DEMO_OPERATOR_NAME: processEnv?.DEMO_OPERATOR_NAME || "Demo Operator",
    VONATIVE_WEBHOOK_SECRET:
      processEnv?.VONATIVE_WEBHOOK_SECRET ||
      (isLocalDevelopment ? "sentinel-webhook-development" : undefined),
    SENTINEL_ORGANIZATION_ID: processEnv?.SENTINEL_ORGANIZATION_ID,
    MAPTILER_GEOCODING_KEY: processEnv?.MAPTILER_GEOCODING_KEY,
    MAPTILER_GEOCODING_COUNTRY: processEnv?.MAPTILER_GEOCODING_COUNTRY || "ng",
    MAPTILER_GEOCODING_PROXIMITY: processEnv?.MAPTILER_GEOCODING_PROXIMITY,
    NEXT_PUBLIC_MAP_STYLE_URL:
      processEnv?.NEXT_PUBLIC_MAP_STYLE_URL || DEFAULT_MAP_STYLE_URL,
  };
}

/**
 * OpenNext provides bindings through the request context in production. The
 * fallback keeps `next dev` useful without pretending that local memory is a
 * durable replacement for D1.
 */
export async function getRuntimeEnv(): Promise<SentinelEnv> {
  try {
    const context = await getCloudflareContext({ async: true });
    const boundEnv = context.env as SentinelEnv;
    const defaults = localEnv();
    return {
      ...boundEnv,
      DEMO_OPERATOR_NAME: boundEnv.DEMO_OPERATOR_NAME || defaults.DEMO_OPERATOR_NAME,
      NEXT_PUBLIC_MAP_STYLE_URL:
        boundEnv.NEXT_PUBLIC_MAP_STYLE_URL || defaults.NEXT_PUBLIC_MAP_STYLE_URL,
    };
  } catch {
    return localEnv();
  }
}

export function getMapStyleUrl(): string {
  const processEnv = typeof process === "undefined" ? undefined : process.env;
  return (
    processEnv?.NEXT_PUBLIC_MAP_STYLE_URL ||
    DEFAULT_MAP_STYLE_URL
  );
}
