import { describe, expect, it } from "vitest";
import {
  createSessionCookie,
  operatorFromCookie,
  verifyDemoPasscode,
  verifyWebhookSecret,
} from "./auth";

const env = {
  DEMO_OPERATOR_SECRET: "operator-secret",
  DEMO_OPERATOR_NAME: "Operator Ada",
  VONATIVE_WEBHOOK_SECRET: "webhook-secret",
};

describe("operator authentication", () => {
  it("accepts the configured demo secret and rejects a wrong one", async () => {
    expect(await verifyDemoPasscode("operator-secret", env)).toMatchObject({ name: "Operator Ada" });
    expect(await verifyDemoPasscode("wrong", env)).toBeNull();
  });

  it("round-trips a signed session cookie", async () => {
    const cookie = await createSessionCookie(env);
    expect(await operatorFromCookie(cookie, env)).toMatchObject({ id: "operator-demo" });
    const tampered = cookie.replace(/\.[A-Za-z0-9_-]+/, ".invalid-signature");
    expect(await operatorFromCookie(tampered, env)).toBeNull();
  });

  it("validates the webhook shared-secret header", async () => {
    expect(await verifyWebhookSecret(new Request("https://sentinel.test", { headers: { "x-vonative-webhook-secret": "webhook-secret" } }), env)).toBe(true);
    expect(await verifyWebhookSecret(new Request("https://sentinel.test", { headers: { "x-vonative-webhook-secret": "wrong" } }), env)).toBe(false);
  });
});
