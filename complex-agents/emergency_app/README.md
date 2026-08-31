# Sentinel NG

Sentinel NG is a Vonative-branded operator console for real emergency-call triage and human handoff. It is intentionally **not** a public emergency service: AI and caller claims remain unverified until an operator confirms them, and no responder dispatch or automatic incident merge is implemented.

## Local development

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open <http://localhost:3000>. The local demo passcode is `sentinel-demo` unless `DEMO_OPERATOR_SECRET` is set in `.env.local`.

Without Cloudflare bindings, the app uses an empty process-local store and polling. Send a signed final-call webhook for local testing; D1 and the Durable Object are used automatically when the app is run through the OpenNext/Wrangler preview.

## Cloudflare setup

1. Create a D1 database and put its ID in `wrangler.jsonc`:

   ```bash
   npx wrangler d1 create sentinel-ng
   ```

2. Replace `replace-with-production-d1-database-id` in `wrangler.jsonc` with the returned ID, then apply all migrations (including `0003_geocoding.sql`):

   ```bash
   npx wrangler d1 migrations apply sentinel-ng --remote
   ```

3. Create the OpenNext incremental-cache bucket:

   ```bash
   npx wrangler r2 bucket create sentinel-ng-opennext-cache
   ```

4. Set secrets; do not put these values in `vars` or commit a `.dev.vars` file:

   ```bash
   npx wrangler secret put DEMO_OPERATOR_SECRET
   npx wrangler secret put VONATIVE_WEBHOOK_SECRET
   ```

5. Set `NEXT_PUBLIC_MAP_STYLE_URL` to an approved public MapLibre-compatible style URL if the default demo tiles are not appropriate.
6. Build and preview/deploy:

   ```bash
   npm run preview
   npm run deploy
   ```

Configure the emergency organization customer webhook to send `end-of-call-report` to `POST /api/events/vonative`. The webhook service signs the exact JSON body with `X-Webhook-Signature: sha256=<hex>` and supplies `X-Webhook-Timestamp`; Sentinel rejects unsigned/stale reports and deduplicates the report's stable `event_id`. Set `SENTINEL_ORGANIZATION_ID` to reject reports from other organizations.

## Real-call event contract

The webhook service sends one finalized report after the runtime-agent persists a completed emergency call and post-call analysis finishes (or fails). Use [docs/emergency-analysis-profile.json](docs/emergency-analysis-profile.json) as the dedicated emergency workflow/assistant analysis configuration.

```json
{
  "message": {
    "type": "end-of-call-report",
    "event_id": "end-of-call-report:session-123:2026-08-30T12:00:00.000Z",
    "call": { "id": "session-123", "metadata": { "organization_id": "emergency-organization-id" } },
    "artifact": { "transcript": "...", "recording_reference": "session:session-123" },
    "analysis_status": "completed",
    "analysis": { "emergency_triage": { "category": "medical", "type": "road_accident", "severity": "high" } }
  }
}
```

Related reports are always stored as `proposed`; reviewing one is an explicit operator action and never merges critical incidents automatically. Recording references are opaque session identifiers; browsers must not receive a provider recording URL.

## Emergency geocoding

Set `MAPTILER_GEOCODING_KEY` as a Sentinel Worker secret (`npx wrangler secret put MAPTILER_GEOCODING_KEY`). After Sentinel verifies the signed final-call report, its worker sends the caller's extracted address, landmark, city, state, and country to MapTiler and adds provider-derived coordinates with a `matched`, `ambiguous`, `unresolved`, or `not_requested` state. Sentinel does not render ambiguous or unresolved locations as markers. Never have the analysis model generate latitude or longitude.
