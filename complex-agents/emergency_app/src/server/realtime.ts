import type { IncidentUpdateMessage } from "@/lib/types";
import type { SentinelEnv } from "./env";

const CHANNEL_NAME = "sentinel-incidents";

export async function broadcastIncidentUpdate(
  env: SentinelEnv,
  message: IncidentUpdateMessage,
): Promise<void> {
  if (!env.INCIDENT_CHANNEL) return;

  try {
    const id = env.INCIDENT_CHANNEL.idFromName(CHANNEL_NAME);
    const stub = env.INCIDENT_CHANNEL.get(id);
    await stub.fetch("https://sentinel.internal/broadcast", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(message),
    });
  } catch {
    // Realtime is an enhancement. D1 persistence and the polling fallback
    // remain available if a preview does not have the DO binding.
  }
}

export function channelIdName(): string {
  return CHANNEL_NAME;
}
