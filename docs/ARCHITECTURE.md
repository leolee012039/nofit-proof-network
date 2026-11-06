# Architecture

## Components

```
Browser
  │  (signed persona session cookie, SameSite=Lax; Origin checked on mutations)
  ▼
Next.js App Router ───────────────────────────────────────────────────────────
  app/(workspace)/*  server components: read via services under the tenant role
  app/api/*          route handlers: parse → service → JSON (AppError → status)
  components/client  small client islands: intake form, checkout (PayPal JS SDK v6)
  │
  ▼
lib/services  (authorization + orchestration)
  intake   buyer's words ─► AI draft with quotes ─► quote guard ─► form (buyer reviews; nothing stored)
  requests ─► assessments ─► policy engine ─► AI narrative ─► fit_assessments
                         └─► proposes proof_contracts (PROPOSED only)
  contracts  approve (seller, scope hash) / accept (buyer, scope hash) / cancel
  payments   create order ─► capture (CAS lock, re-read, verify) ─► finalize
  webhooks   verify signature ─► dedupe event id ─► re-read order ─► finalize
  proofs     execute queued run (simulator) ─► outcome record; queue retest
  replay     policy(baseline) vs policy(with outcome memory) ─► diff
  │
  ▼
Postgres (PGlite or DATABASE_URL)
  role app_tenant + RLS on every tenant table · triggers for money/proof integrity
```

## Request lifecycle (happy path)

1. **Buyer submits** (`POST /api/requests`). Zod validates `BuyerRequirementInput`; the row is inserted under the buyer tenant.
2. **System Agent assesses** in the _seller_ tenant (`role=system_agent`), so it can only read that seller's knowledge, capabilities and outcome records (RLS). `evaluatePolicy` runs first; then the narrative (Claude or offline). The assessment and, if eligible, a `PROPOSED` contract are stored.
3. **Seller approves** with the scope hash it reviewed → `SELLER_APPROVED`. From now on a trigger forbids changes to scope, price, currency, version and max runs.
4. **Buyer accepts** with the same scope hash and an explicit acknowledgement → `BUYER_ACCEPTED`.
5. **Order creation** (`POST /api/paypal/orders`, body: `contractId`, `flow`). Amount = `contract.price_minor`. PayPal order stored; contract → `PAYMENT_PENDING` (written by the payment service; tenants cannot set payment states).
6. **Approval** in PayPal (SDK v6 popup/modal or redirect). **Capture** (`POST /api/paypal/orders/{id}/capture`): CAS lock `→ CAPTURING`, `GET` order, capture with stable `PayPal-Request-Id`, `GET` again, verify, then in one transaction: payment `CAPTURED`, contract `PAID`, run #1 inserted (`ON CONFLICT DO NOTHING`), contract `PROOF_QUEUED`.
7. **Webhook** `PAYMENT.CAPTURE.COMPLETED` (verified) is idempotent with step 6; it resolves `CAPTURE_PENDING` / `CAPTURE_UNKNOWN` states.
8. **Seller executes** the run; the simulator returns evidence; run + outcome are written; contract → `PASSED | FAILED | INCONCLUSIVE`. After `FAILED`, a recorded environment change queues the next run (bounded by `max_runs`).
   A `PASSED` run then re-assesses its own request automatically (ADR-013).
9. **Next assessment / replay** reads the outcome records, re-verifies their digests and reuse consent, and applies ADR-006.

## State machines

Contract: `DRAFT → PROPOSED → SELLER_APPROVED → BUYER_ACCEPTED → PAYMENT_PENDING → PAID → PROOF_QUEUED → RUNNING → PASSED | FAILED | INCONCLUSIVE`, plus `PAYMENT_FAILED`, `NEEDS_REVIEW`, `CANCELLED`, and `FAILED/INCONCLUSIVE → PROOF_QUEUED` for retests. Defined in `lib/domain/states.ts`; every update is compare-and-set on the previous status; triggers enforce the money-critical edges.

Payment: `CREATED → APPROVED → CAPTURING → CAPTURED | CAPTURE_PENDING | CAPTURE_UNKNOWN | DENIED | VERIFICATION_FAILED`; `CAPTURED → REFUNDED | PARTIALLY_REFUNDED | REVERSED` (record only).

## Database guards (`db/migrations/0001_rls_and_guards.sql`)

| Guard                                         | Enforces                                                                                                                                  |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| RLS policies (`app_org()`, `app_can_write()`) | Org isolation; reviewer read-only; payment tables read-only for tenants                                                                   |
| `proof_contracts_guard`                       | Immutable scope/price after approval; tenants cannot set `PAYMENT_PENDING/PAID/PAYMENT_FAILED`; proof states require a `CAPTURED` payment |
| `paypal_orders_guard`                         | `CAPTURED` needs a capture id; amount/currency/order/contract immutable; captured cannot regress                                          |
| `proof_runs_guard`                            | `QUEUED/RUNNING` requires a captured payment; completed evidence immutable                                                                |
| `append_only_guard`                           | `outcome_records`, `audit_events` cannot be updated                                                                                       |
| Unique indexes                                | One captured payment per contract; unique PayPal order id, capture id, webhook event id, `(contract, run_number)`                         |

## Data model

13 domain tables + the fixture provider table (see `db/schema.ts`): `organizations`, `profiles`, `service_capabilities`, `knowledge_sources`, `buyer_requests`, `fit_assessments`, `proof_contracts`, `paypal_orders`, `paypal_webhook_events`, `proof_runs`, `outcome_records`, `sharing_consents`, `audit_events`, `fixture_provider_orders`. Money is always `integer` minor units.

## Retrieval and citations

`lib/knowledge/retrieval.ts`: latest version per `doc_key` only (superseded versions are reported, not cited); score = required policy docs + tag overlap + BM25-style lexical score; untrusted uploads are screened and never used as policy evidence. Every finding carries citation refs (`S1…`) to a source id, version and excerpt. Buyers see `seller_internal` excerpts redacted.
