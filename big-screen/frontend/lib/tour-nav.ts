import scriptsJson from "./tour-scripts.json";
import { resolveVideo, type VideoKey, VIDEOS } from "./tour-config";

const SCRIPTS = scriptsJson as Record<string, string>;

export type Scene = "welcome" | "corridor" | "pharmacy";
export type Aspect = null | "device" | "cosmetic" | "drug";
/** casePick = 已进案例篇口播，等待案例1/2 */
export type Chapter = null | "science" | "law" | "casePick" | "case1" | "case2";
export type PharmMode = null | "traditional" | "newretail";
export type PharmArea = null | "drug" | "nondrug";
export type PharmLeaf =
  | null
  | "rx"
  | "otc"
  | "tcm"
  | "cool"
  | "food"
  | "device"
  | "cosmetic"
  | "other"
  | "newdrug"
  | "online"
  | "self";

export interface NavState {
  scene: Scene;
  aspect: Aspect;
  chapter: Chapter;
  pharmMode: PharmMode;
  pharmArea: PharmArea;
  pharmLeaf: PharmLeaf;
}

export type WelcomePhase =
  | "standby"
  | "intro_speaking"
  | "intro_video"
  | "choice_ready"
  | "done";

export function initialNav(): NavState {
  return {
    scene: "welcome",
    aspect: null,
    chapter: null,
    pharmMode: null,
    pharmArea: null,
    pharmLeaf: null,
  };
}

export function script(id: string, vars?: Record<string, string>): string {
  let t = SCRIPTS[id] ?? SCRIPTS["global.fallback"];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      t = t.replace(new RegExp(`\\{${k}\\}`, "g"), v);
    }
  }
  return t;
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function aspectPrefix(a: NonNullable<Aspect>): string {
  return a === "device" ? "Device" : a === "cosmetic" ? "Cosmetic" : "Drug";
}

/** 进入当前状态时应播的 A 类 node_id */
export function scriptIdForNav(st: NavState): string {
  if (st.scene === "welcome") return "welcome.choice";
  if (st.scene === "corridor") {
    if (!st.aspect) return "corridor.enter";
    const z = st.aspect;
    if (!st.chapter) return `corridor.${z}`;
    if (st.chapter === "casePick") return `corridor.${z}.case`;
    if (st.chapter === "science") return `corridor.${z}.science`;
    if (st.chapter === "law") return `corridor.${z}.law`;
    if (st.chapter === "case1" || st.chapter === "case2") {
      return `corridor.${z}.case`;
    }
  }
  if (st.scene === "pharmacy") {
    if (!st.pharmMode) return "pharmacy.enter";
    if (st.pharmMode === "traditional") {
      if (!st.pharmArea) return "pharmacy.traditional";
      if (!st.pharmLeaf) {
        return st.pharmArea === "drug"
          ? "pharmacy.traditional.drug"
          : "pharmacy.traditional.nondrug";
      }
    }
    if (st.pharmMode === "newretail" && !st.pharmLeaf) return "pharmacy.newretail";
    if (st.pharmLeaf) return "pharmacy.leaf";
  }
  return "global.fallback";
}

export function speakTextForNav(st: NavState): string | null {
  if (st.chapter === "case1" || st.chapter === "case2") return null;
  const id = scriptIdForNav(st);
  if (id === "pharmacy.leaf" && st.pharmLeaf) {
    return script(id, { name: leafLabel(st.pharmLeaf) });
  }
  return script(id);
}

export function isChoicePoint(st: NavState, welcomePhase: WelcomePhase): boolean {
  if (welcomePhase === "choice_ready") return true;
  if (st.scene === "corridor") {
    if (!st.aspect || !st.chapter || st.chapter === "casePick") return true;
  }
  if (st.scene === "pharmacy") {
    if (!st.pharmMode) return true;
    if (st.pharmMode === "traditional" && !st.pharmArea) return true;
    if (st.pharmMode === "newretail" && !st.pharmLeaf) return true;
    if (st.pharmMode === "traditional" && st.pharmArea && !st.pharmLeaf) return true;
  }
  return false;
}

