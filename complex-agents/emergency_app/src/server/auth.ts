import type { Operator } from "../lib/types";
import type { SentinelEnv } from "./env";

export const SESSION_COOKIE = "sentinel_operator_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;
const DEFAULT_OPERATOR_ID = "operator-demo";

function textBytes(value: string): ArrayBuffer {
  return new TextEncoder().encode(value).buffer as ArrayBuffer;
}

function base64UrlEncode(value: string): string {
  const bytes = new Uint8Array(textBytes(value));
  let binary = "";
  bytes.forEach((byte: number) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): string | null {
  try {
    const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(padded);
    return new TextDecoder().decode(
      Uint8Array.from(binary, (character) => character.charCodeAt(0)),
    );
  } catch {
    return null;
  }
}

async function hmac(secret: string, value: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    "raw",
    textBytes(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  return crypto.subtle.sign("HMAC", key, textBytes(value));
}

function base64UrlEncodeBytes(value: ArrayBuffer): string {
  const bytes = new Uint8Array(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function verifyHmac(
  secret: string,
  value: string,
  encodedSignature: string,
): Promise<boolean> {
  try {
    const normalized = encodedSignature.replaceAll("-", "+").replaceAll("_", "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(padded);
    const signature = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const key = await crypto.subtle.importKey(
      "raw",
      textBytes(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    return crypto.subtle.verify("HMAC", key, signature, textBytes(value));
  } catch {
    return false;
  }
}

async function constantTimeSecretMatch(expected: string, supplied: string): Promise<boolean> {
  const [expectedDigest, suppliedDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", textBytes(expected)),
    crypto.subtle.digest("SHA-256", textBytes(supplied)),
  ]);
  const left = new Uint8Array(expectedDigest);
  const right = new Uint8Array(suppliedDigest);
  let difference = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    difference |= (left[index] || 0) ^ (right[index] || 0);
  }
  return difference === 0;
}

function configuredSecret(env: SentinelEnv, key: "demo" | "webhook"): string | null {
  const configured = key === "demo" ? env.DEMO_OPERATOR_SECRET : env.VONATIVE_WEBHOOK_SECRET;
  if (configured) return configured;
  const isLocalDevelopment =
    typeof process !== "undefined" &&
    (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test");
  // A fallback is deliberately available only to `next dev` and unit tests.
  // A deployed Worker without a secret must fail closed, rather than signing
  // cookies with a publicly guessable empty key.
  if (isLocalDevelopment) {
    return key === "demo" ? "sentinel-demo" : "sentinel-webhook-development";
  }
  return null;
}

function configuredOperator(env: SentinelEnv): Operator {
  return {
    id: DEFAULT_OPERATOR_ID,
    name: env.DEMO_OPERATOR_NAME || "Demo Operator",
  };
}

export async function verifyDemoPasscode(
  passcode: string,
  env: SentinelEnv,
): Promise<Operator | null> {
  const secret = configuredSecret(env, "demo");
  if (!secret) return null;
  const isValid = await constantTimeSecretMatch(secret, passcode);
  return isValid ? configuredOperator(env) : null;
}

export async function createSessionCookie(env: SentinelEnv): Promise<string> {
  const secret = configuredSecret(env, "demo");
  if (!secret) throw new Error("DEMO_OPERATOR_SECRET is not configured");
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = `${DEFAULT_OPERATOR_ID}|${expiresAt}`;
  const encodedPayload = base64UrlEncode(payload);
  const signature = base64UrlEncodeBytes(
    await hmac(secret, encodedPayload),
  );
  const isLocalDevelopment =
    typeof process !== "undefined" && process.env.NODE_ENV === "development";
  return `${SESSION_COOKIE}=${encodedPayload}.${signature}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}${isLocalDevelopment ? "" : "; Secure"}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}

function readCookie(cookieHeader: string | null | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=") || null;
  }
  return null;
}

export async function operatorFromCookie(
  cookieHeader: string | null | undefined,
  env: SentinelEnv,
): Promise<Operator | null> {
  const secret = configuredSecret(env, "demo");
  if (!secret) return null;
  const rawCookie = readCookie(cookieHeader, SESSION_COOKIE);
  if (!rawCookie) return null;
  const [encodedPayload, signature] = rawCookie.split(".");
  if (!encodedPayload || !signature) return null;
  if (!(await verifyHmac(secret, encodedPayload, signature))) {
    return null;
  }

  const payload = base64UrlDecode(encodedPayload);
  if (!payload) return null;
  const [operatorId, expiresAt] = payload.split("|");
  if (operatorId !== DEFAULT_OPERATOR_ID || Number(expiresAt) <= Date.now() / 1000) {
    return null;
  }
  return configuredOperator(env);
}

export async function operatorFromRequest(
  request: Request,
  env: SentinelEnv,
): Promise<Operator | null> {
  return operatorFromCookie(request.headers.get("cookie"), env);
}

export async function verifyWebhookSecret(
  request: Request,
  env: SentinelEnv,
): Promise<boolean> {
  const supplied =
    request.headers.get("x-vonative-webhook-secret") ||
    request.headers.get("x-webhook-secret") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const secret = configuredSecret(env, "webhook");
  if (!supplied || !secret) return false;
  return constantTimeSecretMatch(secret, supplied);
}

export async function verifyCustomerWebhook(request: Request, rawBody: string, env: SentinelEnv): Promise<boolean> {
  const secret = configuredSecret(env, "webhook");
  const supplied = request.headers.get("x-webhook-signature");
  const timestamp = request.headers.get("x-webhook-timestamp");
  if (!secret || !supplied || !timestamp) return false;
  const timestampMs = Date.parse(timestamp);
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 5 * 60_000) return false;
  const signature = supplied.replace(/^sha256=/i, "");
  const bytes = new Uint8Array(await hmac(secret, rawBody));
  const expected = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return constantTimeSecretMatch(expected, signature);
}

export function operatorFromEnvironment(env: SentinelEnv): Operator {
  return configuredOperator(env);
}
