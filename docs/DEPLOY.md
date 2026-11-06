# Deploying the judge demo (Render + Neon)

The public demo runs on Render's **free** web plan with a **free** Neon Postgres database. Nothing here creates paid resources.

Live demo: <https://nofit-proof-network.onrender.com>

## What the free setup does

- One Node web service runs `next start` (`render.yaml`). Render sets `PORT` and `RENDER_EXTERNAL_URL`; the app uses `RENDER_EXTERNAL_URL` as its public base URL (PayPal return URLs, secure cookies) unless `APP_BASE_URL` is set.
- The database is a Neon Postgres project in the same region (AWS us-west-2, Oregon), reached through `DATABASE_URL` (the pooled connection string). Tenant isolation works the same as locally: every request runs in a transaction as `app_tenant` under row-level security. Data survives restarts.
- Why not the embedded PGlite database: a free instance has 512 MB, and PGlite alone needs about 490 MB once open. In a 512 MB Linux container (the same limit) the PGlite build was killed for running out of memory, while the same build on Postgres peaked at 128 MB over three full runs. See ADR-018.
- Free web services spin down after 15 idle minutes; the first request afterwards waits about a minute. Neon's free compute also scales to zero and wakes within a second or two. Render's free Postgres is not used because it expires after 30 days, inside the judging window.
- Live model calls are capped (`AI_LIVE_CALLS_PER_HOUR=60`, `AI_LIVE_CALLS_PER_DAY=400`). Over the cap the app uses the labelled offline evaluator.

## Steps (owner)

1. Create a free Neon project (region AWS US West 2). Copy its **pooled** connection string; remove `channel_binding=require` if present and keep `sslmode=require`.
2. From a workstation, migrate and seed it once:
   ```bash
   DATABASE_URL='<pooled connection string>' DEMO_SELLER_PAYPAL_MERCHANT_ID='<seller Sandbox merchant ID>' \
     sh -c 'npm run db:migrate && npm run db:seed'
   ```
   The connecting user must be able to create and join the `app_tenant` role; Neon's default owner role can. The app refuses to start if tenant isolation cannot work.
3. In Render: **New → Blueprint** (or a web service with the same settings), pick the repository. Render reads `render.yaml`.
4. Enter the secrets Render asks for. They are stored in Render, never in git:
   - `DATABASE_URL`: the pooled Neon connection string from step 1.
   - `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`: PayPal Developer Dashboard → Apps & Credentials → **Sandbox** app.
   - `ANTHROPIC_API_KEY`: from the Anthropic Console. Set a monthly spend limit there as well.
   - `DEMO_SELLER_PAYPAL_MERCHANT_ID`: the Sandbox **business** account that plays the seller, so payments go to the seller after every demo reset.
   - `PAYPAL_WEBHOOK_ID`: leave empty on the first deploy (see step 6).
5. Deploy. Check `https://<service>.onrender.com/api/health`: `payment` should be `sandbox`, `ai` should be `anthropic`, and `database` should be `PostgreSQL (DATABASE_URL)`.
6. Webhooks: in the PayPal Sandbox app, add a webhook to `https://<service>.onrender.com/api/paypal/webhook` with the events `CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.PENDING`, `PAYMENT.CAPTURE.DENIED`, `PAYMENT.CAPTURE.DECLINED`, `PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.CAPTURE.REVERSED`. Put the webhook ID in `PAYPAL_WEBHOOK_ID` on Render and redeploy.
7. Walk the golden path once on the hosted URL with a PayPal Sandbox **personal** (buyer) account. Record the order and capture IDs only in `docs/LOCAL_SANDBOX_NOTES.md` (git-ignored).

## Notes for judges

- Every organization, person and record is fictional. Payments are PayPal **Sandbox** test money.
- The demo world is shared: a reset by one visitor resets it for everyone. If a page looks unexpected, use **Settings → Reset to clean start**. (The one-click scripted storyline needs simulated payments, so it is available only in the offline walkthrough.)
- To pay in the hosted demo you need a PayPal Sandbox buyer account; see `docs/JUDGE_TESTING.md`.