function leafLabel(leaf: NonNullable<PharmLeaf>): string {
  const map: Record<NonNullable<PharmLeaf>, string> = {
    rx: "处方药区",
    otc: "非处方药区",
    tcm: "中药饮片专区",
    cool: "阴凉区",
    food: "食品保健食品区",
    device: "医疗器械区",
    cosmetic: "化妆品区",
    other: "其他产品区",
    newdrug: "新特药销售区",
    online: "网络销售区（智慧药房）",
    self: "自助售药柜",
  };
  return map[leaf];
}

/**  CONTENT 视频：进入 science/law/case1/case2 后播放 */
export function contentVideoKey(st: NavState): VideoKey | null {
  if (st.scene !== "corridor" || !st.aspect) return null;
  const p = aspectPrefix(st.aspect);
  if (st.chapter === "science") return `corridor${p}Science` as VideoKey;
  if (st.chapter === "law") return `corridor${p}Law` as VideoKey;
  if (st.chapter === "case1") return `corridor${p}Case1` as VideoKey;
  if (st.chapter === "case2") return `corridor${p}Case2` as VideoKey;
  return null;
}

export function backgroundVideoKey(
  st: NavState,
  welcomePhase: WelcomePhase
): VideoKey {
  if (st.scene === "welcome" || welcomePhase === "intro_video") return "welcome";
  if (st.scene === "corridor" && !st.aspect) return "corridorOverview";
  if (st.scene === "pharmacy") {
    if (!st.pharmMode) return "pharmacy";
    if (st.pharmMode === "traditional") return "pharmacyTraditional";
    return "pharmacyNewretail";
  }
  return "corridorOverview";
}

export function mergeNav(st: NavState, patch: Partial<NavState>): NavState {
  return { ...st, ...patch };
}

export function resetPharm(): Pick<
  NavState,
  "pharmMode" | "pharmArea" | "pharmLeaf"
> {
  return { pharmMode: null, pharmArea: null, pharmLeaf: null };
}

export function resetCorridorChild(): Pick<NavState, "aspect" | "chapter"> {
  return { aspect: null, chapter: null };
}

/** 超时默认：当前层级第一个选项 */
export function defaultNext(st: NavState): Partial<NavState> {
  if (st.scene === "welcome") {
    return { scene: "corridor", ...resetCorridorChild(), ...resetPharm() };
  }
  if (st.scene === "corridor") {
    if (!st.aspect) return { aspect: "cosmetic", chapter: null };
    if (!st.chapter) return { chapter: "science" };
    if (st.chapter === "casePick") return { chapter: "case1" };
  }
  if (st.scene === "pharmacy") {
    if (!st.pharmMode) return { pharmMode: "traditional", pharmArea: null, pharmLeaf: null };
    if (st.pharmMode === "traditional") {
      if (!st.pharmArea) return { pharmArea: "drug", pharmLeaf: null };
      if (!st.pharmLeaf) return { pharmLeaf: "rx" };
    }
    if (st.pharmMode === "newretail" && !st.pharmLeaf) return { pharmLeaf: "newdrug" };
  }
  return {};
}

export type Intent =
  | { kind: "nav"; next: Partial<NavState> }
  | { kind: "training" }
  | { kind: "chat" }
  | { kind: "unknown" };

