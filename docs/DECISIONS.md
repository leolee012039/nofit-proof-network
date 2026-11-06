# Architecture Decision Records

Each record: context → decision → consequences. Dates are 2026-10-26 unless noted.

## ADR-001 — Single Next.js App Router app, service layer under `lib/`

**Context.** Hackathon timeline, judges must run it from a fresh clone. **Decision.** One Next.js 16 (App Router, TypeScript strict) app. Route handlers stay thin; all business rules live in `lib/services/*` and are tested directly. **Consequences.** One process to run and deploy. No separate API server.

## ADR-002 — Embedded Postgres (PGlite) by default, real Postgres via `DATABASE_URL`

**Context.** Docker was not running on the build machine; judges may not have Postgres. RLS and triggers are core to the security story, so SQLite or in-memory maps were not acceptable. **Decision.** Drizzle ORM over PGlite (Postgres compiled to WASM) persisted outside the project folder (`~/.nofit-proof-network/pglite-<checkout hash>`; database writes inside the project made the Next.js dev watcher recompile and refresh in a loop), auto-migrated and auto-seeded on first boot. `DATABASE_URL` switches to `postgres-js` with the same schema and migrations. **Consequences.** `npm install && npm run dev` works with zero services. PGlite is single-connection, which serializes transactions (fine for a demo, not for production scale). Serverless hosts with ephemeral disks should use `DATABASE_URL`.

## ADR-003 — Cache Components disabled

