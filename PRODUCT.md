# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary audience (confirmed 2026-10-30): PayPal AI Hackathon 2026 judges.** They watch a public demo video under 3 minutes, then open the running app (hosted or local) and click through it themselves. They must understand in seconds that a $49 paid, bounded proof turns a "no fit" into a decision backed by evidence.
- **In-product roles (fictional personas):** a business **buyer** who wants an automation (LINE + HubSpot + Google Sheets CRM updates) and must decide whether to buy a $3,000 implementation; a **seller/admin** who holds versioned technical knowledge, approves proof scope and price, and can override the AI with a reason; a read-only **reviewer**.

## Product Purpose

NoFit Proof Network turns a risky automation purchase into a small, paid, bounded technical proof. A buyer describes an integration; a deterministic policy engine checks it against the seller's versioned knowledge and an AI explains the result with citations. When the full scope is blocked by a fixable constraint, the seller offers a fixed-price proof contract; the buyer pays through PayPal Sandbox Checkout; a simulated test runs only after a server-verified capture; the hashed evidence, failures included, changes the next decision. Success for the hackathon: judges grasp and believe the loop (request → verdict → paid proof → fail → retest pass → decision changes) and see it working for real.

## Positioning

"Don't buy promises. Buy proof." The mechanism nobody else ships: payment buys **evidence**, not success. A failed proof is a valid, stored outcome, and recorded outcomes change the next fit decision (Decision Replay: NO_FIT → CONDITIONAL_FIT, citing outcome IDs and reason codes). The deterministic policy decides; the AI only explains.

## Operating Context

- Judges: watch the video, read the Devpost entry (English), then use the safe demo login (persona picker, Maya the buyer first) and follow the storyline: Overview → request → proof contract → runs → replay.
- Demo storyline is fixed: run_001 FAILS (missing `contacts.write` permission), the seller records an environment change, run_002 PASSES, the decision replays.
- Payments: PayPal Sandbox Orders v2 when credentials exist; otherwise a FIXTURE provider that is always labelled "Simulated — not PayPal".
- Submission deadline 2026-11-12 12:00 PST. English UI and docs.

## Capabilities and Constraints

- Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4, Drizzle + PGlite/Postgres with row-level security. Playwright E2E with axe must keep passing; `data-testid` attributes are part of the test contract.
- PayPal Sandbox only; any production indicator fails closed. No live money, no escrow, no refunds automation.
- HubSpot / LINE / Google Sheets are never accessed; the proof runner is a deterministic simulator.
- State machine: DRAFT → PROPOSED → SELLER_APPROVED → BUYER_ACCEPTED → PAYMENT_PENDING → PAID → PROOF_QUEUED → RUNNING → PASSED | FAILED | INCONCLUSIVE.
- Status vocabulary shown to people in plain words (Not a fit, Conditional fit, Proof passed…); raw codes stay available on demand.

## Brand Commitments

- Name: **NoFit Proof Network** (short: NoFit). Tagline: "Don't buy promises. Buy proof." Built by TriloAi LLC for the hackathon.
- Never present fixture payments as PayPal. Never imitate PayPal's own branding beyond the official Sandbox button/SDK.
- Voice: plain, exact, unhyped; failures are stated as evidence, not hidden.

## Evidence on Hand

- All organizations, people, prices and outcomes are fictional and must stay labelled as such. `$49` and `$3,000` are demo prices.
- No customers, revenue, traction, benchmarks or "model learned" metrics exist; never invent them.
- Real artifacts: proof digests (SHA-256) from the simulator, audit trail, Sandbox order IDs when credentials are provisioned locally.

## Product Principles

1. Answer first, evidence on demand: every page leads with the decision and the next action.
2. Evidence over promises: payment is proof it was paid for, never proof it works.
3. Failure is a result: a failed run is shown as plainly as a pass.
4. Honest labelling beats polish: simulated, offline, fictional are always visible.
5. A human approves money and scope; the system never decides payments.

## Accessibility & Inclusion

WCAG 2.2 AA: axe checks run in E2E; minimum text 12px; status never conveyed by color alone; reduced-motion respected.
