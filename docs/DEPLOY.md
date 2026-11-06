# Deploying the judge demo (Render)

The repository ships a Render Blueprint (`render.yaml`) for a public demo on Render's **free** plan. Nothing here creates paid resources.

## What the free setup does

- One Node web service runs `next start`. Render sets `PORT` and `RENDER_EXTERNAL_URL`; the app uses `RENDER_EXTERNAL_URL` as its public base URL (PayPal return URLs, secure cookies) unless `APP_BASE_URL` is set.
- The database is the embedded PGlite on the instance's disk. It migrates and seeds the fictional demo world on start. **A redeploy, restart or spin-down resets the demo.** That is intended: all data is fictional, and judges can also reset it from Settings.
- Free web services spin down after 15 idle minutes; the first request afterwards waits about a minute. Render's free Postgres expires after 30 days, which would fall inside the judging window, so it is deliberately not used.
- Live model calls are capped (`AI_LIVE_CALLS_PER_HOUR=60`, `AI_LIVE_CALLS_PER_DAY=400`). Over the cap the app uses the labelled offline evaluator.

## Steps (owner)

1. Push the repository to GitHub (public, after the owner's approval).
2. In Render: **New → Blueprint**, pick the repository. Render reads `render.yaml`.
3. Enter the secrets Render asks for. They are stored in Render, never in git:
   - `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`: from the PayPal Developer Dashboard → Apps & Credentials → **Sandbox** app.
   - `ANTHROPIC_API_KEY`: from the Anthropic Console. Set a monthly spend limit there as well.
   - `PAYPAL_WEBHOOK_ID`: leave empty on the first deploy (see step 5).
4. Deploy. Check `https://<service>.onrender.com/api/health`: `payment` should be `sandbox` and `ai` should be `anthropic`.
5. Webhooks: in the PayPal Sandbox app, add a webhook to `https://<service>.onrender.com/api/paypal/webhook` with the events `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.PENDING`, `PAYMENT.CAPTURE.DENIED`, `PAYMENT.CAPTURE.REFUNDED`, `CHECKOUT.ORDER.APPROVED`. Copy the webhook ID into `PAYPAL_WEBHOOK_ID` in Render; it redeploys.
6. Walk the golden path once on the hosted URL with a PayPal Sandbox **personal** (buyer) account. Record the order and capture IDs only in `docs/LOCAL_SANDBOX_NOTES.md` (git-ignored).

## Notes for judges

- Every organization, person and record is fictional. Payments are PayPal **Sandbox** test money.
- The demo world is shared: a reset by one visitor resets it for everyone. If a page looks unexpected, use **Settings → Reset + play scripted storyline**.
- To pay in the hosted demo you need a PayPal Sandbox buyer account; see `docs/JUDGE_TESTING.md`.

## Always-on alternative (paid, owner's decision)

A paid instance removes the spin-down. For data that survives restarts, set `DATABASE_URL` to a Postgres database and run `npm run db:migrate` once. The connecting user must be able to create and join the `app_tenant` role (the app refuses to start if tenant isolation cannot work).
