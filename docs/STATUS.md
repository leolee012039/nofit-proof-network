# Status — NoFit Proof Network

Last updated: **2026-11-06** (hosted demo live on Render + Neon; webhooks verified). Submission deadline: 2026-11-12 12:00 PST (2026-11-13 04:00 Taipei).

## Milestone report

```text
MILESTONE: P0 vertical slice + P1 outcome memory / decision replay (offline-verifiable)
IMPLEMENTED: Next.js 16 app (app/, components/, lib/); Postgres schema + RLS + integrity triggers
  (db/schema.ts, db/migrations/0000-0005); buyer intake; deterministic fit policy with versioned
  retrieval and citations (lib/policy, lib/knowledge); AI narrative layer (Claude structured outputs
  or offline evaluator, lib/ai); proof contracts with seller approval + buyer acceptance (scope hash);
  PayPal Sandbox Orders v2 client, capture verification, webhook verification + dedupe, reconcile
  (lib/paypal, lib/services/payments.ts, lib/services/webhooks.ts); labelled FIXTURE provider;
  JS SDK v6 checkout + redirect fallback (components/client/checkout-panel.tsx); deterministic proof
  runner with reproducible SHA-256 evidence (lib/proofs, npm run proof:replay); outcome memory;
  decision replay; knowledge base with versioned price presets; demo personas; demo reset;
  docs (README, ARCHITECTURE, DECISIONS, THREAT_MODEL, DEMO_SCRIPT, DEVPOST_SUBMISSION, JUDGE_TESTING).
TESTS EXECUTED: npm run lint (0 problems) · npm run typecheck (0 errors) · npm test (86/86 passed)
  · npm run build (success) · npm run test:e2e (2/2 passed incl. axe WCAG A/AA smoke on 5 pages)
  · fresh-clone install/build/start (pass) · npm run proof:replay digests match the UI.
PAYPAL SANDBOX STATE (updated 2026-11-06): order created + capture verified against real PayPal
  Sandbox (redirect flow, Sandbox personal buyer): 12/12 server checks, contract PROOF_QUEUED,
  a repeated capture request returned alreadyCaptured. IDs in the git-ignored LOCAL_SANDBOX_NOTES.md.
  JS SDK v6 loads and reports PayPal eligible; its popup flow has not yet been clicked through.
  Hosted demo (2026-11-06): the same flow on https://nofit-proof-network.onrender.com, paid to the
  seller, 12/12 checks; CHECKOUT.ORDER.APPROVED and PAYMENT.CAPTURE.COMPLETED webhooks delivered and
  verified by postback (ALREADY_CAPTURED); run 1 FAILED, run 2 PASSED, live re-assessment CONDITIONAL_FIT.
AI STATE (updated 2026-11-06): live Claude (claude-opus-5-5) verified: intake draft (8.8 s, every
  field backed by a quote) and assessment explanations, including the automatic re-assessment
  after run 2 passed (CONDITIONAL_FIT).
KNOWN BLOCKERS: none. Judge-only Sandbox buyer account still to create (owner, PayPal Developer Dashboard).
NEXT TASK: judge buyer account, click through the SDK v6 popup once, refresh README screenshots, record the video.
```

## Truthful feature status

