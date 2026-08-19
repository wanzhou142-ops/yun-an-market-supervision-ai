/**
 * Step 5 · partial ASR 投机导航：在 final 识别完成前，用 partial 文本预判 nav 意图。
 * 保守策略：优先走 classify()；仅对高置信 partial 关键词补漏。
 */
import { classify, correctAsrText, mergeNav, type NavState } from "./tour-nav";

export function navPatchKey(patch: Partial<NavState>): string {
  return JSON.stringify(patch);
}

function sameNav(a: NavState, patch: Partial<NavState>): boolean {
  const merged = mergeNav(a, patch);
  return JSON.stringify(merged) === JSON.stringify(a);
}

/** 流式 partial 须含导航词且排除单字谐音误识别（如 船/常/长） */
const NAV_PARTIAL_KW =
  /宣传|模拟药店|药店|药房|器械|化妆品|药品|科普|法规|案例|返回|迎宾/;

function isConfidentPartial(t: string): boolean {
  if (t.length < 3) return false;
  if (/^[船常长汤商]$/.test(t)) return false;
  if (/^船/.test(t) && !/宣传/.test(t)) return false;
  return NAV_PARTIAL_KW.test(t);
}

export function matchNavFromPartial(
  raw: string,
  st: NavState
): Partial<NavState> | null {
  const t = correctAsrText(raw.trim());
  if (t.length < 2) return null;
  if (!isConfidentPartial(t)) return null;

  const intent = classify(t, st);
  if (intent.kind === "nav") {
    if (sameNav(st, intent.next)) return null;
    return intent.next;
  }

  // partial 补漏：classify 对未说完的短语可能返回 unknown
  if (/(宣传廊|宣传栏|宣传郎|普法宣传)/.test(t)) {
    const patch: Partial<NavState> = {
      scene: "corridor",
      aspect: null,
      chapter: null,
      pharmMode: null,
      pharmArea: null,
      pharmLeaf: null,
      uiPhase: "choosing",
      lastFinishedChapter: null,
      lastFinishedLeaf: null,
    };
    if (sameNav(st, patch)) return null;
    return patch;
  }

  if (/(模拟药店|药店|药房)/.test(t) && t.length >= 3) {
    const patch: Partial<NavState> = {
      scene: "pharmacy",
      aspect: null,
      chapter: null,
      pharmMode: null,
      pharmArea: null,
      pharmLeaf: null,
      uiPhase: "choosing",
      lastFinishedChapter: null,
      lastFinishedLeaf: null,
    };
    if (sameNav(st, patch)) return null;
    return patch;
  }

  if (st.scene === "corridor" && !st.aspect) {
    if (/器械/.test(t)) {
      const patch = {
        aspect: "device" as const,
        chapter: null,
        uiPhase: "choosing" as const,
        lastFinishedChapter: null,
      };
      if (sameNav(st, patch)) return null;
      return patch;
    }
    if (/化妆品/.test(t)) {
      const patch = {
        aspect: "cosmetic" as const,
        chapter: null,
        uiPhase: "choosing" as const,
        lastFinishedChapter: null,
      };
      if (sameNav(st, patch)) return null;
      return patch;
    }
    if (/药品/.test(t) && !/非药品/.test(t)) {
      const patch = {
        aspect: "drug" as const,
        chapter: null,
        uiPhase: "choosing" as const,
        lastFinishedChapter: null,
      };
      if (sameNav(st, patch)) return null;
      return patch;
    }
  }

  if (st.scene === "corridor" && st.aspect && !st.chapter) {
    if (/科普/.test(t)) {
      const patch = {
        chapter: "science" as const,
        uiPhase: "playing" as const,
        lastFinishedChapter: null,
      };
      if (sameNav(st, patch)) return null;
      return patch;
    }
    if (/法规/.test(t)) {
      const patch = {
        chapter: "law" as const,
        uiPhase: "playing" as const,
        lastFinishedChapter: null,
      };
      if (sameNav(st, patch)) return null;
      return patch;
    }
    if (/案例/.test(t)) {
      const patch = {
        chapter: "casePick" as const,
        uiPhase: "choosing" as const,
      };
      if (sameNav(st, patch)) return null;
      return patch;
    }
  }

  return null;
}
