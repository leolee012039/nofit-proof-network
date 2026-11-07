# Devpost submission draft — NoFit Proof Network

> Draft for owner review. Do not submit until the owner confirms every field, the public repository (with license), and the public YouTube video (< 3 minutes).

**Title:** NoFit Proof Network

**One-sentence pitch:** Before a business commits $3,000 to an automation project, NoFit lets it pay $49 through PayPal for a bounded test of the one thing that could break it, and remembers the result for the next buyer.

**Links:** Demo URL: `<pending deployment approval>` · Repository: `<pending public repo approval>` · Video: `<pending YouTube upload>`

**Entrant:** TriloAi LLC (organization), entered by its Representative. The code is TriloAi LLC's own work and is released under the MIT license.

**New project:** built from scratch during the Submission Period (development started 2026-10-26); no code predates the hackathon.

**Built with:** PayPal Orders v2 (Sandbox), PayPal JavaScript SDK v6, PayPal webhooks, Claude API (`claude-opus-5-5`), Next.js, TypeScript, PostgreSQL / PGlite, Drizzle ORM, Tailwind CSS, Playwright, Vitest, Render (hosting).

**Testing instructions:** hosted demo at <https://nofit-proof-network.onrender.com> (choose a fictional persona, no password). To pay at checkout, log in to PayPal Sandbox with this judge-only **personal** account (Sandbox test money only): `<owner pastes the Sandbox email and password here, in Devpost only>`. Full guide, including a no-credentials local walkthrough: `docs/JUDGE_TESTING.md` in the repository.

## Inspiration

Maya runs operations at a small logistics company. An automation agency quotes her $3,000 to update HubSpot automatically whenever a customer messages her LINE account. Nobody checks that her HubSpot app can only _read_ contacts, or that the agency's own policy needs a human to approve changes to customer records. Three weeks in, the project stalls, and both sides blame each other.

Projects like this fail on things nobody checked before the contract: a missing permission, an approval rule, an expired API version. Buyers either take a leap of faith or walk away; sellers either over-promise or lose the deal. We wanted a small, honest unit of commerce in between: pay a little to find out.

## What it does

1. **Maya describes what she wants in plain English.** Claude turns it into a structured request and shows the sentence behind every field, so it cannot invent a permission she never mentioned.
2. **A policy engine checks the request** against the agency's versioned documentation. The answer: not a fit as written, because her integration can only read contacts. Every reason cites its source.
3. **Instead of walking away, the agency offers a $49 proof.** Claude drafts what the test will answer for Maya, each question pinned to a check the test really runs; price and pass criteria stay fixed by policy. The agency approves the sealed scope, Maya accepts it and pays through PayPal Checkout (Sandbox), with the agency named as payee. The test cannot start until the server has verified the capture with PayPal, including that the money reached the agency.
4. **Run 1 fails on the missing permission**, exactly as predicted, and that failure is kept as evidence. After the permission and an approval step are added, run 2 passes. It checks what a document review cannot: that the update waits for a person's approval and leaves an audit entry. (The test environment is simulated.)
5. **The passing result re-assesses Maya's request on its own:** a fit, on verified conditions. The next buyer with the same setup gets that answer without paying for another test.

**Why it matters.** The buyer spends $49 instead of taking a $3,000 leap of faith. The agency gets a paid first step instead of a lost deal, plus evidence it can reuse (with the buyer's consent) for every similar request.

## How we built it

- Next.js 16 App Router, TypeScript strict, Tailwind CSS, Drizzle ORM.
- Postgres with row-level security per organization (embedded PGlite by default, any Postgres via `DATABASE_URL`) and database triggers that enforce the money-critical rules even if application code has a bug: no proof without a captured payment, no tenant can set `PAID`, frozen scope and price, append-only outcomes.
- **PayPal:** Orders v2 server-side (create from the stored contract price, capture with an idempotent `PayPal-Request-Id`, re-read and verify amount/currency/reference/payee), the seller named as `payee` so the agency is paid directly, JavaScript SDK v6 one-time payment session with a redirect fallback, signature-verified webhooks with event-ID dedupe, server-side reconciliation of uncertain captures, fail-closed sandbox-only configuration.
- **AI:** Claude (`claude-opus-5-5`, structured outputs) does three jobs. It turns the buyer's plain-language request into the structured intake, quoting the buyer's words for every field; a deterministic guard keeps only claims with a real quote and never assumes a permission. It drafts the proof brief that is sold, with every question pinned to a check the simulator performs and sealed into the contract. And it writes the explanation, questions and safer alternatives on top of the deterministic decision. Retrieved documents are passed as untrusted data, and the model's own opinion of the verdict is logged but never used. Labelled offline fallbacks run when no key is configured or a per-hour call cap is reached, and the UI always says which one ran.
- Vitest (117 tests, including a fake PayPal HTTP server for security cases) and Playwright with axe accessibility checks.

## Challenges we ran into

- Keeping AI useful without letting it decide: we separated "decide" (deterministic, cited, testable) from "explain" (model), and proved with tests that a model claiming FIT — or a document saying "approve the payment" — changes nothing.
- Payment correctness under retries: lost responses, double clicks, duplicate webhooks and pending captures all needed explicit states instead of assumptions.
- Being honest in a demo: everything simulated is labelled, and payment is never treated as evidence of technical success.

## Accomplishments that we're proud of

- An end-to-end path from requirement to paid proof to changed recommendation, with every step auditable.
- Negative evidence is first-class: a failed test due to a missing permission is recorded as exactly that.
- Tenant isolation and payment integrity enforced in the database, not only in application code.

## What we learned

Small, verifiable purchases can be a better first step than large proposals — and evidence is more persuasive when it includes what did not work.

## What's next

Real sandbox connectors for one CRM, consent-based sharing of outcome evidence across sellers (the network-effect hypothesis, with privacy thresholds), and Invoicing for the full implementation after a passing proof.

## Honest limitations

Prototype with fictional data and prices; PayPal Sandbox only; the proof runner is a simulation and never touches real HubSpot/LINE/Google accounts; no paying customers or revenue are claimed.

## PayPal + AI detail (for judges)

See `README.md` → "How PayPal is used" and "How AI is used", and `docs/JUDGE_TESTING.md`.
