# Judge testing guide

## Hosted demo (quickest)

- URL: `<filled in by the owner after deployment>`. It stays online until the end of the judging period (2026-12-15). The first visit after 15 idle minutes takes about a minute to wake up.
- Sign in by choosing a fictional persona; there are no passwords.
- To pay through PayPal Sandbox, log in at checkout with this Sandbox **personal** account, created only for judging. It holds Sandbox test money, never real money: `<email and password filled in by the owner>`.
- The demo world is shared and resettable: **Settings → Reset to clean start** restores it. (The one-click scripted storyline uses simulated payments, so it runs only in the offline walkthrough below; the hosted demo takes real Sandbox payments.)

The steps below run the same app locally.

## Option A — 2-minute offline walkthrough (no credentials)

```bash
npm install
npm run dev     # http://localhost:3000
```

1. **Open the demo** → choose **Maya Chen (Buyer)**.
2. **New Assessment** → _Use the sample request_ → _Draft the form with AI_. The form fills in, and _Your words behind each field_ shows the sentence behind every tool, operation and approval choice (without an API key, a labelled offline extractor does this). Check the draft → _Submit for fit assessment_. Expect **NO_FIT**, blocker `R-CRM-WRITE-SCOPE`, a review item, citations, and a notice that instruction-like text in an uploaded document was ignored. (_Skip: load the demo form_ fills the form directly.)
3. _Open proof contract_ → **Switch persona** → **Ravi Okafor (Seller)** → _Approve scope and $49.00 price_.
4. Switch to Maya → tick the acknowledgement → _Accept this exact version_ → _Start simulated checkout_. This is the **FIXTURE provider — it is not PayPal** and is labelled as such everywhere. Approve → the contract shows `PROOF_QUEUED`.
5. Switch to Ravi → _Execute run_ (fails: `INSUFFICIENT_PERMISSION`) → _Record change and queue retest_ → _Execute run_ (passes).
6. **Outcome Memory** and **Decision Replay** → `NO_FIT → CONDITIONAL_FIT` with the driving outcome ID.

Shortcut: **Settings → Reset + play scripted storyline** runs steps 1–6 through the real services in one click. **Reset to clean start** wipes the demo.

Reproduce evidence: `npm run proof:replay -- --fixture run_001` prints the same SHA-256 digest shown in the UI.

## Option B — real PayPal Sandbox checkout

You need your own free PayPal Developer account. **Never paste credentials into issues, chat or git.**

1. <https://developer.paypal.com/> → Apps & Credentials → **Sandbox** → create an app. Copy the client ID and secret.
2. `cp .env.example .env.local`, set `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`, keep `PAYPAL_ENV=sandbox` and `PAYPAL_BASE_URL=https://api-m.sandbox.paypal.com`.
3. `npm run dev`. The sidebar badge must read **PAYPAL SANDBOX**.
4. Developer Dashboard → Sandbox → Accounts: use the generated **Personal** account to log in at checkout (or create one).
5. Run steps 1–4 above; at checkout click the PayPal button (or _Continue on PayPal Sandbox (redirect)_), log in with the Sandbox personal account and approve.
6. Back in the app the payment card shows **CAPTURED · PAYPAL SANDBOX**, the server verification checks, and the PayPal order and capture IDs. These also appear in your Sandbox merchant account activity.

### Webhooks (optional)

PayPal must reach `<public https URL>/api/paypal/webhook`. Use a deployment or an HTTPS tunnel, set `APP_BASE_URL` to that URL, subscribe the app to `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.PENDING`, `PAYMENT.CAPTURE.DENIED`, `PAYMENT.CAPTURE.REFUNDED`, `CHECKOUT.ORDER.APPROVED`, and set `PAYPAL_WEBHOOK_ID`. Verified events appear on **Transactions**. Without webhooks the app still works: capture is verified directly via the Orders API, and the UI says "webhook confirmation not yet received".

## Manual Sandbox checklist (for the maintainers)

- [ ] Header badge shows PAYPAL SANDBOX; Settings shows the sandbox host.
- [ ] Order created with amount 49.00 USD (check Sandbox dashboard).
- [ ] Buyer approval via SDK v6 button works; redirect fallback works.
- [ ] Capture → `CAPTURED`, all verification checks pass (the payee check reads "skipped" unless `PAYPAL_MERCHANT_ID` is set), contract `PROOF_QUEUED`, exactly one run.
- [ ] Start checkout with the SDK button, then with the redirect link: the first order is voided; only one can ever be captured.
- [ ] Clicking capture again / reloading the return page does not capture twice.
- [ ] Cancel in PayPal → nothing charged, contract stays payable.
- [ ] Webhook `PAYMENT.CAPTURE.COMPLETED` arrives, verified, `ALREADY_CAPTURED` or `APPLIED_CAPTURED`; a resend is `DUPLICATE_IGNORED`.
- [ ] Simulator "Resend" with a bad signature is rejected with 401 and not stored.
- [ ] Record order ID and capture ID in `docs/LOCAL_SANDBOX_NOTES.md` (gitignored; redact before sharing).

## What is simulated

HubSpot, LINE and Google Sheets behaviour (deterministic simulator), all organizations and people, all prices. Proof runs never contact external systems.
