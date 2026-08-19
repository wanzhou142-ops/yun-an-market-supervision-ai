import pairsManifest from "../public/pharmacy-quiz/pairs.json";
import { matchQuizAnswer, MATCH_THRESHOLD, type MatchResult } from "./pharmacy-quiz-match";

export type PharmQuizArea = "drug" | "nondrug" | "newretail";

export interface QuizPair {
  id: number;
  area: PharmQuizArea;
  subArea: string | null;
  image: string;
  imageUrl: string;
  answer: string;
  keywords: string[];
}

export interface QuizRound {
  area: PharmQuizArea;
  pairs: QuizPair[];
  index: number;
  score: number;
  attempts: number;
  hintShown: boolean;
}

export interface QuizManifest {
  version: number;
  quizRoundSize: number;
  pairCount: number;
  pairs: QuizPair[];
}

const manifest = pairsManifest as QuizManifest;

export const QUIZ_ROUND_SIZE = manifest.quizRoundSize ?? 3;

export function getPairsForArea(area: PharmQuizArea): QuizPair[] {
  return manifest.pairs.filter((p) => p.area === area);
}

export function pickQuizRound(area: PharmQuizArea, size = QUIZ_ROUND_SIZE): QuizPair[] {
  const pool = getPairsForArea(area);
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, Math.min(size, shuffled.length));
}

export function createQuizRound(area: PharmQuizArea): QuizRound {
  return {
    area,
    pairs: pickQuizRound(area),
    index: 0,
    score: 0,
    attempts: 0,
    hintShown: false,
  };
}

export function currentPair(round: QuizRound | null): QuizPair | null {
  if (!round) return null;
  return round.pairs[round.index] ?? null;
}

export function isQuizComplete(round: QuizRound | null): boolean {
  if (!round) return true;
  return round.index >= round.pairs.length;
}

export function evaluateAnswer(round: QuizRound, userText: string): MatchResult {
  const pair = currentPair(round);
  if (!pair) return { matched: false, score: 0, method: "none" };
  return matchQuizAnswer(userText, pair.answer, pair.keywords);
}

export function isQuizMatch(result: MatchResult): boolean {
  return result.matched && result.score >= MATCH_THRESHOLD;
}

export function areaLabel(area: PharmQuizArea): string {
  const map: Record<PharmQuizArea, string> = {
    drug: "药品区",
    nondrug: "非药品区",
    newretail: "新零售模式区",
  };
  return map[area];
}

export function resolveQuizArea(st: {
  scene: string;
  pharmMode: string | null;
  pharmArea: string | null;
}): PharmQuizArea | null {
  if (st.scene !== "pharmacy") return null;
  if (st.pharmMode === "newretail") return "newretail";
  if (st.pharmMode === "traditional" && st.pharmArea === "drug") return "drug";
  if (st.pharmMode === "traditional" && st.pharmArea === "nondrug") return "nondrug";
  return null;
}

export type QuizControl = "hint" | "reveal" | "giveUp" | "next" | "skip" | "none";

function normalizeControlText(text: string): string {
  return text
    .trim()
    .replace(/[了嘛吗呀啊。！？…\s]+$/g, "")
    .trim();
}

export function isQuizControl(text: string): QuizControl {
  const t = normalizeControlText(text);
  if (/(给我答案|告诉我答案|说答案|公布答案|标准答案|正确答案|直接说|说出答案)/.test(t)) return "reveal";
  if (/^(我不会|不会|不懂|没看出来|看不出来|不知道)$/.test(t)) return "giveUp";
  if (/(提示|说一下|给个提示)/.test(t)) return "hint";
  if (/(下一题|下一道|换一题|继续)/.test(t)) return "next";
  if (/(跳过|没有了|不想答)/.test(t)) return "skip";
  return "none";
}

export function shouldStartPharmQuiz(
  prev: { scene: string; pharmMode: string | null; pharmArea: string | null },
  next: { scene: string; pharmMode: string | null; pharmArea: string | null; uiPhase?: string }
): boolean {
  if (next.uiPhase === "quiz") return false;
  const area = resolveQuizArea(next);
  const prevArea = resolveQuizArea(prev);
  return !!area && area !== prevArea;
}

export function hintKeyword(pair: QuizPair | null): string {
  if (!pair?.keywords?.length) return "现场细节";
  return pair.keywords[0];
}
