# Sentinel NG Cloudflare Operations Dashboard

## Summary

Create a new `sentinel-ng` Next.js 16 application in this `emergency_app/` directory, deployed as the `sentinel-ng` Cloudflare Worker (suggested domain: `sentinel.vonative.com`). It will be a secure demo operator console for real-time emergency triage and human handoff, independent of the public Vonative Meet and Blog apps.

## Implementation Changes

- Build a Vonative-branded, desktop-first operator console with:
  - Demo sign-in backed by a Worker secret; no public incident access.
  - Overview metrics, live severity-filtered incident feed, MapLibre map centered on Abuja/Nigeria, and activity indicator.
  - Incident detail workspace: AI summary, confidence/source labels, structured facts, transcript, timeline, related reports, and map position.
  - Operator actions: acknowledge, assign, escalate, resolve, and mark/review a possible duplicate. Actions always require a human click; no autonomous dispatch or critical-incident merging.
  - A scenario launcher that streams curated emergency situations (including transcript revisions, classification, extraction, and escalation-ready incidents) into the dashboard in real time.

- Use Cloudflare-native infrastructure:
  - D1 stores incidents, reports, transcript segments, timeline entries, operator actions, assignments, and related-report links.
  - A Durable Object owns the live incident channel and broadcasts normalized incident updates through hibernatable WebSockets.
  - MapLibre renders interactive map markers and filter state; use a configured public raster/vector tile URL, with the provider URL isolated in environment configuration.
  - Wrangler configuration includes D1 and Durable Object bindings, local/production variables, Worker assets, and Cloudflare-compatible build/deploy scripts following the existing `boboyiiapp_meet` pattern.

- Define an event-driven, Vonative-ready backend boundary:
  - `POST /api/events/vonative` accepts authenticated normalized Vonative session/call events through a shared-secret header.
  - A typed event transformer converts call lifecycle, transcript, analysis, and recording-reference events into Sentinel updates, preserving the source event ID and received time for idempotency/auditability.
  - The scenario launcher emits the same normalized events, so demo behavior and future Vonative ingestion use one incident-processing path.
  - Keep the adapter credential-free beyond the webhook secret; direct Vonative credential/session provisioning and real telephony remain deferred.

- Use a concise incident model with `security | medical | disaster` category; supported PRD incident types; `critical | high | medium | low` severity; lifecycle status; location/coordinates; source-attributed extracted facts; confidence; timeline; and related-report confidence.
- Clearly label simulated data and unverified AI/caller claims. Preserve transcript wording and distinguish it from verified/operator-entered information.

## Test Plan

- Unit-test event normalization, idempotency, incident-state transitions, severity/filter behavior, and the rule preventing automatic critical merges.
- Add component tests for the feed, map-marker selection, incident detail labels, and every human handoff action.
- Add Worker/D1 integration tests for authenticated event ingestion, scenario progression, WebSocket broadcasts, and persisted timeline updates.
- Verify `npm run lint`, production build, and Cloudflare preview deployment; manually validate sign-in, scenario launch, real-time update propagation, map filtering, and operator actions.

## Assumptions

- This is a hackathon/demo console, not a public emergency service or dispatch system.
- A demo operator credential and webhook shared secret are supplied as Cloudflare Worker secrets.
- The first release uses deterministic simulated emergency scenarios; later Vonative webhooks can activate the same adapter without changing dashboard behavior.
- Existing `boboyiiapp_meet` and `boboyiiapp_blog` remain unchanged.

## Task List

### 1. Project bootstrap and deployment boundary

- [x] Scaffold the `sentinel-ng` Next.js 16 application in this directory with TypeScript, strict linting, Vitest, and the OpenNext Cloudflare scripts.
- [x] Add local environment examples and document that demo credentials and webhook secrets must be Worker secrets, never committed variables.
- [x] Configure Wrangler for the `sentinel-ng` Worker, generated assets, production route, D1 binding, Durable Object binding, migrations, and the existing OpenNext cache pattern.
- [x] Add the Cloudflare environment type declarations and the local-runtime fallback used by `next dev`.

### 2. Domain contract and persistence

- [x] Define typed categories (`security`, `medical`, `disaster`), supported incident types, severity levels, lifecycle statuses, locations, facts, transcript segments, timeline entries, related reports, and operator actions.
- [x] Define the normalized Vonative event contract with source event ID, received time, occurred time, call/session identifiers, incident identifier, and supported event kinds.
- [x] Create the D1 migration for incidents, reports, facts, transcript segments, timeline entries, operator actions, assignments, related-report links, and processed event IDs.
- [x] Implement a repository that reads/writes D1 records and provides deterministic seeded data when no local binding is available.
- [x] Preserve source attribution, simulated/unverified flags, transcript wording, revisions, and recording references in both the incident snapshot and audit tables.

