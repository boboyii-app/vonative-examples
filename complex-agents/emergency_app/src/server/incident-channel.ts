/// <reference types="@cloudflare/workers-types" />

import { DurableObject } from "cloudflare:workers";
import type { IncidentUpdateMessage } from "../lib/types";

/**
 * Hibernatable Durable Object for the operator console's incident stream.
 * The worker only sends normalized updates here; clients receive one stable
 * message shape regardless of whether data came from a webhook or a scenario.
 */
export class IncidentChannel extends DurableObject<CloudflareEnv> {
  private readonly state: DurableObjectState;

  constructor(state: DurableObjectState, env: CloudflareEnv) {
    super(state, env);
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/broadcast" && request.method === "POST") {
      let message: IncidentUpdateMessage;
      try {
        message = (await request.json()) as IncidentUpdateMessage;
      } catch {
        return new Response("Invalid broadcast", { status: 400 });
      }
      this.broadcast(message);
      return Response.json({ ok: true });
    }

    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }

    const pair = new WebSocketPair();
    this.state.acceptWebSocket(pair[1]);
    pair[1].send(JSON.stringify({ type: "channel.ready", emittedAt: new Date().toISOString() }));
    return new Response(null, {
      status: 101,
      webSocket: pair[0],
    } as ResponseInit & { webSocket: WebSocket });
  }

  webSocketMessage(webSocket: WebSocket, message: string | ArrayBuffer): void {
    if (typeof message !== "string") return;
    try {
      const parsed = JSON.parse(message) as { type?: string };
      if (parsed.type === "ping") {
        webSocket.send(JSON.stringify({ type: "pong", emittedAt: new Date().toISOString() }));
      }
    } catch {
      // Ignore malformed client messages. This channel is server-broadcast only.
    }
  }

  webSocketClose(): void {
    // Hibernation removes closed sockets from getWebSockets automatically.
  }

  webSocketError(): void {
    // Hibernation removes errored sockets from getWebSockets automatically.
  }

  private broadcast(message: IncidentUpdateMessage): void {
    const serialized = JSON.stringify(message);
    for (const webSocket of this.state.getWebSockets()) {
      try {
        webSocket.send(serialized);
      } catch {
        webSocket.close(1011, "Unable to deliver incident update");
      }
    }
  }
}
