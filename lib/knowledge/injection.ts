/**
 * Prompt-injection screening for retrieved documents. Documents are always
 * treated as data; this screen only surfaces suspicious text to humans and
 * excludes untrusted documents from policy evidence. Detection is advisory:
 * policy decisions never depend on whether this regex list is complete.
 */
const PATTERNS: Array<{ id: string; re: RegExp }> = [
  { id: "ignore-instructions", re: /\b(ignore|disregard|forget)\b[^.]{0,40}\b(instructions?|polic(y|ies)|rules|restrictions)\b/i },
  { id: "system-override", re: /\b(system|admin|developer)\s+(override|mode|prompt)\b/i },
  { id: "approve-payment", re: /\b(approve|authori[sz]e|release|capture)\b[^.]{0,30}\bpayments?\b/i },
  { id: "force-fit", re: /\bmark\b[^.]{0,40}\b(as\s+)?(FIT|approved|compatible)\b/ },
  { id: "price-manipulation", re: /\b(set|change|lower)\b[^.]{0,20}\bprice\b/i },
  { id: "remove-restrictions", re: /\b(remove|bypass|skip|disable)\b[^.]{0,30}\b(restrictions?|approval|checks?|blockers?)\b/i },
  { id: "role-hijack", re: /\byou are now\b|\bact as\b[^.]{0,30}\b(admin|system)\b/i },
];

export interface InjectionFlag {
  sourceId: string;
  title: string;
  patterns: string[];
  snippet: string;
}

export function screenForInjection(source: { id: string; title: string; content: string }): InjectionFlag | null {
  const hits = PATTERNS.filter((p) => p.re.test(source.content));
  if (hits.length === 0) return null;
  const first = hits[0].re.exec(source.content);
  const start = Math.max(0, (first?.index ?? 0) - 20);
  return {
    sourceId: source.id,
    title: source.title,
    patterns: hits.map((h) => h.id),
    snippet: source.content
      .slice(start, start + 140)
      .replace(/\s+/g, " ")
      .trim(),
  };
}
