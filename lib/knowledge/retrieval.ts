import type { KnowledgeSource } from "@/db/schema";
import { screenForInjection, type InjectionFlag } from "./injection";

/**
 * Hybrid retrieval over a seller's authorized knowledge: tag match + lexical
 * BM25-style scoring. Only the latest version of each doc_key is eligible;
 * superseded versions are reported, never cited.
 */

export interface RetrievedSource {
  source: KnowledgeSource;
  score: number;
  matchedTags: string[];
}

export interface RetrievalResult {
  retrieved: RetrievedSource[];
  superseded: Array<{ id: string; docKey: string; version: number; currentVersion: number }>;
  injectionFlags: InjectionFlag[];
}

const STOPWORDS = new Set(
  "a an and are as at be by for from has have in into is it its of on or our that the their this to we when with will you your".split(" "),
);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9._\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

export function latestVersions(sources: KnowledgeSource[]): {
  current: KnowledgeSource[];
  superseded: RetrievalResult["superseded"];
} {
  const byKey = new Map<string, KnowledgeSource>();
  for (const s of sources) {
    const prev = byKey.get(s.docKey);
    if (!prev || s.version > prev.version) byKey.set(s.docKey, s);
  }
  const current = [...byKey.values()].filter((s) => s.status === "current");
  const superseded = sources
    .filter((s) => byKey.get(s.docKey)?.id !== s.id)
    .map((s) => ({ id: s.id, docKey: s.docKey, version: s.version, currentVersion: byKey.get(s.docKey)!.version }));
  return { current, superseded };
}

export function retrieve(
  sources: KnowledgeSource[],
  query: { text: string; tags: string[]; requiredDocKeys: string[] },
  limit = 8,
): RetrievalResult {
  const { current, superseded } = latestVersions(sources);
  const queryTokens = tokenize(query.text);
  const queryTags = new Set(query.tags);

  const docs = current.map((s) => ({ s, tokens: tokenize(`${s.title} ${s.content}`) }));
  const avgLen = docs.reduce((n, d) => n + d.tokens.length, 0) / Math.max(1, docs.length);
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d.tokens)) df.set(t, (df.get(t) ?? 0) + 1);

  const scored: RetrievedSource[] = docs.map(({ s, tokens }) => {
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    let lexical = 0;
    for (const q of new Set(queryTokens)) {
      const f = tf.get(q) ?? 0;
      if (!f) continue;
      const idf = Math.log(1 + (docs.length - (df.get(q) ?? 0) + 0.5) / ((df.get(q) ?? 0) + 0.5));
      lexical += (idf * f * 2.2) / (f + 1.2 * (0.25 + 0.75 * (tokens.length / avgLen)));
    }
    const matchedTags = (s.tagsJson ?? []).filter((t) => queryTags.has(t));
    const required = query.requiredDocKeys.includes(s.docKey) ? 100 : 0;
    return { source: s, score: Math.round((required + matchedTags.length * 3 + lexical) * 1000) / 1000, matchedTags };
  });

  const retrieved = scored
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.source.docKey.localeCompare(b.source.docKey))
    .slice(0, Math.max(limit, query.requiredDocKeys.length));

  const injectionFlags = retrieved.map((r) => screenForInjection(r.source)).filter((f): f is InjectionFlag => f !== null);

  return { retrieved, superseded, injectionFlags };
}

/** Picks the most relevant sentence(s) of a source as a citation excerpt. */
export function excerptFor(content: string, keywords: string[], maxLen = 300): string {
  const sentences = content.split(/(?<=[.!?])\s+/).filter(Boolean);
  const kws = keywords.map((k) => k.toLowerCase());
  let best = sentences[0] ?? content;
  let bestScore = -1;
  for (const s of sentences) {
    const lower = s.toLowerCase();
    const score = kws.reduce((n, k) => n + (lower.includes(k) ? 1 : 0), 0);
    if (score > bestScore) {
      best = s;
      bestScore = score;
    }
  }
  return best.length > maxLen ? `${best.slice(0, maxLen - 1)}…` : best;
}