### 3. Authentication and protected access

- [x] Implement Worker-secret-backed demo operator sign-in with a signed, HttpOnly, SameSite session cookie.
- [x] Protect incident, scenario, action, and WebSocket endpoints; return no incident data to unauthenticated callers.
- [x] Implement logout/session status and a restricted-console sign-in state.
- [x] Add constant-time comparisons for the operator and webhook shared secrets and document the local fallback clearly.

### 4. Event adapter and incident state machine

- [x] Normalize call lifecycle, transcript, analysis, recording-reference, and escalation-ready Vonative events, including supported aliases.
- [x] Enforce event-ID idempotency through `processed_events` and retain the original received time for auditability.
- [x] Process normalized events into incident creation, classification, fact extraction, transcript revisions, timeline updates, and recording references.
- [x] Keep AI/caller classifications unverified and ensure an escalation recommendation never changes lifecycle status by itself.
- [x] Make the no-automatic-merge policy explicit: critical incidents and possible duplicates can only be linked or reviewed by a human operator.
- [x] Add authenticated `POST /api/events/vonative` handling for single and batched events using the webhook shared-secret header.

### 5. Durable Object realtime channel

- [x] Implement the hibernatable `IncidentChannel` Durable Object with WebSocket upgrade, heartbeat response, broadcast, close, and error handling.
- [x] Broadcast one normalized incident-update message for created incidents, event updates, and operator actions.
- [x] Add the authenticated stream endpoint and a polling fallback for local development or unavailable realtime bindings.

### 6. Scenario launcher

- [x] Define deterministic market-fire, Airport Road collision, and flash-flood scenarios with transcript revisions, classification, extraction, related reports, and escalation-ready stages.
- [x] Make scenario stages emit through the same normalized event processor as Vonative webhooks.
- [x] Add authenticated launch/step endpoints with ordered run IDs and visible progression state.

### 7. Operator console UI

- [x] Build the Vonative-branded desktop-first Sentinel NG shell and responsive fallback layout.
- [x] Add overview metrics, severity-filtered/searchable live incident feed, status/category labels, and live/polling activity indicator.
- [x] Integrate MapLibre centered on Abuja/Nigeria with environment-configured style URL, severity markers, marker selection, popups, and filter synchronization.
- [x] Build the incident detail workspace with AI summary, confidence/source labels, structured facts, transcript revisions, timeline, related-report confidence, and location context.
- [x] Add explicit acknowledge, assign, escalate, resolve, and duplicate-review actions with audit feedback and no autonomous dispatch/merge behavior.
- [x] Add the scenario launcher, progress indicator, simulated-data warnings, unverified-claim warnings, and operator sign-out.

### 8. Verification and release

- [x] Unit-test normalization, aliases, idempotency, incident transitions, filtering, transcript revisions, and the critical-merge safety guard.
- [ ] Add component tests for feed filtering, map selection, detail labels, and every human handoff action.
- [ ] Add Worker/D1 integration coverage for authentication, event ingestion, scenario progression, WebSocket broadcasts, and timeline persistence.
- [x] Run ESLint and the Vitest suite; the current suite passes with 6 files and 15 tests.
- [x] Complete the production build/type check and fix any type, accessibility, or responsive-layout regressions; `npm run build` now completes successfully.
- [ ] Run a Cloudflare preview and manually verify sign-in, scenario streaming, realtime propagation, MapLibre filtering, audit updates, and operator actions.
- [x] Record deployment secrets, D1 setup, map-provider configuration, and demo safety limitations in the README.

## Definition of Done

- [x] An authenticated operator can launch a scenario or ingest a signed Vonative event and see the same incident update path in the feed, map, and detail workspace.
- [x] Retrying an event does not duplicate state or timeline entries, and every action is attributable to a human operator.
- [x] Critical incidents are never automatically dispatched, merged, or resolved; related reports remain visibly pending human review.
- [x] Local development works without Cloudflare bindings, while Wrangler preview/deploy uses D1 and the hibernatable Durable Object.

## Currently Left

Only the unchecked items in **Verification and release** remain incomplete:

1. Component-level coverage for feed filtering, MapLibre marker selection, detail labels, and each handoff action.
2. Worker/D1 integration coverage for authenticated ingestion, scenario progression, broadcasts, and persisted timelines.
3. Cloudflare preview and manual end-to-end validation with a real D1 ID, R2 bucket, Worker secrets, and an approved map style URL.