| Area                                                                     | Status                                                                                            | Evidence                                                                         |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Buyer intake + validation                                                | Done                                                                                              | UI + Zod schema tests                                                            |
| Deterministic fit policy (12+ eval cases)                                | Done                                                                                              | `tests/unit/fit-policy.eval.test.ts` (14 cases)                                  |
| Retrieval with versions, citations, superseded docs, injection screen    | Done                                                                                              | eval cases 1, 8, 10                                                              |
| AI explanation (Claude, structured outputs)                              | **Verified live** 2026-11-06                                                                      | stubbed-client tests (fallback, refusal, truncation, overruled model) + live run |
| Offline evaluator (labelled)                                             | Done                                                                                              | UI badge "OFFLINE EVALUATOR"                                                     |
| Proof contract, seller approval, buyer acceptance, immutability          | Done                                                                                              | tenancy/transition tests + DB trigger                                            |
| PayPal Orders v2 server integration                                      | **Verified against Sandbox** 2026-11-06 (order, capture, 12/12 checks, repeat capture is a no-op) | fake PayPal HTTP server tests + live run (IDs in the git-ignored local notes)    |
| PayPal JS SDK v6 button                                                  | Loads in the browser and reports PayPal eligible; **popup flow not yet clicked through**          | redirect flow verified live                                                      |
| Webhook signature verification + dedupe + retry-safety                   | Implemented, **not verified with real PayPal deliveries** (needs the deployed URL)                | fake postback tests                                                              |
| FIXTURE provider (no credentials)                                        | Done, labelled everywhere                                                                         | E2E golden path                                                                  |
| Proof runner + evidence digest + replay CLI                              | Done                                                                                              | unit tests, CLI digest = UI digest                                               |
| Outcome memory + stale/tamper exclusion                                  | Done                                                                                              | eval + integration tests                                                         |
| Decision replay (NO_FIT → CONDITIONAL_FIT with outcome IDs)              | Done                                                                                              | scenario test, E2E                                                               |
| Tenant isolation (Postgres RLS)                                          | Done                                                                                              | raw-query RLS tests, E2E 404                                                     |
| Database state guards (contracts, runs, outcomes, requests, assessments) | Done                                                                                              | `tests/integration/ecc-review.test.ts`                                           |
| Demo reset / scripted storyline                                          | Done (localhost default only)                                                                     | fresh-clone check                                                                |
| Accessibility smoke                                                      | Done for 5 pages                                                                                  | axe in E2E (2 real issues found and fixed)                                       |
| Deployment                                                               | **Not done** (needs owner approval)                                                               | —                                                                                |
| LICENSE                                                                  | Done (MIT, owner-approved)                                                                        | `LICENSE`                                                                        |
| Public repo, video, Devpost                                              | **Not done** (needs owner approval)                                                               | drafts in `docs/`                                                                |

## Test evidence (2026-10-27, Windows 11, Node 24.14.1)

```
$ npm run lint        → exit 0 (0 problems)
$ npm run typecheck   → exit 0
$ npm test            → Test Files 8 passed (8) · Tests 86 passed (86)
$ npm run build       → ✓ Compiled successfully · 38 routes
$ npm run test:e2e    → 2 passed (golden path + cross-tenant 404), axe: no serious/critical violations
$ npm run proof:replay -- --fixture run_001
  → result FAILED (INSUFFICIENT_PERMISSION) · artifact digest 188be7546c276e82fdfb287be761db530967749b5d52ba9957236a2a07ad683c
$ npm run proof:replay -- --fixture run_002
  → result PASSED · artifact digest d25799c43dd434c3797460ff8709ce2da593181f730d043aea06bc249f4bfb2b
```

Fresh-clone check: source copied without `node_modules`, build output or database → `npm ci` → `npm run build` → `next start` → `/api/health` OK → demo reset + storyline → outcomes FAIL + PASS → replay `NO_FIT → CONDITIONAL_FIT`. No `.env` needed.

## Independent security review (same day)

A separate review of the payment and tenancy code found 8 issues; all were fixed with regression tests:

1. Two checkouts (SDK + redirect) for one contract could both be captured → one live order per contract (unique index), old order voided.
2. A cancelled contract could still be captured → cancel voids payable orders atomically; capture requires `PAYMENT_PENDING`; money on an inactive contract → `NEEDS_REVIEW`, never a proof.
3. A webhook failing mid-processing was later deduplicated and lost → event row removed on failure; concurrent duplicates get 409.
4. Early `PENDING/DENIED` webhooks could dead-end a payment → only `COMPLETED` provider orders change state.
   5–6. Global demo reset and fixture payments were on by default → now on by default only for localhost.
5. Demo login has no passwords → documented as an accepted demo risk (`THREAT_MODEL.md`).
6. Hardening: webhook size cap before reading, no internal details in rejections, capture lock token + 5-minute stale window, payee check recorded as "skipped" when not configured, refunds correlated via the capture link and cumulative total (partial vs full), append-only also blocks DELETE, each party can only write its own approval fields.

Other issues found while testing and fixed: conflicting policy documents were only detected if retrieved (now all current documents), two accessibility violations (contrast, focusable scroll regions), a dev-server reload loop caused by the embedded database living inside the project (moved to `~/.nofit-proof-network/`).

## ECC code review (2026-10-27)

Four parallel reviewers (security, database, silent failures, React/a11y) reported 0 critical, 5 high and about 30 medium/low findings. All were fixed; the important ones have regression tests in `tests/integration/ecc-review.test.ts` and `tests/unit/http-and-config.test.ts` (17 new tests).

