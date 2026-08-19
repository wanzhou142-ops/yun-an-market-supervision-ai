/** Keyword matching for pharmacy quiz answers (offline). */

export interface MatchResult {
  matched: boolean;
  score: number;
  method: "keyword" | "semantic" | "none";
}

const STOP = new Set("的不无未没有和与及在是为有这那个了吗呢吧啊".split(""));

function normalize(text: string): string {
  return text
    .replace(/[，。！？、；：""''（）()\[\]《》\s]/g, "")
    .toLowerCase();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const prev = new Array<number>(n + 1);
  const curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

function fuzzyIncludes(text: string, keyword: string): boolean {
  if (text.includes(keyword)) return true;
  if (keyword.length <= 4) {
    const chars = Array.from(text);
    for (let i = 0; i <= chars.length - keyword.length; i++) {
      const sub = chars.slice(i, i + keyword.length).join("");
      if (levenshtein(sub, keyword) <= 1) return true;
    }
    return false;
  }
  const kc = Array.from(keyword);
  return kc.filter((c) => text.includes(c)).length / kc.length >= 0.55;
}

/** Bigram overlap as lightweight semantic proxy (no embedding model). */
function bigramScore(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const bg = (s: string) => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  const A = bg(a);
  const B = bg(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return (2 * inter) / (A.size + B.size);
}

export function matchQuizAnswer(
  userText: string,
  answer: string,
  keywords: string[]
): MatchResult {
  const u = normalize(userText);
  const a = normalize(answer);
  if (!u || u.length < 2) return { matched: false, score: 0, method: "none" };

  if (u === a) return { matched: true, score: 1, method: "keyword" };
  if (a.includes(u) || u.includes(a)) {
    const ratio = Math.min(u.length, a.length) / Math.max(u.length, a.length);
    if (ratio >= 0.35) return { matched: true, score: 0.85 + ratio * 0.1, method: "keyword" };
  }

  const kws = [...new Set([...keywords, ...extractInlineKeywords(answer)])];
  let hits = 0;
  let weight = 0;
  for (const kw of kws) {
    const k = normalize(kw);
    if (k.length < 2 || STOP.has(k)) continue;
    weight += Math.min(k.length, 6);
    if (fuzzyIncludes(u, k)) hits += Math.min(k.length, 6);
  }
  const kwScore = weight ? hits / weight : 0;
  if (kwScore >= 0.55) {
    return { matched: true, score: 0.72 + kwScore * 0.25, method: "keyword" };
  }

  const sem = bigramScore(u, a);
  if (sem >= 0.42) {
    return { matched: true, score: sem, method: "semantic" };
  }

  return { matched: false, score: Math.max(kwScore, sem), method: "none" };
}

function extractInlineKeywords(answer: string): string[] {
  const out: string[] = [];
  for (const m of answer.matchAll(/[\u4e00-\u9fff《》（）]{2,}/g)) {
    const s = m[0].replace(/[《》（）]/g, "");
    if (s.length >= 2 && !STOP.has(s)) out.push(s);
  }
  return out;
}

export const MATCH_THRESHOLD = 0.72;
