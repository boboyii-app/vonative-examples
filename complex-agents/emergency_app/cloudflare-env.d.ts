/// <reference types="@cloudflare/workers-types" />

interface CloudflareEnv {
  ASSETS?: Fetcher;
  DB: D1Database;
  INCIDENT_CHANNEL: DurableObjectNamespace;
  DEMO_OPERATOR_SECRET: string;
  DEMO_OPERATOR_NAME: string;
  VONATIVE_WEBHOOK_SECRET: string;
  MAPTILER_GEOCODING_KEY: string;
  MAPTILER_GEOCODING_COUNTRY: string;
  MAPTILER_GEOCODING_PROXIMITY: string;
  NEXT_PUBLIC_MAP_STYLE_URL: string;
}
