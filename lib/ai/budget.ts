/**
 * Cap on live model calls, so a public demo cannot run up an unbounded bill.
 * Over the cap, callers fall back to the labelled offline evaluator instead of
 * failing. Counts live in process memory: right for the single demo instance,
 * not a substitute for a spend limit in the Anthropic Console.
 */
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

interface Window {
  start: number;
  used: number;
}

const store = globalThis as unknown as { __nofitAiBudget?: { hour: Window; day: Window } };

export const LIVE_MODEL_LIMIT_REASON = "live model call limit reached";

function limit(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

/** Takes one live call from the hourly and daily budgets; false when either is spent. */
export function takeLiveModelCall(now = Date.now(), env: NodeJS.ProcessEnv = process.env): boolean {
  const perHour = limit(env.AI_LIVE_CALLS_PER_HOUR, 60);
  const perDay = limit(env.AI_LIVE_CALLS_PER_DAY, 400);
  const s = (store.__nofitAiBudget ??= { hour: { start: now, used: 0 }, day: { start: now, used: 0 } });
  if (now - s.hour.start >= HOUR_MS) s.hour = { start: now, used: 0 };
  if (now - s.day.start >= DAY_MS) s.day = { start: now, used: 0 };
  if (s.hour.used >= perHour || s.day.used >= perDay) return false;
  s.hour.used += 1;
  s.day.used += 1;
  return true;
}

/** Test helper: start from empty budgets. */
export function resetLiveModelBudget() {
  store.__nofitAiBudget = undefined;
}