- Payments: a database error after PayPal captured now ends in `CAPTURE_UNKNOWN` with "Do not pay again" (never "failed"); a redirect checkout that is reopened gets its PayPal link back; a new order is created at PayPal before the old one is voided; a revoked access token is refreshed once; provider errors log PayPal's `debug_id`.
- Webhooks: a PayPal outage during signature verification answers 502 (PayPal retries) instead of a silent 401; non-object bodies are rejected; processing failures are logged with the event id.
- Database (migrations 0004 + 0005): 14 indexes for RLS and timeline queries; one open contract per request; price/amount/max-runs CHECKs; the full contract state machine in SQL; approvals written once; proof runs `QUEUED→RUNNING→terminal` only; outcome records must match their completed run; tenants cannot rewrite requests, assessments or contract terms; audit counterparties must share a request.
- API: JSON bodies must be objects, `Content-Length` is checked before reading, fields are type-checked; unique-constraint races answer 409; a saved request survives a failed assessment (no duplicate resubmits).
- Config: a production build without `APP_BASE_URL` fails closed; a storyline reset in Sandbox mode is refused before wiping; real Postgres refuses to start if `app_tenant` cannot be used.
- Concurrency: every path locks payment rows before the contract row (no deadlock with capture finalize).
- UI / accessibility: capture results from the redirect and fixture pages use the server verdict (PENDING/DENIED are not shown as paid); fixture Cancel is disabled while capturing; copy button reports failures; intake form links errors to fields, focuses the first invalid field and uses fieldsets for radio groups; mobile menu closes after navigation; skip-to-content link; the storyline panel announces only its text.
- Refactor: the 465-line `evaluatePolicy` is split into rule-family functions; outputs for 20 representative inputs were byte-identical before and after.

Validation after the fixes: typecheck 0 errors · lint 0 problems · 86/86 tests · build OK · E2E 2/2 (axe clean) · proof digests unchanged · `npm audit --omit=dev` 0 vulnerabilities.

## UI restructure: answer first, evidence on demand (2026-10-27)

An Impeccable critique (two isolated reviewers) scored the workspace 22/40: every page showed all backend fields at equal volume, raw enums were the UI copy, and the storyline was never told in one place. The visual language (paper, ink sidebar, serif, stamp, receipt) was kept; the structure was rebuilt:

