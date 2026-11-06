import { ActionButton } from "@/components/client/action-button";
import { PayoutForm } from "@/components/client/payout-form";
import { Badge, Callout, Card, CardHeader, KeyValue, Mono, PageHeader } from "@/components/ui";
import { getAppBaseUrl } from "@/lib/config";
import { pageActor } from "@/lib/page";
import { getPayoutAccount } from "@/lib/services/payout";
import { getSystemStatus } from "@/lib/services/system";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const actor = await pageActor();
  const s = getSystemStatus();
  const base = getAppBaseUrl();
  const payout = actor.role === "seller_admin" ? await getPayoutAccount(actor) : null;
  return (
    <>
      <PageHeader meta="Integration status (no secrets are ever shown)" title="Settings" />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader
            meta="Payments"
            title={s.payment.label}
            action={
              <Badge tone={s.payment.kind === "sandbox" ? "teal" : s.payment.kind === "fixture" ? "amber" : "red"}>
                {s.payment.kind === "sandbox" ? "Sandbox" : s.payment.kind === "fixture" ? "Simulated" : "Off"}
              </Badge>
            }
          />
          <div className="space-y-4 px-5 py-4 text-sm">
            {s.payment.kind === "sandbox" ? (
              <KeyValue
                items={[
                  ["API host", <Mono key="h">{s.payment.host}</Mono>],
                  ["Client ID (public)", <Mono key="c">{s.payment.clientId.slice(0, 10)}…</Mono>],
                  ["Webhook ID", s.payment.webhookConfigured ? "configured" : "not configured — webhooks will be rejected"],
                  ["Payee check", s.payment.merchantCheck ? "PAYPAL_MERCHANT_ID enforced" : "not configured (optional)"],
                  ["Webhook URL to register", <Mono key="w">{`${base}/api/paypal/webhook`}</Mono>],
                ]}
              />
            ) : (
              <Callout tone={s.payment.kind === "fixture" ? "amber" : "red"}>{s.payment.reason}</Callout>
            )}
            <p className="text-ink-3">
              Sandbox only. Any non-sandbox <code>PAYPAL_ENV</code> or API host disables every payment path (fail closed). Set credentials
              in <code>.env.local</code>, never in git or chat.
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader
            meta="AI"
            title={s.ai.label}
            action={<Badge tone={s.ai.kind === "anthropic" ? "teal" : "neutral"}>{s.ai.kind === "anthropic" ? "Live" : "Offline"}</Badge>}
          />
          <div className="space-y-3 px-5 py-4 text-sm text-ink-2">
            <p>
              The deterministic policy engine always decides fit status, blockers and the proof offer. The language model (when configured)
              drafts the intake from the buyer&apos;s own words and writes the explanation, questions and alternatives. Its output is
              labelled, and it never changes the decision.
            </p>
            {s.ai.kind === "offline-fixture" ? <p className="text-ink-3">{s.ai.reason}</p> : null}
            <KeyValue items={[["Database", s.database]]} />
          </div>
        </Card>

        {actor.role === "seller_admin" ? (
          <Card className="xl:col-span-2">
            <CardHeader
              meta="Payouts"
              title="Where your proof payments go"
              action={<Badge tone={payout ? "teal" : "neutral"}>{payout ? "Paid to you directly" : "Not set"}</Badge>}
            />
            <div className="space-y-4 px-5 py-4 text-sm">
              <p className="max-w-[70ch] text-ink-2">
                With a payout account, each proof order names your PayPal account as the payee, so the buyer&apos;s payment goes straight to
                you. After capture the server checks that the money reached this account; a different payee fails verification and no proof
                runs. Without one, payments go to the app&apos;s own PayPal account.
              </p>
              <PayoutForm current={payout} />
              <p className="text-xs text-ink-3">
                Use a PayPal Sandbox business account here (Developer Dashboard → Testing Tools → Sandbox Accounts → the account&apos;s
                Account ID). A merchant ID is an identifier, not a secret.
              </p>
            </div>
          </Card>
        ) : null}

        <Card className="xl:col-span-2">
          <CardHeader meta="For judges" title="Demo reset" />
          <div className="space-y-4 px-5 py-4 text-sm">
            {s.demoReset ? (
              <>
                <p className="text-ink-2">
                  Wipes every request, contract, payment record and outcome in this demo database and restores the fictional base world.
                </p>
                <div className="flex flex-wrap gap-4">
                  <ActionButton
                    url="/api/demo/reset"
                    body={{ mode: "clean" }}
                    variant="danger"
                    confirm="Reset all demo data to a clean start?"
                    testId="reset-clean"
                  >
                    Reset to clean start
                  </ActionButton>
                  {s.payment.kind === "fixture" ? (
                    <ActionButton
                      url="/api/demo/reset"
                      body={{ mode: "storyline" }}
                      variant="secondary"
                      confirm="Reset and play the scripted storyline with FIXTURE payments?"
                      testId="reset-storyline"
                    >
                      Reset + play scripted storyline (fixture payments)
                    </ActionButton>
                  ) : null}
                </div>
                <p className="text-xs text-ink-3">
                  The scripted storyline runs the real services end to end with the labelled FIXTURE payment provider. Real Sandbox checkout
                  always needs a human buyer.
                </p>
              </>
            ) : (
              <p className="text-ink-3">Demo reset is disabled on this deployment.</p>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