**Context.** Next.js 16 scaffolds `cacheComponents: true`, which requires every cookie read to sit behind Suspense with cache directives. Every workspace page here is session-scoped and tenant-specific. **Decision.** Opt out; all workspace routes render per request. **Consequences.** Simpler, safer rendering model (no risk of caching one tenant's data for another). Slightly less prefetch performance, irrelevant at demo scale.

## ADR-004 — Tenant isolation in Postgres (RLS), not only in code

**Decision.** Request-scoped transactions run `set local role app_tenant` and set `app.org_id` / `app.role`. Policies restrict every tenant table to the organizations party to a row; write policies also require a writing role, so the read-only reviewer cannot write. Payment tables are read-only to tenants: only the payment service (table owner) writes them. **Consequences.** A bug in a service query cannot leak another tenant's rows. Trusted paths (verified webhooks, seeding) use `withSystem` explicitly and are few and reviewed.

## ADR-005 — Deterministic policy decides, the model explains

**Context.** The brief requires that hard blockers cannot be overruled by model prose and that injected documents have no effect. **Decision.** `evaluatePolicy` computes status, findings, citations and the proof offer before any model call. The model (Claude via structured outputs) only fills explanation fields; its own suggested status is stored for audit and ignored. Offline deterministic evaluator when no key or on any model failure. **Consequences.** Decisions are reproducible and testable without network access. The AI adds clarity and questions, not authority.

## ADR-006 — Outcome evidence can change a decision only through explicit, verified rules

**Decision.** A remediable blocker becomes a `condition` only when an authorized outcome record with a valid recomputed evidence digest, matching API version and unexpired TTL passed under exactly the remediated conditions (`contacts.write` + approval gate). Failures can corroborate a blocker but never upgrade a decision. **Consequences.** Decision Replay shows a concrete diff with outcome IDs and reason codes; no invented "accuracy gain" metric.

## ADR-007 — PayPal integration shape

**Decision.** Orders v2 over `fetch` (no server SDK), sandbox host allow-list, `intent: CAPTURE`, amount from the stored contract only, idempotent `PayPal-Request-Id` for create and capture, compare-and-set lock on the local payment row, re-read the order before and after capture, verification of amount/currency/reference/custom id/payee before `PAID`, webhook postback verification before storage, event-id dedupe, record-only refunds. Buyer approval via JS SDK v6 (`createInstance({clientId})` + one-time payment session) with a redirect fallback. **Consequences.** Webhooks are a confirmation channel, not the only path; the app distinguishes "captured, webhook pending" from "not paid". JS SDK v6 path is **not yet verified against live Sandbox** (no credentials during build) — the redirect fallback reduces risk.

## ADR-008 — Labelled FIXTURE payment provider when credentials are absent

**Context.** Judges without Sandbox credentials must still explore the flow; the brief forbids passing fixtures off as PayPal. **Decision.** `FixtureGateway` implements the same interface, stores its "provider" state in a table tenants cannot read, uses `FIXTURE-` ids, never accepts webhooks, and every UI surface labels it "FIXTURE — NOT PAYPAL". It runs through the identical capture/verification path. **Consequences.** End-to-end tests run offline. Mode mismatches (fixture order in sandbox mode) are refused.

## ADR-009 — Deterministic proof simulator with reproducible evidence

**Decision.** The runner models HubSpot-style scopes and an approval gate; it receives only `(testCase, environment)` — no DB handle or credentials. Logs use deterministic offsets; the artifact digest is SHA-256 over canonical JSON. `npm run proof:replay` re-derives any digest. Completed runs and outcome records are immutable (DB triggers). **Consequences.** Evidence is auditable and reproducible; it is explicitly simulated and labelled so.

## ADR-010 — MIT license (approved by the owner, 2026-10-26)

**Decision.** MIT, copyright TriloAi LLC, in `LICENSE`. All runtime dependencies are permissive (MIT / Apache-2.0 / BSD-style). **Consequences.** The repository satisfies the hackathon's open-source license requirement once the owner publishes it.

## ADR-011 — Demo authentication = signed persona sessions

**Decision.** HMAC-signed, 12-hour, httpOnly, SameSite=Lax cookies for four fictional personas; mutations also check the `Origin` header. `SESSION_SECRET` is required for non-localhost production. **Consequences.** Reliable role boundaries for judges without account creation. Not a production identity system (Supabase Auth would replace it).

## ADR-012 — Prices are versioned catalog data, frozen per contract

**Decision.** Changing a price preset creates a new capability version; approved contracts keep their frozen price (trigger-enforced). **Consequences.** A seller cannot change the price of an accepted contract, and the client never supplies an amount.

## ADR-013 — A passing proof re-assesses its request; reuse consent is revocable (2026-10-31)

**Decision.** When a run passes, the System Agent re-assesses the request the proof was bought for, after the run's transaction commits, through the same ADR-006 rules (audit action `assessment.updated_by_outcome`). A failing run does not trigger it. Outcomes count as evidence only if they carry the reuse consent captured at contract acceptance and the buyer organization has not revoked it in `sharing_consents` (an inactive row and no active one). **Consequences.** The saved verdict moves to `CONDITIONAL_FIT` without a manual step, and the replay and the request page agree. If the automatic re-assessment fails, the proof result still stands and the failure is logged; "Re-run assessment" remains the fallback. A revocation stops reuse everywhere, including the buyer's own later requests (fail closed).

## ADR-014 — Plain-language intake: the model drafts, quotes are the guard (2026-11-04)

**Decision.** Claude turns the buyer's own words into a draft of the structured intake. Every tool, operation and non-default approval choice must carry a quote; `draftFromExtraction` keeps only claims whose quote is a real span of the buyer's text, limits permission names to the simulated vocabulary, and asks for budget and timeline instead of guessing. Nothing is stored until the buyer submits the reviewed form. A labelled offline keyword extractor drafts the form without a key or when the model fails. **Consequences.** AI does real work at the start of the flow while the decision stays deterministic and testable; a model that invents a permission or a tool is caught by a string check, not by trust.

## ADR-015 — Free hosted demo with an ephemeral embedded database and a model-call cap (2026-11-04; database superseded by ADR-018)

**Decision.** The judge demo runs on Render's free plan (`render.yaml`) with PGlite on the instance disk, reseeded on every start; Render's free Postgres is not used because it expires after 30 days, inside the judging window. The public URL comes from `RENDER_EXTERNAL_URL`. Live model calls are capped per hour and per day in process memory; over the cap the labelled offline path runs. **Consequences.** No cost and no stale data, at the price of a one-minute cold start after 15 idle minutes and a shared, resettable demo world. The cap bounds the bill but is not a substitute for a spend limit in the Anthropic Console.

## ADR-016 — Claude drafts the proof brief; every question is pinned to a real check (2026-11-06)

**Context.** An independent judge-style review asked what the $49 buys that the free policy check does not, and noted that AI never touched the commercial step. **Decision.** When the policy offers a proof, Claude drafts its buyer-facing brief (a summary, two to four questions, what is not covered) from the request and the blocking findings. Each question must name one of the five checks the simulated runner performs (`PROOF_CHECKS`, kept in sync with `runner.ts` by a unit test); a draft with fewer than two distinct checks or an over-claim (a guarantee, or "your real account") is replaced by a labelled offline template. The brief is part of the sealed contract scope, and after a run each question shows that check's result. Price, test case, environment and pass criteria remain the policy's. The brief and the explanation are drafted in parallel, and only when the assessment can open a new contract. **Consequences.** AI now shapes what is sold, a human (the seller) approves it before the buyer sees it, and every AI sentence about the test can be checked against evidence.

## ADR-017 — Sellers are paid directly through `payee` (2026-11-06)

**Context.** The same review noted that payments reached the app's own PayPal account, so the seller doing the work was never paid. **Decision.** A seller may set its PayPal merchant ID (Settings → Payouts; `organizations.paypal_merchant_id`, format-checked in the database, writable only by that organization's own users). Orders then carry `purchase_units[].payee.merchant_id`; the payee is stored on the order row at creation and capture verification checks against it, so a payout change mid-checkout cannot make a valid capture fail or a wrong payee pass. Without a payout account, behaviour is unchanged. **Consequences.** PayPal now moves money from buyer to seller, and the existing payee check is enforced instead of skipped. Whether PayPal Sandbox accepts a third-party payee for this app is verified live separately (see STATUS).

## ADR-018 — The hosted demo uses free Neon Postgres, not embedded PGlite (2026-11-06)

**Context.** The first Render deploy built but was stopped with "Out of memory (used over 512Mi)" as soon as the health check opened the database. Measured in a Linux container capped at 512 MB (the free instance's limit): Next.js alone used about 60 MB, opening PGlite raised the server to about 490 MB, and one full flow passed 830 MB. Prebuilding the PGlite data directory at build time did not help; the paid Starter plan has the same 512 MB. The same build on Postgres peaked at 128 MB across three full runs. **Decision.** The hosted demo connects to a free Neon project in the same region through `DATABASE_URL` (pooled; the app's tenant settings are all transaction-local, which PgBouncer transaction pooling supports). It is migrated and seeded once from a workstation; `DEMO_SELLER_PAYPAL_MERCHANT_ID` presets the fictional seller's Sandbox payout account on seed and on every demo reset. Local runs and tests keep PGlite. Render's free Postgres stays unused (30-day expiry). **Consequences.** The demo fits the free instance with room to spare, data survives restarts and spin-downs, and Postgres row-level security runs on a real server. A shared demo world can now drift between visits; Settings → Reset to clean start restores it.