- **Request page:** a verdict hero (headline, the one main blocker and how to fix it, the page's only stamp) with the next step attached ($49 proof offer, or a teal "Resolved: the proof passed → See what changed"). Blockers and review items stay open; the written explanation, context, sources and audit trail are folded `Disclosure` sections.
- **Contract page:** a status hero with one sentence saying who acts next, a 6-step rail, and the single action available now (approve, accept, pay, or see the decision change). Runs read as a story (summary, steps, evidence folded); terms open only while they are being reviewed.
- **Decision Replay:** rebuilt as the finale: large before → after, one plain sentence naming the passing proof's conditions, the stamp animation, details folded.
- **Everywhere:** plain-language status labels (`lib/display.ts`; codes kept as tooltips or small mono), person names instead of user ids, nothing below 12px, `CONDITIONAL_FIT` shown as positive (teal), neutral demo banner that matches the payment mode, clickable storyline steps on the overview, card list instead of a sideways-scrolling table on phones, a "start here" persona for judges.
- Phone page length: request page 7,020 → ~3,200px, contract page 8,076 → ~3,550px.
- Dev fix: the E2E production build now uses its own `.next-e2e` folder (`NEXT_DIST_DIR`), because building into `.next` sent a running `next dev` into a reload loop.

Validation: typecheck 0 · lint 0 · 86/86 tests · E2E 2/2 with axe (one contrast failure found and fixed) · Impeccable detector 0 findings.

## Visual redesign: the evidence room (2026-10-30)

The owner judged that the paper-and-stamp look still did not read as a real product. The structure above was kept and the visual world was replaced (direction chosen on an Impeccable decision round; product context recorded in `PRODUCT.md`):

- **World:** every record is handled as court evidence. A cool bench-gray ground, white form sheets with ruled cells, ink, and yellow numbered exhibit markers (01 request, 02 verdict, 03 contract, 04 payment, 05+ proof runs).
- **Signature parts** (`components/ui.tsx`): `ExhibitTag` (the numbered A-frame marker), `SealStrip` (tamper tape carrying the record's SHA-256; dashed while pending, struck through when void), `Finding` (the verdict on a punched evidence tag, glyph plus colour), ruled `KeyValue` form cells, and the `Rail` custody strip (solid done, yellow current, dashed ahead, red blocked).
- **Pages:** the request verdict carries exhibit 02 and a "Logged" seal with the assessment's input hash; the $49 offer is exhibit 03; the contract seals at seller approval; runs are exhibits 05/06 sealed by their artifact digest; the audit trail is a numbered chain-of-custody form; the landing hero is a sealed evidence bag listing the demo storyline's exhibits.
- **Type and motion:** Archivo (width axis) for everything, JetBrains Mono only for hashes and codes, one size ramp (12/14/16/22/40). One motion grammar: the seal closes across a record when the page opens; on the replay the superseded verdict is struck through and the new one settles in. Reduced motion respected.
- The E2E port can be overridden with `E2E_PORT` when 3100 is taken locally (Docker/WSL relays).

Validation: typecheck 0 · lint 0 · 86/86 tests · E2E 2/2 with axe · Impeccable detector 0 findings.

## Outcome-memory loop check (2026-10-31)

A full check of the loop (proof result → outcome record → later decisions) ran eight probe scenarios against a fresh database. Same-buyer and cross-buyer reuse, the 90-day expiry, seller isolation and the guards against tampered or FAIL-only evidence all behaved as designed. Three gaps were found and fixed:

- **A passing run now re-assesses its own request** (ADR-013). Before, the saved verdict stayed "Not a fit" until someone clicked "Re-run assessment"; only the replay showed the change. The audit trail records it as "Fit re-assessed with the passing proof", citing the outcome. A FAIL does not trigger it.
- **Reuse consent is enforced.** `sharing_consents` was seeded but never read, so revoking had no effect. Outcomes are now used only when they carry the consent captured at contract acceptance and the buyer organization has not revoked it; a revoked outcome is listed as excluded with the reason. Migration `0006` lets the seller read (not change) the consent granted to it.
- **Replay reason codes no longer contradict each other.** `BLOCKER_CORROBORATED_BY_OUTCOME` is now emitted only while the blocker still stands, not next to `REMEDIATION_VERIFIED_BY_OUTCOME`.

Policy version is now `nofit-policy/2026.10.1`. New tests: `tests/integration/outcome-memory.test.ts`; the golden-path E2E now checks the saved verdict after the PASS. There is no revocation button yet: revoking is a database change by the buyer organization.

Validation: typecheck 0 · lint 0 · 91/91 tests · E2E 2/2 with axe.

## Competition readiness work (2026-11-04)

Contest requirements were first checked against the PayPal developer blog and contest listings, then on 2026-11-06 against the full Official Rules page (the Updates and FAQ pages sit behind a human-verification check and were not read; the owner should look at them). Official Rules, in short:

- **Deadline** 2026-11-12 12:00 PT (2026-11-13 04:00 Taipei). Judging 2026-12-01 to 2026-12-15; winners around 2026-12-21.
- **Project:** integrate the PayPal developer platform (free Sandbox) with an AI tool; "PayPal integration is central to the project". Must install and run consistently and work as shown in the video. New projects qualify; existing ones must be significantly updated.
- **Submission:** English text description; a functional demo (repository setup instructions **or** a hosted URL); a public GitHub/Bitbucket/GitLab repository with an open-source license file visible in the repository's About section; a public YouTube video under 3 minutes showing the app working, without third-party trademarks or copyrighted music.
- **Testing access** free of charge until judging ends, including any "test account credentials, API keys, or sandbox login details" needed. Judges may judge on the text, images and video alone.
- **Judging:** Stage One pass/fail (fits the theme, reasonably applies the PayPal APIs/SDKs). Stage Two, equally weighted: Technological Implementation, Design, Potential Impact, Innovation/Idea, Presentation; ties are broken in that order. AI-assisted analysis may be used.
- **Ownership:** the submission must be solely owned by the Entrant. A project can win at most one Grand Prize **or** one Honorable Mention, plus one Sponsor Prize (Render's prize covers any submission that uses Render).

- **AI does real work at the start of the flow** (ADR-014). New Assessment has a plain-language box: Claude drafts the intake from the buyer's words and quotes them per field; a deterministic guard drops unquoted claims and never assumes a permission. `lib/ai/intake.ts`, `lib/services/intake.ts`, `POST /api/intake/draft`. The golden-path E2E now starts from the sample request (offline extractor, labelled).
- **Hosted demo live** (ADR-015, ADR-018): <https://nofit-proof-network.onrender.com> on Render's free plan with a free Neon Postgres (Oregon). PGlite did not fit the 512 MB instance (out of memory on first deploy); on Postgres the server peaked at 128 MB in a 512 MB container. Secrets live in Render only. See `docs/DEPLOY.md`.
- **Public-deployment hardening:** the session cookie is `Secure` whenever the public URL is https (it previously looked only at `APP_BASE_URL`); `/api/health` no longer shows the server's database path outside localhost; live model calls are capped per hour and per day (`lib/ai/budget.ts`).

Readiness:

| Requirement           | State                                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Working prototype     | Done (golden path E2E)                                                                                                               |
| Meaningful AI         | **Verified live** 2026-11-06 (intake draft + explanations + automatic re-assessment)                                                 |
| Meaningful PayPal     | **Real Sandbox capture verified locally and on the hosted demo**, paid to the seller; webhooks verified; SDK v6 popup still to click |
| Public repo + license | **Published** 2026-11-06: github.com/leolee012039/nofit-proof-network (MIT detected by GitHub) |
| Hosted demo           | **Live** 2026-11-06: nofit-proof-network.onrender.com (Render free + Neon free) |
| Video < 3 min         | Script updated; **not recorded**                                                                                                     |
| Judge test access     | URL filled in; **judge-only Sandbox buyer login still to create** |
| Entrant = owner       | Decided 2026-11-06: enter as the organization TriloAi LLC (matches `LICENSE`), with the owner as Representative                      |
| Devpost entry         | Draft updated; **not submitted**                                                                                                     |

Validation: typecheck 0 · lint 0 · 104/104 tests · E2E 2/2 with axe.

## Judge-review fixes (2026-11-06)

An independent judge-style review scored the build 31/50 (Technological Implementation 7, Design 7, Potential Impact 5, Innovation 6, Presentation 6). Its two main questions: what does the $49 buy that the free check did not already say, and why do PayPal and AI never meet? The owner chose to answer both before the video.

- **Copy and clarity:** a condition is now stated as what must hold ("Holds if: the buyer's CRM administrator grants contacts.write…", with "Resolves: Required CRM write scope is missing" underneath), not as the old blocker. The AI explanation and the intake's quoted evidence are open by default. The landing page names the audience, PayPal and Claude in its first paragraph and trims the hedging; settings and login copy now describe the AI intake. The Devpost draft opens on a concrete buyer story and drops enum codes and over-claims ("impossible to bypass").
- **AI drafts what is sold** (ADR-016, `lib/ai/proof-brief.ts`): the proof brief, each question pinned to a runner check and shown next to that check's result after a run. Live run 2026-11-06: four questions mapped to S2–S5, honest "not covered" list, both model calls in parallel (16.8 s).
- **Sellers are paid directly** (ADR-017): Settings → Payouts, `payee` on the order, verification against the payee stored with the order. Verified against the fake PayPal server (payee named, wrong-payee capture refused, no run) and **live on Sandbox 2026-11-06**: a second Sandbox business account as the seller, 12/12 checks including payee, "Paid to Lumen Automation Studio" on the payment card, then run 1 FAILED, run 2 PASSED and the automatic re-assessment (IDs in the git-ignored local notes).
- Intake questions no longer repeat what the form already asks; duplicate checks are removed.

Validation: typecheck 0 · lint 0 · 117/117 tests · E2E 2/2 with axe.

## Known limitations

- Proof runs are simulations; they do not test real HubSpot/LINE/Google systems.
- Persona sessions are a demo identity system only.
- PGlite is single-connection; use `DATABASE_URL` for any shared deployment.
- `npm audit`: 4 moderate advisories in `drizzle-kit`'s bundled `esbuild` (dev-only CLI, not shipped to the app).
- No rate limiting, apart from the cap on live model calls.
- `next dev` (Next.js 16.4.3) can fall into a full-page reload loop on this Windows checkout: the dev server keeps sending `reloadPage: "HMR hash mismatch"`, so the PayPal SDK never finishes loading. Restarting sometimes clears it; 16.4.5 is available and may fix it. Production builds (`npm run build && npm start`) are not affected; use them for live checkout tests and the video.

## Next tasks (calendar)

| When (Taipei) | Task                                                                                                                             |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Oct 27–28     | Real Sandbox run with owner credentials (SDK v6 + redirect); fix differences; record IDs locally                                 |
| Oct 29–Nov 1  | Webhooks via a public URL (tunnel or approved deployment); verify `PAYMENT.CAPTURE.COMPLETED`, duplicate and bad-signature cases |
| Nov 2–5       | Live Claude explanations if a key is provided; UI polish; mobile pass                                                            |
| Nov 6–9       | Deployment (after approval) with real Postgres; judge walkthrough on the hosted URL                                              |
| Nov 10–11     | Feature freeze; record video per `DEMO_SCRIPT.md`                                                                                |
| Nov 12        | Owner reviews and submits                                                                                                        |