function levenshtein(a: string, b: string): number {
  const m = a.length,
    n = b.length;
  if (!m) return n;
  if (!n) return m;
  const prev = new Array(n + 1).fill(0);
  const curr = new Array(n + 1).fill(0);
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

function fuzzyMatch(text: string, keyword: string): boolean {
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
  return kc.filter((c) => text.includes(c)).length / kc.length >= 0.5;
}

function correctAsrText(raw: string): string {
  const corrections: [RegExp, string][] = [
    [/宣传狼/g, "宣传廊"],
    [/宣传朗/g, "宣传廊"],
    [/模型药店/g, "模拟药店"],
    [/模拟药品/g, "模拟药店"],
  ];
  let t = raw;
  for (const [re, rep] of corrections) t = t.replace(re, rep);
  return t;
}

export function classify(raw: string, st: NavState): Intent {
  const t = correctAsrText(raw.trim());
  if (!t) return { kind: "unknown" };

  if (/(回迎宾|回首页|迎宾大厅|首页)/.test(t)) {
    return {
      kind: "nav",
      next: { scene: "welcome", ...resetCorridorChild(), ...resetPharm() },
    };
  }

  if (/(综合培训|培训区)/.test(t)) return { kind: "training" };

  if (/(返回|回去)/.test(t)) {
    if (st.scene === "corridor" && st.chapter) {
      if (st.chapter === "case1" || st.chapter === "case2")
        return { kind: "nav", next: { chapter: "casePick" } };
      return { kind: "nav", next: { chapter: null } };
    }
    if (st.scene === "corridor" && st.aspect)
      return { kind: "nav", next: { aspect: null, chapter: null } };
    if (st.scene === "pharmacy" && st.pharmLeaf)
      return {
        kind: "nav",
        next: {
          pharmLeaf: null,
        },
      };
    if (st.scene === "pharmacy" && st.pharmArea)
      return { kind: "nav", next: { pharmArea: null, pharmLeaf: null } };
    if (st.scene === "pharmacy" && st.pharmMode)
      return { kind: "nav", next: { pharmMode: null, pharmArea: null, pharmLeaf: null } };
    return {
      kind: "nav",
      next: { scene: "welcome", ...resetCorridorChild(), ...resetPharm() },
    };
  }

  if (st.scene === "welcome" || !st.scene) {
    if (/(宣传廊|走廊|展区|展览)/.test(t) || fuzzyMatch(t, "宣传廊"))
      return { kind: "nav", next: { scene: "corridor", ...resetCorridorChild(), ...resetPharm() } };
    if (/(模拟药店|药店|药房)/.test(t))
      return { kind: "nav", next: { scene: "pharmacy", ...resetCorridorChild(), ...resetPharm() } };
  }

  if (/(宣传廊|走廊)/.test(t))
    return { kind: "nav", next: { scene: "corridor", aspect: null, chapter: null, ...resetPharm() } };
  if (st.scene !== "pharmacy" && /(模拟药店|药店|药房)/.test(t))
    return { kind: "nav", next: { scene: "pharmacy", ...resetCorridorChild(), ...resetPharm() } };

  if (st.scene === "corridor") {
    if (!st.aspect) {
      if (/(化妆品|化妆|护肤)/.test(t)) return { kind: "nav", next: { aspect: "cosmetic", chapter: null } };
      if (/(药品|药物)/.test(t)) return { kind: "nav", next: { aspect: "drug", chapter: null } };
      if (/(器械|医疗设备|仪器)/.test(t)) return { kind: "nav", next: { aspect: "device", chapter: null } };
    } else if (!st.chapter || st.chapter === "casePick") {
      if (/(科普)/.test(t)) return { kind: "nav", next: { chapter: "science" } };
      if (/(法规)/.test(t)) return { kind: "nav", next: { chapter: "law" } };
      if (/(案例)/.test(t) && st.chapter !== "casePick")
        return { kind: "nav", next: { chapter: "casePick" } };
      if (/(案例一|案例1|第一个)/.test(t)) return { kind: "nav", next: { chapter: "case1" } };
      if (/(案例二|案例2|第二个)/.test(t)) return { kind: "nav", next: { chapter: "case2" } };
    }
  }

  if (st.scene === "pharmacy") {
    if (!st.pharmMode) {
      if (/(传统|老式)/.test(t)) return { kind: "nav", next: { pharmMode: "traditional", pharmArea: null, pharmLeaf: null } };
      if (/(新零售|智慧|自助|网络)/.test(t))
        return { kind: "nav", next: { pharmMode: "newretail", pharmArea: null, pharmLeaf: null } };
    }
    if (st.pharmMode === "traditional" && !st.pharmArea) {
      if (/(非药品|食品|保健)/.test(t)) return { kind: "nav", next: { pharmArea: "nondrug", pharmLeaf: null } };
      if (/(药品|处方药|非处方|中药|阴凉)/.test(t))
        return { kind: "nav", next: { pharmArea: "drug", pharmLeaf: null } };
    }
    if (st.pharmMode === "traditional" && st.pharmArea === "drug" && !st.pharmLeaf) {
      if (/(非处方|OTC)/.test(t)) return { kind: "nav", next: { pharmLeaf: "otc" } };
      if (/(中药|饮片)/.test(t)) return { kind: "nav", next: { pharmLeaf: "tcm" } };
      if (/(阴凉)/.test(t)) return { kind: "nav", next: { pharmLeaf: "cool" } };
      if (/(处方)/.test(t)) return { kind: "nav", next: { pharmLeaf: "rx" } };
    }
    if (st.pharmMode === "traditional" && st.pharmArea === "nondrug" && !st.pharmLeaf) {
      if (/(食品|保健)/.test(t)) return { kind: "nav", next: { pharmLeaf: "food" } };
      if (/(器械)/.test(t)) return { kind: "nav", next: { pharmLeaf: "device" } };
      if (/(化妆品)/.test(t)) return { kind: "nav", next: { pharmLeaf: "cosmetic" } };
      if (/(其他)/.test(t)) return { kind: "nav", next: { pharmLeaf: "other" } };
    }
    if (st.pharmMode === "newretail" && !st.pharmLeaf) {
      if (/(新特药)/.test(t)) return { kind: "nav", next: { pharmLeaf: "newdrug" } };
      if (/(网络|智慧)/.test(t)) return { kind: "nav", next: { pharmLeaf: "online" } };
      if (/(自助|售药柜)/.test(t)) return { kind: "nav", next: { pharmLeaf: "self" } };
    }
  }

  if (/(你好|您好|谢谢|安安)/i.test(t)) return { kind: "chat" };

  return { kind: "unknown" };
}

export function zoneChips(st: NavState): { label: string; kw: string }[] {
  if (st.scene === "corridor") {
    if (!st.aspect)
      return [
        { label: "化妆区", kw: "化妆品" },
        { label: "药品区", kw: "药品" },
        { label: "器械专区", kw: "器械" },
      ];
    if (!st.chapter)
      return [
        { label: "科普篇", kw: "科普" },
        { label: "法规篇", kw: "法规" },
        { label: "案例篇", kw: "案例" },
      ];
    if (st.chapter === "casePick")
      return [
        { label: "案例一", kw: "案例一" },
        { label: "案例二", kw: "案例二" },
      ];
  }
  if (st.scene === "pharmacy") {
    if (!st.pharmMode)
      return [
        { label: "传统药房", kw: "传统" },
        { label: "新零售", kw: "新零售" },
      ];
    if (st.pharmMode === "traditional" && !st.pharmArea)
      return [
        { label: "药品区", kw: "药品" },
        { label: "非药品区", kw: "非药品" },
      ];
    if (st.pharmMode === "traditional" && st.pharmArea === "drug" && !st.pharmLeaf)
      return [
        { label: "处方药区", kw: "处方药" },
        { label: "非处方药区", kw: "非处方" },
        { label: "中药饮片", kw: "中药" },
        { label: "阴凉区", kw: "阴凉" },
      ];
    if (st.pharmMode === "traditional" && st.pharmArea === "nondrug" && !st.pharmLeaf)
      return [
        { label: "食品保健", kw: "食品" },
        { label: "医疗器械", kw: "器械" },
        { label: "化妆品", kw: "化妆品" },
        { label: "其他产品", kw: "其他" },
      ];
    if (st.pharmMode === "newretail" && !st.pharmLeaf)
      return [
        { label: "新特药", kw: "新特药" },
        { label: "智慧药房", kw: "智慧" },
        { label: "自助售药柜", kw: "自助" },
      ];
  }
  return [];
}

export function hintFor(st: NavState, welcomePhase: WelcomePhase): string {
  const head = "点击右下角麦克风与安安对话";
  if (welcomePhase === "choice_ready" && st.scene === "welcome")
    return `${head} · 可以说「宣传廊」「模拟药店」「综合培训区」`;
  if (st.scene === "corridor") return `${head} · 按屏幕右侧按钮或语音选择`;
  if (st.scene === "pharmacy") return `${head} · 按屏幕右侧按钮或语音选择`;
  return `${head}`;
}

export function videoInfoForKey(key: VideoKey) {
  return resolveVideo(key);
}

export { SCRIPTS, VIDEOS };
