/// <reference types="@cloudflare/workers-types" />

// OpenNext writes .open-next/worker.js during `opennextjs-cloudflare build`.
// This thin wrapper adds the hibernatable incident channel to that worker.
// @ts-expect-error OpenNext generates this module before Wrangler bundles the worker.
import nextWorker from "./.open-next/worker.js";
import { operatorFromRequest } from "./src/server/auth";
import { IncidentChannel as BaseIncidentChannel } from "./src/server/incident-channel";

/** Top-level export required for Cloudflare's Durable Object binding scanner. */
export class IncidentChannel extends BaseIncidentChannel {}

type WorkerEnvironment = Parameters<typeof operatorFromRequest>[1] & {
  INCIDENT_CHANNEL?: DurableObjectNamespace;
};

type OpenNextWorker = {
  fetch(request: Request, env: WorkerEnvironment, context: ExecutionContext): Promise<Response>;
};

const handler = nextWorker as OpenNextWorker;

const worker = {
  async fetch(request: Request, env: WorkerEnvironment, context: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/incidents/stream" && request.headers.get("upgrade")) {
      const operator = await operatorFromRequest(request, env);
      if (!operator) return new Response("Authentication required", { status: 401 });
      if (!env.INCIDENT_CHANNEL) return new Response("Realtime channel unavailable", { status: 503 });
      const id = env.INCIDENT_CHANNEL.idFromName("sentinel-incidents");
      return env.INCIDENT_CHANNEL.get(id).fetch(request);
    }
    return handler.fetch(request, env, context);
  },
};

export default worker;
