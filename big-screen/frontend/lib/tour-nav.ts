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

export type UiPhase = "choosing" | "playing" | "postContent";
export type FinishedChapter = null | "science" | "law" | "case1" | "case2";

export interface NavState {
  scene: Scene;
  aspect: Aspect;
  chapter: Chapter;
  pharmMode: PharmMode;
  pharmArea: PharmArea;
  pharmLeaf: PharmLeaf;
  uiPhase: UiPhase;
  lastFinishedChapter: FinishedChapter;
  lastFinishedLeaf: PharmLeaf;
}

export type NavChip = { label: string; kw: string; patch?: Partial<NavState> };

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
    uiPhase: "choosing",
    lastFinishedChapter: null,
    lastFinishedLeaf: null,
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
  if (st.uiPhase === "postContent") return true;
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

function aspectLabel(aspect: NonNullable<Aspect>): string {
  const map: Record<NonNullable<Aspect>, string> = {
    cosmetic: "化妆区",
    drug: "药品区",
    device: "器械专区",
  };
  return map[aspect];
}

function chapterLabel(chapter: NonNullable<Chapter>): string {
  const map: Record<NonNullable<Chapter>, string> = {
    science: "科普篇",
    law: "法规篇",
    casePick: "案例篇",
    case1: "案例一",
    case2: "案例二",
  };
  return map[chapter];
}

function sceneShortLabel(scene: Scene): string {
  const map: Record<Scene, string> = {
    welcome: "迎宾大厅",
    corridor: "宣传廊",
    pharmacy: "模拟药店",
  };
  return map[scene];
}

