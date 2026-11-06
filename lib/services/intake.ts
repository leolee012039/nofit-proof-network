import type { AnthropicFactory } from "@/lib/ai/anthropic";
import { LIVE_MODEL_LIMIT_REASON, takeLiveModelCall } from "@/lib/ai/budget";
import { anthropicIntakeExtraction, draftFromExtraction, offlineIntakeExtraction, type IntakeDraft } from "@/lib/ai/intake";
import { requireRole, type Actor } from "@/lib/auth/actor";
import { getAiMode, type AiMode } from "@/lib/config";
import { AppError } from "@/lib/domain/errors";

export const INTAKE_TEXT_MIN = 40;
export const INTAKE_TEXT_MAX = 4000;

/**
 * Drafts the intake form from the buyer's own words. Nothing is stored: the
 * buyer reviews the draft and submits the form as usual. Live model if
 * configured, the labelled offline extractor otherwise or on any model failure.
 */
export async function draftIntake(
  actorIn: Actor | null,
  body: { text?: unknown },
  opts: { aiMode?: AiMode; anthropicFactory?: AnthropicFactory } = {},
): Promise<IntakeDraft> {
  requireRole(actorIn, ["buyer"]);
  if (typeof body.text !== "string") throw new AppError("VALIDATION", "Describe the integration in plain text.");
  const text = body.text.trim();
  if (text.length < INTAKE_TEXT_MIN)
    throw new AppError("VALIDATION", `Describe the integration in at least ${INTAKE_TEXT_MIN} characters.`);
  if (text.length > INTAKE_TEXT_MAX)
    throw new AppError("VALIDATION", `Keep the description under ${INTAKE_TEXT_MAX.toLocaleString("en-US")} characters.`);

  const aiMode = opts.aiMode ?? getAiMode();
  if (aiMode.kind === "anthropic" && !takeLiveModelCall()) {
    return draftFromExtraction(offlineIntakeExtraction(text), text, {
      mode: "offline",
      label: "Offline keyword extractor (live model call limit reached). No language model was called.",
      fallbackReason: LIVE_MODEL_LIMIT_REASON,
    });
  }
  if (aiMode.kind === "anthropic") {
    try {
      const live = await anthropicIntakeExtraction({ apiKey: aiMode.apiKey, model: aiMode.model, factory: opts.anthropicFactory }, text);
      return draftFromExtraction(live.extraction, text, {
        mode: "live",
        model: live.model,
        label: `Drafted by a live model (${live.model}). Check every field before you submit.`,
      });
    } catch (err) {
      const fallbackReason = err instanceof Error ? err.message.slice(0, 200) : "unknown error";
      // Logged as well as labelled, so an expired key or an outage is visible to operators.
      console.warn("[nofit] intake draft fell back to the offline extractor", { model: aiMode.model, reason: fallbackReason });
      return draftFromExtraction(offlineIntakeExtraction(text), text, {
        mode: "offline",
        label: "Offline keyword extractor (live model unavailable). No language model was called.",
        fallbackReason,
      });
    }
  }
  return draftFromExtraction(offlineIntakeExtraction(text), text, {
    mode: "offline",
    label: "Offline keyword extractor. No language model was called.",
  });
}