/** 顶栏面包屑：主场景 → 专区 → 篇章/子区 */
export function locationTrail(st: NavState, welcomePhase?: WelcomePhase): string[] {
  const trail: string[] = [sceneShortLabel(st.scene)];

  if (st.scene === "corridor" && st.aspect) {
    trail.push(aspectLabel(st.aspect));
    if (st.chapter) trail.push(chapterLabel(st.chapter));
  }

  if (st.scene === "pharmacy") {
    if (st.pharmMode === "traditional") {
      trail.push("传统药房");
      if (st.pharmArea === "drug") trail.push("药品区");
      else if (st.pharmArea === "nondrug") trail.push("非药品区");
      if (st.pharmLeaf) trail.push(leafLabel(st.pharmLeaf));
    } else if (st.pharmMode === "newretail") {
      trail.push("新零售模式区");
      if (st.pharmLeaf) trail.push(leafLabel(st.pharmLeaf));
    }
  }

  if (welcomePhase === "choice_ready" && st.scene === "welcome") {
    trail.push("请选择参观区域");
  }

  return trail;
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

const PHARM_LEAF_ORDER: Record<string, NonNullable<PharmLeaf>[]> = {
  "traditional-drug": ["rx", "otc", "tcm", "cool"],
  "traditional-nondrug": ["food", "device", "cosmetic", "other"],
  newretail: ["newdrug", "online", "self"],
};

function pharmLeafOrder(st: NavState): NonNullable<PharmLeaf>[] {
  if (st.pharmMode === "traditional" && st.pharmArea === "drug") return PHARM_LEAF_ORDER["traditional-drug"];
  if (st.pharmMode === "traditional" && st.pharmArea === "nondrug")
    return PHARM_LEAF_ORDER["traditional-nondrug"];
  if (st.pharmMode === "newretail") return PHARM_LEAF_ORDER.newretail;
  return [];
}

function leafKw(leaf: NonNullable<PharmLeaf>): string {
  const map: Record<NonNullable<PharmLeaf>, string> = {
    rx: "处方药",
    otc: "非处方",
    tcm: "中药",
    cool: "阴凉",
    food: "食品",
    device: "器械",
    cosmetic: "化妆品",
    other: "其他",
    newdrug: "新特药",
    online: "智慧",
    self: "自助",
  };
  return map[leaf];
}

function siblingAspectChips(current: NonNullable<Aspect>): NavChip[] {
  const all: { label: string; kw: string; aspect: Aspect }[] = [
    { label: "化妆区", kw: "化妆品", aspect: "cosmetic" },
    { label: "药品区", kw: "药品", aspect: "drug" },
    { label: "器械专区", kw: "器械", aspect: "device" },
  ];
  return all
    .filter((x) => x.aspect !== current)
    .map((x) => ({
      label: x.label,
      kw: x.kw,
      patch: {
        aspect: x.aspect,
        chapter: null,
        uiPhase: "choosing" as const,
        lastFinishedChapter: null,
        lastFinishedLeaf: null,
      },
    }));
}

/** 内容片播完 → postContent 导航补丁 */
export function postContentStateAfterClip(
  st: NavState,
  finished: FinishedChapter
): Partial<NavState> {
  if (st.scene === "corridor" && st.aspect) {
    if (finished === "case1" || finished === "case2") {
      return { chapter: "casePick", uiPhase: "postContent", lastFinishedChapter: finished };
    }
    if (finished === "science" || finished === "law") {
      return { chapter: null, uiPhase: "postContent", lastFinishedChapter: finished };
    }
  }
  return { uiPhase: "choosing" };
}

/** postContent 15s 超时 → 回到选择界面 */
export function postContentTimeoutPatch(st: NavState): Partial<NavState> {
  if (st.scene === "corridor" && st.uiPhase === "postContent") {
    if (st.lastFinishedChapter === "case1" || st.lastFinishedChapter === "case2") {
      return { uiPhase: "choosing" };
    }
    if (st.aspect) {
      return { uiPhase: "choosing" };
    }
  }
  if (st.scene === "pharmacy" && st.uiPhase === "postContent") {
    return { uiPhase: "choosing", pharmLeaf: null };
  }
  return { uiPhase: "choosing" };
}

export function speakTextForPostContent(st: NavState): string | null {
  if (st.scene === "corridor" && st.aspect && st.uiPhase === "postContent") {
    if (st.lastFinishedChapter === "case1" || st.lastFinishedChapter === "case2") {
      return script("corridor.case.afterClip");
    }
    if (st.lastFinishedChapter === "science" || st.lastFinishedChapter === "law") {
      return script(`corridor.post.${st.aspect}.${st.lastFinishedChapter}`);
    }
  }
  if (st.scene === "pharmacy" && st.uiPhase === "postContent" && st.lastFinishedLeaf) {
    return script("pharmacy.post.leaf", { leafName: leafLabel(st.lastFinishedLeaf) });
  }
  return null;
}

export function postContentStateAfterPharmLeaf(
  st: NavState,
  finished: NonNullable<PharmLeaf>
): Partial<NavState> {
  return { pharmLeaf: null, uiPhase: "postContent", lastFinishedLeaf: finished };
}

export function postContentChips(st: NavState): NavChip[] {
  if (st.scene === "corridor" && st.aspect && st.uiPhase === "postContent") {
    if (st.lastFinishedChapter === "case1" || st.lastFinishedChapter === "case2") {
      return [
        {
          label: "案例一",
          kw: "案例一",
          patch: { chapter: "case1", uiPhase: "playing", lastFinishedChapter: null },
        },
        {
          label: "案例二",
          kw: "案例二",
          patch: { chapter: "case2", uiPhase: "playing", lastFinishedChapter: null },
        },
        {
          label: "返回篇章选择",
          kw: "返回",
          patch: { chapter: null, uiPhase: "choosing", lastFinishedChapter: null },
        },
      ];
    }
    const chips: NavChip[] = [];
    const chapters: { label: string; kw: string; chapter: Chapter }[] = [
      { label: "科普篇", kw: "科普", chapter: "science" },
      { label: "法规篇", kw: "法规", chapter: "law" },
      { label: "案例篇", kw: "案例", chapter: "casePick" },
    ];
    for (const c of chapters) {
      if (c.chapter === st.lastFinishedChapter) continue;
      chips.push({
        label: c.label,
        kw: c.kw,
        patch: {
          chapter: c.chapter,
          uiPhase: c.chapter === "casePick" ? "choosing" : "playing",
          lastFinishedChapter: null,
        },
      });
    }
    chips.push(...siblingAspectChips(st.aspect));
    chips.push({
      label: "返回宣传廊",
      kw: "返回宣传廊",
      patch: {
        aspect: null,
        chapter: null,
        uiPhase: "choosing",
        lastFinishedChapter: null,
        lastFinishedLeaf: null,
      },
    });
    return chips;
  }
  if (st.scene === "pharmacy" && st.uiPhase === "postContent" && st.lastFinishedLeaf) {
    const chips = pharmLeafOrder(st)
      .filter((l) => l !== st.lastFinishedLeaf)
      .map((l) => ({
        label: leafLabel(l),
        kw: leafKw(l),
        patch: { pharmLeaf: l, uiPhase: "playing" as const, lastFinishedLeaf: null },
      }));
    chips.push({
      label: "返回上一级",
      kw: "返回",
      patch: { uiPhase: "choosing", lastFinishedLeaf: null },
    });
    return chips;
  }
  return [];
}

export function welcomeChoiceChips(): NavChip[] {
  return [
    {
      label: "宣传廊",
      kw: "宣传廊",
      patch: {
        scene: "corridor",
        ...resetCorridorChild(),
        ...resetPharm(),
        uiPhase: "choosing",
      },
    },
    {
      label: "模拟药店",
      kw: "模拟药店",
      patch: {
        scene: "pharmacy",
        ...resetCorridorChild(),
        ...resetPharm(),
        uiPhase: "choosing",
      },
    },
    { label: "综合培训区", kw: "综合培训" },
  ];
}

export function navigationChips(st: NavState, welcomePhase?: WelcomePhase): NavChip[] {
  if (welcomePhase === "choice_ready" && st.scene === "welcome") {
    return welcomeChoiceChips();
  }
  if (st.uiPhase === "postContent") return postContentChips(st);
  return zoneChips(st).map((c) => ({ label: c.label, kw: c.kw }));
}

/** 35s 空闲：逐级回退，不直接清场 */
export function idleFallbackPatch(
  st: NavState,
  welcomePhase: WelcomePhase
): Partial<NavState> | null {
  if (welcomePhase === "choice_ready") return null;
  if (st.uiPhase === "postContent") return postContentTimeoutPatch(st);
  if (st.scene === "corridor") {
    if (st.chapter === "case1" || st.chapter === "case2")
      return { chapter: "casePick", uiPhase: "choosing" };
    if (st.chapter && st.chapter !== "casePick") return { chapter: null, uiPhase: "choosing" };
    if (st.aspect) return { aspect: null, chapter: null, uiPhase: "choosing", lastFinishedChapter: null };
  }
  if (st.scene === "pharmacy") {
    if (st.pharmLeaf) return { pharmLeaf: null, uiPhase: "choosing" };
    if (st.pharmArea) return { pharmArea: null, pharmLeaf: null, uiPhase: "choosing", lastFinishedLeaf: null };
    if (st.pharmMode)
      return { pharmMode: null, pharmArea: null, pharmLeaf: null, uiPhase: "choosing", lastFinishedLeaf: null };
  }
  if (st.scene === "welcome" && welcomePhase === "done") return null;
  return null;
}

/** CONTENT 视频：进入 science/law/case1/case2 后播放 */
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
  "pharmMode" | "pharmArea" | "pharmLeaf" | "lastFinishedLeaf"
> {
  return { pharmMode: null, pharmArea: null, pharmLeaf: null, lastFinishedLeaf: null };
}

export function resetCorridorChild(): Pick<
  NavState,
  "aspect" | "chapter" | "lastFinishedChapter"
> {
  return { aspect: null, chapter: null, lastFinishedChapter: null };
}

/** 超时默认：当前层级第一个；篇章选择记 lastFinishedChapter 跳下一个 */
export function defaultNext(st: NavState): Partial<NavState> {
  if (st.uiPhase === "postContent") return postContentTimeoutPatch(st);

  if (st.scene === "welcome") {
    return { scene: "corridor", ...resetCorridorChild(), ...resetPharm(), uiPhase: "choosing" };
  }
  if (st.scene === "corridor") {
    if (!st.aspect)
      return { aspect: "cosmetic", chapter: null, uiPhase: "choosing", lastFinishedChapter: null };
    if (!st.chapter) {
      if (st.lastFinishedChapter === "science")
        return { chapter: "law", uiPhase: "playing", lastFinishedChapter: null };
      if (st.lastFinishedChapter === "law")
        return { chapter: "casePick", uiPhase: "choosing", lastFinishedChapter: null };
      return { chapter: "science", uiPhase: "playing", lastFinishedChapter: null };
    }
    if (st.chapter === "casePick")
      return { chapter: "case1", uiPhase: "playing", lastFinishedChapter: null };
  }
  if (st.scene === "pharmacy") {
    if (!st.pharmMode)
      return { pharmMode: "traditional", pharmArea: null, pharmLeaf: null, uiPhase: "choosing" };
    if (st.pharmMode === "traditional") {
      if (!st.pharmArea)
        return { pharmArea: "drug", pharmLeaf: null, uiPhase: "choosing", lastFinishedLeaf: null };
      if (!st.pharmLeaf) {
        const order = pharmLeafOrder(st);
        if (st.lastFinishedLeaf) {
          const idx = order.indexOf(st.lastFinishedLeaf);
          if (idx >= 0 && idx < order.length - 1) {
            return { pharmLeaf: order[idx + 1], uiPhase: "playing", lastFinishedLeaf: null };
          }
        }
        return { pharmLeaf: order[0] ?? "rx", uiPhase: "playing", lastFinishedLeaf: null };
      }
    }
    if (st.pharmMode === "newretail" && !st.pharmLeaf) {
      const order = pharmLeafOrder(st);
      if (st.lastFinishedLeaf) {
        const idx = order.indexOf(st.lastFinishedLeaf);
        if (idx >= 0 && idx < order.length - 1) {
          return { pharmLeaf: order[idx + 1], uiPhase: "playing", lastFinishedLeaf: null };
        }
      }
      return { pharmLeaf: "newdrug", uiPhase: "playing", lastFinishedLeaf: null };
    }
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

  if (/(返回宣传廊|回宣传廊)/.test(t)) {
    return {
      kind: "nav",
      next: {
        aspect: null,
        chapter: null,
        uiPhase: "choosing",
        lastFinishedChapter: null,
        lastFinishedLeaf: null,
      },
    };
  }

  if (/(综合培训|培训区)/.test(t)) return { kind: "training" };

  if (/(返回|回去)/.test(t)) {
    if (st.scene === "corridor" && st.chapter) {
      if (st.chapter === "case1" || st.chapter === "case2")
        return { kind: "nav", next: { chapter: "casePick", uiPhase: "choosing" } };
      return { kind: "nav", next: { chapter: null, uiPhase: "choosing" } };
    }
    if (st.scene === "corridor" && st.aspect)
      return {
        kind: "nav",
        next: { aspect: null, chapter: null, uiPhase: "choosing", lastFinishedChapter: null },
      };
    if (st.scene === "pharmacy" && st.pharmLeaf)
      return {
        kind: "nav",
        next: {
          pharmLeaf: null,
          uiPhase: "choosing",
        },
      };
    if (st.scene === "pharmacy" && st.pharmArea)
      return {
        kind: "nav",
        next: { pharmArea: null, pharmLeaf: null, uiPhase: "choosing", lastFinishedLeaf: null },
      };
    if (st.scene === "pharmacy" && st.pharmMode)
      return {
        kind: "nav",
        next: {
          pharmMode: null,
          pharmArea: null,
          pharmLeaf: null,
          uiPhase: "choosing",
          lastFinishedLeaf: null,
        },
      };
    return {
      kind: "nav",
      next: { scene: "welcome", ...resetCorridorChild(), ...resetPharm(), uiPhase: "choosing" },
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
      if (/(化妆品|化妆|护肤)/.test(t)) return { kind: "nav", next: { aspect: "cosmetic", chapter: null, uiPhase: "choosing", lastFinishedChapter: null } };
      if (/(药品|药物)/.test(t)) return { kind: "nav", next: { aspect: "drug", chapter: null, uiPhase: "choosing", lastFinishedChapter: null } };
      if (/(器械|医疗设备|仪器)/.test(t)) return { kind: "nav", next: { aspect: "device", chapter: null, uiPhase: "choosing", lastFinishedChapter: null } };
    } else if (!st.chapter || st.chapter === "casePick") {
      if (st.aspect !== "cosmetic" && /(化妆品|化妆|护肤)/.test(t))
        return { kind: "nav", next: { aspect: "cosmetic", chapter: null, uiPhase: "choosing", lastFinishedChapter: null } };
      if (st.aspect !== "drug" && /(药品|药物)/.test(t))
        return { kind: "nav", next: { aspect: "drug", chapter: null, uiPhase: "choosing", lastFinishedChapter: null } };
      if (st.aspect !== "device" && /(器械|医疗设备|仪器)/.test(t))
        return { kind: "nav", next: { aspect: "device", chapter: null, uiPhase: "choosing", lastFinishedChapter: null } };
      if (/(科普)/.test(t)) return { kind: "nav", next: { chapter: "science", uiPhase: "playing", lastFinishedChapter: null } };
      if (/(法规)/.test(t)) return { kind: "nav", next: { chapter: "law", uiPhase: "playing", lastFinishedChapter: null } };
      if (/(案例)/.test(t) && st.chapter !== "casePick")
        return { kind: "nav", next: { chapter: "casePick", uiPhase: "choosing" } };
      if (/(案例一|案例1|第一个)/.test(t))
        return { kind: "nav", next: { chapter: "case1", uiPhase: "playing", lastFinishedChapter: null } };
      if (/(案例二|案例2|第二个)/.test(t))
        return { kind: "nav", next: { chapter: "case2", uiPhase: "playing", lastFinishedChapter: null } };
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
    return `${head} · 可以说「宣传廊」「模拟药店」「综合培训区」，或点右侧按钮`;
  if (st.uiPhase === "postContent")
    return `${head} · 请点选屏幕按钮，或说对应选项`;
  if (st.scene === "corridor") return `${head} · 按屏幕按钮或语音选择`;
  if (st.scene === "pharmacy") return `${head} · 按屏幕按钮或语音选择`;
  return `${head}`;
}

export function videoInfoForKey(key: VideoKey) {
  return resolveVideo(key);
}

export { SCRIPTS, VIDEOS };
