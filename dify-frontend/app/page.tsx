"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createVoiceProvider, genderWord, type Gender, type VoiceProvider } from "@/lib/voice";

interface Msg {
  role: "user" | "ai";
  content: string;
}

// 是否自动语音播报 AI 回答（浏览器 TTS）。改 false 可关掉。
const ENABLE_TTS = true;

// 交互模式空闲超时（毫秒）→ 无操作自动回视频模式；可在 .env 用
// NEXT_PUBLIC_IDLE_TIMEOUT_MS 覆盖（设计 §7，默认 35000=35s）。
const IDLE_TIMEOUT_MS = Number(process.env.NEXT_PUBLIC_IDLE_TIMEOUT_MS) || 35000;

// 数字人名字：客户确认前先用推荐名“安安”（一处可改，全局生效）。
const DIGITAL_HUMAN_NAME = "安安";

/* ============================================================
 * 视频插槽：客户视频按约定文件名落入 public/。
 * 已确认客户提供的真实视频放进 READY；其余分区视频待客户给，
 * 未到位时由 FALLBACK 回退到该场景已就绪视频，避免黑屏。
 * ========================================================== */
const VIDEOS = {
  welcome: "/welcome.mp4",
  corridorOverview: "/corridor-overview.mp4",
  corridorDevice: "/corridor-device.mp4",
  corridorCosmetic: "/corridor-cosmetic.mp4",
  corridorDrug: "/corridor-drug.mp4",
  pharmacy: "/pharmacy.mp4", // 客户已提供
  pharmacyTraditional: "/pharmacy-traditional.mp4",
  pharmacyNewretail: "/pharmacy-newretail.mp4",
};
// 已确认客户已提供的真实视频
const READY = new Set(["/welcome.mp4", "/corridor-overview.mp4", "/pharmacy.mp4"]);
// 某分区视频未到位 → 回退到该场景已就绪视频
const FALLBACK: Record<string, string> = {
  corridorDevice: VIDEOS.corridorOverview,
  corridorCosmetic: VIDEOS.corridorOverview,
  corridorDrug: VIDEOS.corridorOverview,
  pharmacyTraditional: VIDEOS.pharmacy,
  pharmacyNewretail: VIDEOS.pharmacy,
};

/* ===================== 导览状态机 ===================== */
type Scene = "welcome" | "corridor" | "pharmacy";
type Aspect = null | "device" | "cosmetic" | "drug"; // 仅 corridor
type Zone = null | "traditional" | "newretail"; // 仅 pharmacy

interface NavState {
  scene: Scene;
  aspect: Aspect;
  zone: Zone;
}

// 顶部标题/副标题/背景图（场景元信息，不含视频——视频由状态推导）
const SCENE_META: Record<
  Scene,
  { title: string; subtitle: string; short: string; bg: string; photo: string; avatar: string }
> = {
  welcome: {
    title: "云安区市场监管 · 普法迎宾数字人",
    subtitle: "综合培训法治教育基地 · 迎宾大厅",
    short: "迎宾大厅",
    bg: "/bg-welcome.png",
    photo: "/scene-bg-welcome.jpg",
    avatar: "/avatar-welcome.png",
  },
  corridor: {
    title: "云安区市场监管 · 普法宣传廊",
    subtitle: "综合培训法治教育基地 · 宣传廊",
    short: "宣传廊",
    bg: "/bg-corridor.png",
    photo: "/scene-bg-corridor.jpg",
    avatar: "/avatar-corridor.png",
  },
  pharmacy: {
    title: "云安区市场监管 · 模拟药店",
    subtitle: "综合培训法治教育基地 · 模拟药店",
    short: "模拟药店",
    bg: "/bg-pharmacy.png",
    photo: "/scene-bg-pharmacy.jpg",
    avatar: "/avatar-pharmacy.png",
  },
};

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// 当前状态对应的"视频插槽 key"
function currentVideoKey(s: NavState): string {
  if (s.scene === "welcome") return "welcome";
  if (s.scene === "corridor")
    return s.aspect ? "corridor" + cap(s.aspect as string) : "corridorOverview";
  return s.zone ? "pharmacy" + cap(s.zone as string) : "pharmacy";
}

// 当前状态应播放的视频（未到位则回退）
function currentVideo(s: NavState): string {
  const key = currentVideoKey(s);
  const v = (VIDEOS as any)[key];
  return READY.has(v) ? v : FALLBACK[key] || VIDEOS.welcome;
}

/* ===================== 数字人每状态脚本 ===================== */
// 称呼：根据语音模型判定性别（阶段1 浏览器原生无性别→默认“您”，
// 生产外部 ASR 会返回 male/female → “先生/女士”）。
// 中性（未识别到性别）时用“您好，我是安安…”更自然，避免“你好，您，”这种别扭句式。
function greetingLine(g: Gender): string {
  if (g === "neutral")
    return `您好，我是${DIGITAL_HUMAN_NAME}，云安市场监管普法迎宾助手。请问您今天想参观宣传廊，还是模拟药店呢？`;
  return `你好，${genderWord(g)}，我是${DIGITAL_HUMAN_NAME}，云安市场监管普法迎宾助手。请问您今天想参观宣传廊，还是模拟药店呢？`;
}
function guidanceLine(g: Gender): string {
  return `抱歉，${genderWord(g)}，我是${DIGITAL_HUMAN_NAME}，主要负责带您参观。您可以告诉我想去宣传廊还是模拟药店，或者说“返回”回到迎宾大厅。`;
}

// 对话流（问好 → 据回复判性别 → 问参观）：
// 进入互动先问好；访客开口后按音高判性别，回“先生/女士，您好”并问参观意向。
// 不询问姓氏（用户确认不读出“张先生”之类带姓称呼），避免 Piper 动态合成发音生硬。
function welcomeLine(): string {
  return `您好，我是${DIGITAL_HUMAN_NAME}，云安市场监管普法迎宾助手。`;
}
function nameReply(g: Gender): string {
  if (g === "neutral") return "您好！请问您想参观宣传廊，还是模拟药店？";
  return `${genderWord(g)}，您好！请问您想参观宣传廊，还是模拟药店？`;
}

// 进入某状态后，数字人说的"第一句话"（开场白 + 引导提问），按性别称呼。
function scriptFor(s: NavState, g: Gender): string {
  // 迎宾大厅不加性别称呼（设计：只有迎宾大厅中性，其余场景按音高加先生/女士）
  if (s.scene === "welcome") return greetingLine("neutral");
  if (s.scene === "corridor") {
    if (!s.aspect)
      return `欢迎来到普法宣传廊，${genderWord(g)}。您想重点了解哪方面？可以说器械、化妆品，或者药品。`;
    if (s.aspect === "device")
      return "这是医疗器械专区。医疗器械需依法注册备案，选购请认准注册证编号。您还可以了解化妆品或药品，或者说“返回”回到迎宾。";
    if (s.aspect === "cosmetic")
      return "这是化妆品专区。选购化妆品请认准批准文号，警惕虚假宣传。您还可以了解器械或药品，或者说“返回”回到迎宾。";
    if (s.aspect === "drug")
      return "这是药品专区。请注意处方药须凭医师处方购买，区分药品与非药品、处方药与非处方药。您还可以了解器械或化妆品，或者说“返回”回到迎宾。";
  }
  if (s.scene === "pharmacy") {
    if (!s.zone)
      return `这里是模拟药店体验区，${genderWord(g)}。想看看传统药房区，还是新零售模式区？`;
    if (s.zone === "traditional")
      return "这是传统药房区。请留意处方药销售是否合规、是否有执业药师在岗。您可以说“返回”回到迎宾。";
    if (s.zone === "newretail")
      return "这是新零售模式区。自助售药同样须遵守药品经营规范。您可以说“返回”回到迎宾。";
  }
  return "请问有什么可以帮您？";
}

// 子分区快捷入口：仅在 宣传廊 / 模拟药店 场景显示。
// 点击即走 handleUser → classify 导航，对应分区视频未到位时自动回退父场景视频。
function zoneChips(s: NavState): { label: string; kw: string }[] {
  if (s.scene === "corridor")
    return [
      { label: "器械专区", kw: "器械" },
      { label: "化妆品专区", kw: "化妆品" },
      { label: "药品专区", kw: "药品" },
    ];
  if (s.scene === "pharmacy")
    return [
      { label: "传统药房区", kw: "传统" },
      { label: "新零售模式区", kw: "新零售" },
    ];
  return [];
}

/* ===================== 意图识别（v3 规则 + 编辑距离兜底） =====================
 * 原则：导航/选择优先于其它，避免“去宣传廊？”被误判成问题。
 * Vosk small-cn 识别率有限，常见错误：宣传廊→宣传狼、器械→期限、
 * 药品→尿频。前端用“包含匹配 + 编辑距离”兜底，把错字拉回到正确关键词。
 * ====================================================================== */
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

function fuzzyMatch(text: string, keyword: string, threshold = 0.5): boolean {
  if (text.includes(keyword)) return true;
  // 短关键词用编辑距离兜底；长关键词用字符重合度兜底
  if (keyword.length <= 4) {
    // 滑动窗口：在 text 里找与 keyword 编辑距离最近的子串
    const chars = Array.from(text);
    let best = keyword.length;
    for (let i = 0; i <= chars.length - keyword.length; i++) {
      const sub = chars.slice(i, i + keyword.length).join("");
      best = Math.min(best, levenshtein(sub, keyword));
      if (best <= 1) return true;
    }
    return best <= 1;
  }
  const kc = Array.from(keyword);
  const matched = kc.filter((c) => text.includes(c)).length;
  return matched / kc.length >= threshold;
}

// 主场景跳转关键词（点名目标场景 → 直接跨跳）。
// 注意：只用「模拟药店」不用裸「药店/药房/药房区」，
// 否则在模拟药店场景说「传统药房区」会被这条正则先吞掉、永远进不了子分区。
const SCENE_JUMP: { kw: string; next: Partial<NavState> }[] = [
  { kw: "模拟药店", next: { scene: "pharmacy", aspect: null, zone: null } },
  { kw: "宣传廊", next: { scene: "corridor", aspect: null, zone: null } },
  { kw: "走廊", next: { scene: "corridor", aspect: null, zone: null } },
  { kw: "展区", next: { scene: "corridor", aspect: null, zone: null } },
  { kw: "展览", next: { scene: "corridor", aspect: null, zone: null } },
  { kw: "科普", next: { scene: "corridor", aspect: null, zone: null } },
  { kw: "迎宾大厅", next: { scene: "welcome", aspect: null, zone: null } },
  { kw: "回迎宾", next: { scene: "welcome", aspect: null, zone: null } },
  { kw: "回到大厅", next: { scene: "welcome", aspect: null, zone: null } },
  { kw: "回首页", next: { scene: "welcome", aspect: null, zone: null } },
  { kw: "首页", next: { scene: "welcome", aspect: null, zone: null } },
];

const ZONE_KEYWORDS: Record<
  Scene,
  { kw: string; next: Partial<NavState> }[]
> = {
  welcome: [],
  corridor: [
    { kw: "器械", next: { aspect: "device" } },
    { kw: "医疗设备", next: { aspect: "device" } },
    { kw: "仪器", next: { aspect: "device" } },
    { kw: "化妆品", next: { aspect: "cosmetic" } },
    { kw: "护肤", next: { aspect: "cosmetic" } },
    { kw: "药品", next: { aspect: "drug" } },
    { kw: "药物", next: { aspect: "drug" } },
  ],
  pharmacy: [
    { kw: "传统", next: { zone: "traditional" } },
    { kw: "老式", next: { zone: "traditional" } },
    { kw: "普通药房", next: { zone: "traditional" } },
    { kw: "新零售", next: { zone: "newretail" } },
    { kw: "智能", next: { zone: "newretail" } },
    { kw: "无人", next: { zone: "newretail" } },
    { kw: "自助", next: { zone: "newretail" } },
  ],
};

function fuzzyClassify(
  t: string,
  st: NavState
): { kind: "nav"; next: Partial<NavState> } | null {
  // 主场景导航：优先匹配更长的关键词（如“模拟药店”先于“宣传廊”）
  const sortedNav = [...SCENE_JUMP].sort((a, b) => b.kw.length - a.kw.length);
  for (const { kw, next } of sortedNav) {
    if (fuzzyMatch(t, kw, 0.5)) return { kind: "nav", next };
  }
  // 子分区
  for (const { kw, next } of ZONE_KEYWORDS[st.scene]) {
    if (fuzzyMatch(t, kw, 0.5)) return { kind: "nav", next };
  }
  return null;
}

// Vosk small-cn 常见同音/近音误识别 → 纠正为正确关键词。
// 在 classify 前先跑一遍，把“宣传狼”拉回到“宣传廊”等。
function correctAsrText(raw: string): string {
  // 按优先级排序：先替换长词，再替换短词，避免互相覆盖。
  const corrections: [RegExp, string][] = [
    // 宣传廊（廊 ↔ 狼）
    [/宣传狼/g, "宣传廊"],
    [/宣传朗/g, "宣传廊"],
    [/宣传蓝/g, "宣传廊"],
    // 器械（被错成“气”时，单独一个“气”无法纠正，看下面整词）
    [/期限/g, "器械"],
    [/气械/g, "器械"],
    // 药品（Vosk 偶有奇怪输出，兜底）
    [/尿频/g, "药品"],
    // 化妆品
    [/画妆品/g, "化妆品"],
    [/化装品/g, "化妆品"],
  ];
  let t = raw;
  for (const [re, rep] of corrections) {
    t = t.replace(re, rep);
  }
  return t;
}

function classify(
  raw: string,
  st: NavState
): { kind: "nav" | "chat" | "unknown"; next?: Partial<NavState> } {
  const t = correctAsrText(raw.trim());
  if (!t) return { kind: "unknown" };

  // 1. 主场景跳转（点名目标场景，跨场景直接跳）。
  //    不含裸“药店/药房/药房区”，以免在模拟药店场景吞掉「传统药房区」子分区。
  //    “回迎宾大厅/回首页”等显式回迎宾也在其中，优先于下面的“返回”上下文判断。
  const sortedJump = [...SCENE_JUMP].sort((a, b) => b.kw.length - a.kw.length);
  for (const { kw, next } of sortedJump) {
    if (fuzzyMatch(t, kw, 0.5)) return { kind: "nav", next };
  }

  // 2. “返回”＝回父级（上下文相关）：
  //    - 宣传廊叶子 → 回宣传廊；模拟药店叶子 → 回模拟药店
  //    - 顶层场景（含迎宾）→ 回迎宾大厅
  //    （“回迎宾大厅/回首页”已在第 1 步显式处理，不会落入此处）
  if (/(返回|回去)/.test(t)) {
    if (st.scene === "corridor" && st.aspect)
      return { kind: "nav", next: { aspect: null } };
    if (st.scene === "pharmacy" && st.zone)
      return { kind: "nav", next: { zone: null } };
    return { kind: "nav", next: { scene: "welcome", aspect: null, zone: null } };
  }

  // 3. 子分区（取决于当前主场景；第 1 步已排除裸药房正则，不会被主场景吞掉）
  if (st.scene === "corridor") {
    if (/(器械|医疗设备|仪器)/.test(t))
      return { kind: "nav", next: { aspect: "device" } };
    if (/(化妆品|护肤)/.test(t))
      return { kind: "nav", next: { aspect: "cosmetic" } };
    if (/(药品|药物)/.test(t))
      return { kind: "nav", next: { aspect: "drug" } };
  }
  if (st.scene === "pharmacy") {
    if (/(传统|老式|普通药房)/.test(t))
      return { kind: "nav", next: { zone: "traditional" } };
    if (/(新零售|智能|无人|自助)/.test(t))
      return { kind: "nav", next: { zone: "newretail" } };
  }

  // 4. 闲聊问候（唤醒词“安安”仅作普通闲聊，不再拦截导航）
  if (/(你好|您好|hi|hello|谢谢|感谢|你是谁|你叫什么|安安)/i.test(t))
    return { kind: "chat" };

  // 5. 模糊兜底：Vosk 小模型易把“宣传廊”识别成“宣传狼”等
  const fuzzy = fuzzyClassify(t, st);
  if (fuzzy) return fuzzy;

  // 6. 其它（问法外问题 / 没听清）→ 迎宾引导
  return { kind: "unknown" };
}

/* ===================== 组件 ===================== */
export default function Page() {
  const router = useRouter();

  // 导览状态机
  const [nav, setNav] = useState<NavState>({
    scene: "welcome",
    aspect: null,
    zone: null,
  });
  const meta = SCENE_META[nav.scene];
  const videoSrc = currentVideo(nav);

  const healthCheckedRef = useRef(false); // React StrictMode 下 useEffect 会执行两次，防止重复探测

  const [messages, setMessages] = useState<Msg[]>([]);
  const [lastAi, setLastAi] = useState("");
  const [lastUser, setLastUser] = useState("");
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [aiFresh, setAiFresh] = useState(false);
  // 模式：video = 仅播放视频（右下角一个互动按钮）；interactive = 数字人出现、可对话
  const [mode, setMode] = useState<"video" | "interactive">("video");
  // 性别（由语音模型判定，驱动“女士/先生”称呼）
  const [gender, setGender] = useState<Gender>("neutral");
  // 进入互动后等待访客“第一句回复”，据该句音高判性别后再问参观（true 时 handleUser 走首问分支）
  const awaitingFirstRef = useRef(false);
  // 调试面板：实时显示 录音 → 识别 → 意图 → 播放 每一步（语音排错用）
  const [debug, setDebug] = useState<string[]>([]);
  function pushDebug(s: string) {
    const t = new Date().toLocaleTimeString("zh-CN", { hour12: false });
    setDebug((d) => [...d.slice(-7), `[${t}] ${s}`]);
  }

  // 语音能力提供方（browser 原生 或 server 外部，见 lib/voice.ts）
  const voiceRef = useRef<VoiceProvider | null>(null);
  if (!voiceRef.current) voiceRef.current = createVoiceProvider();
  const bgVideoRef = useRef<HTMLVideoElement | null>(null);

  // 进入场景：先播放视频，数字人可见但保持待命（不主动讲话）。
  // 仅当用户主动输入/语音时，才在 handleUser 中响应并讲话。
  useEffect(() => {
    const key = new URLSearchParams(window.location.search).get("scene");
    const init: NavState =
      key && SCENE_META[key as Scene]
        ? { scene: key as Scene, aspect: null, zone: null }
        : { scene: "welcome", aspect: null, zone: null };
    setNav(init);
    setLastAi("");
    setMessages([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 点击顶部 tab：仅切换场景视频 + 数字人保持待命，不主动讲话。
  // 用户主动输入时再由 handleUser 引导。
  function switchScene(key: Scene) {
    const next: NavState = { scene: key, aspect: null, zone: null };
    setNav(next);
    setLastAi("");
    setLastUser("");
    setMessages([]);
    setConversationId("");
    setInput("");
    router.replace(`?scene=${key}`, { scroll: false });
  }

  // 切换模式时命令式控制背景视频静音（绕开 React 对 muted 属性的更新 bug）：
  // - 视频模式：恢复原声（浏览器可能拦截，由点击画面解锁）
  // - 交互模式：背景视频静音，只作数字人背景，避免与 TTS 朗读冲突
  useEffect(() => {
    const v = bgVideoRef.current;
    if (!v) return;
    v.muted = mode === "interactive";
    if (mode === "video") v.play().catch(() => {});
  }, [mode]);

  // 空闲超时：交互模式下，数字人讲解完且未在聆听时启动计时，
  // 35s（可配）无操作自动回视频模式（设计 §7）。
  useEffect(() => {
    if (mode !== "interactive") return;
    if (speaking || listening) return; // 活动进行中不计时
    const timer = setTimeout(() => {
      pushDebug("空闲 35s，自动返回视频模式");
      exitToVideo();
    }, IDLE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [mode, speaking, listening]);

  // 启动时检查语音服务是否可达，结果推到调试面板（左中显示，便于现场排错）
  useEffect(() => {
    if (healthCheckedRef.current) return;
    healthCheckedRef.current = true;
    fetch("/api/voice/health")
      .then((r) => r.json())
      .then((d) => {
        if (d.reachable) {
          pushDebug(`语音服务正常 (${d.svc})`);
        } else {
          pushDebug(
            `语音服务不可达(${d.svc})：${d.error || d.cause || "请检查 voice-service 是否已启动"}`
          );
        }
      })
      .catch((e) => {
        pushDebug(`语音健康检查失败：${e?.message || e}`);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 点击右下角"开始互动"按钮：从视频模式进入交互模式。
  // 按钮点击即"用户主动交互"，数字人出现并说开场引导（与"先播视频、等交互才交互"一致）。
  function enterInteractive() {
    setMode("interactive");
    // 进入交互：背景视频静音，避免与数字人 TTS 朗读冲突
    if (bgVideoRef.current) bgVideoRef.current.muted = true;
    // 先问好，等访客开口后据音高判性别，再问参观意向
    awaitingFirstRef.current = true;
    const say = welcomeLine();
    setLastAi(say);
    setMessages([{ role: "ai", content: say }]);
    setAiFresh(true);
    setTimeout(() => setAiFresh(false), 800);
    speak(say);
  }

  // 返回视频模式：收起数字人与输入框，回到仅播放视频状态
  function exitToVideo() {
    setMode("video");
    setLastAi("");
    setLastUser("");
    setMessages([]);
    // 返回视频模式：恢复背景视频原声
    if (bgVideoRef.current) {
      bgVideoRef.current.muted = false;
      bgVideoRef.current.play().catch(() => {});
    }
  }

  // ===== 核心：处理一次用户输入（文字或 ASR 文本）=====
  function handleUser(text: string, g?: Gender) {
    if (!text.trim() || loading) return;
    const eff = g ?? gender;

    // —— 进入互动后的第一句回复：据音高判性别，再问参观 ——
    // 若访客直接说要去哪（导航意图）则正常导航；否则按音高判性别回
    // “先生/女士，您好”并引导参观（称呼不含姓氏，不动态合成）。
    if (awaitingFirstRef.current) {
      awaitingFirstRef.current = false;
      const intentAfterName = classify(text, nav);
      if (intentAfterName.kind === "nav") {
        const next: NavState = { ...nav, ...intentAfterName.next } as NavState;
        setNav(next);
        const say = scriptFor(next, eff);
        setMessages((m) => [
          ...m,
          { role: "user", content: text },
          { role: "ai", content: say },
        ]);
        setLastAi(say);
        setLastUser(text);
        setInput("");
        setAiFresh(true);
        setTimeout(() => setAiFresh(false), 800);
        speak(say);
        router.replace(`?scene=${next.scene}`, { scroll: false });
        return;
      }
      const say = nameReply(eff);
      setMessages((m) => [
        ...m,
        { role: "user", content: text },
        { role: "ai", content: say },
      ]);
      setLastAi(say);
      setLastUser(text);
      setInput("");
      setAiFresh(true);
      setTimeout(() => setAiFresh(false), 800);
      speak(say);
      return;
    }

    const intent = classify(text, nav);
    pushDebug(`识别到文字: "${text}" → 意图=${intent.kind}`);

    setMessages((m) => [...m, { role: "user", content: text }]);
    setLastUser(text);
    setInput("");

    if (intent.kind === "nav") {
      // 导航/选择：更新状态 + 切视频 + 数字人引导，不调 Dify
      const next: NavState = { ...nav, ...intent.next } as NavState;
      setNav(next);
      const say = scriptFor(next, eff);
      setMessages((m) => [...m, { role: "ai", content: say }]);
      setLastAi(say);
      setAiFresh(true);
      setTimeout(() => setAiFresh(false), 800);
      speak(say);
      router.replace(`?scene=${next.scene}`, { scroll: false });
      return;
    }

    // 问候 / 未识别：统一给迎宾引导（网站不接知识库，不调 Dify）
    const say =
      intent.kind === "chat" ? greetingLine(eff) : guidanceLine(eff);
    setMessages((m) => [...m, { role: "ai", content: say }]);
    setLastAi(say);
    setAiFresh(true);
    setTimeout(() => setAiFresh(false), 800);
    speak(say);
  }

  // 说明：网站不再接知识库（RAG 移交给小智平台教学考环节），
  // 因此不再调用 /api/chat(Dify)。事实类问题统一由 handleUser 给迎宾引导。

  // ===== 语音播报（委托给 voice provider，默认浏览器原生 TTS）=====
  function speak(text: string) {
    if (!ENABLE_TTS) return;
    voiceRef.current?.speak(
      text,
      () => setSpeaking(true),
      () => setSpeaking(false)
    );
  }

  // ===== 语音识别（ASR）→ 交给 voice provider =====
  function startListening() {
    // 半双工锁：数字人正在讲解时不开麦，避免展厅回声/大屏喇叭自激（设计 §8.3）
    if (speaking) {
      pushDebug("讲解中，暂不开麦（半双工锁）");
      return;
    }
    if (voiceRef.current?.isListening()) {
      voiceRef.current.stop();
      setListening(false);
      pushDebug("手动停止录音");
      return;
    }
    setListening(true);
    pushDebug("开始录音（说完自动发送；也可再点一次提前结束）");
    voiceRef.current?.listen(
      (r) => {
        setListening(false);
        setGender(r.gender);
        const gLabel =
          r.gender === "male" ? "先生" : r.gender === "female" ? "女士" : "未识别";
        const vol = r.rms_dbfs != null ? ` 音量${r.rms_dbfs}dB` : "";
        pushDebug(`性别估计: ${gLabel} ｜ ASR: "${r.text}" (音频 ${r.bytes ?? 0} 字节${vol})`);
        handleUser(r.text, r.gender);
      },
      (msg) => {
        setListening(false);
        if (msg) {
          pushDebug("⚠️ " + msg);
          setLastAi("⚠️ " + msg);
        }
      },
      (dbg) => pushDebug(dbg)
    );
  }

  const statusText = speaking
    ? "正在讲解…"
    : listening
    ? "聆听中…"
    : loading
    ? "思考中…"
    : "数字人待命";

  return (
    <div className="screen">
      {/* 场景背景：按当前导览状态播放对应视频，无视频时回退图片 */}
      <div
        className="bg-layer"
        onClick={() => {
          // 视频模式下，用户点击画面任意处即解锁原声（模拟遥控/语音前先开声）
          if (mode === "video" && bgVideoRef.current) {
            bgVideoRef.current.muted = false;
            bgVideoRef.current.play().catch(() => {});
          }
        }}
      >
        {mode === "video" ? (
          <video
            key={videoSrc}
            ref={bgVideoRef}
            className="bg-video"
            src={videoSrc}
            autoPlay
            loop
            playsInline
            onCanPlay={(e) => {
              const v = e.currentTarget as HTMLVideoElement;
              // 视频模式：保留原声并播放（interactive 模式下不渲染此 video）
              v.muted = false;
              v.play().catch(() => {});
            }}
          />
        ) : (
          // 交互模式：用对应场景的现场照片作模糊(5px)背景，数字人透明 PNG 叠在其上
          <img className="bg-photo" src={meta.photo} alt="" />
        )}
      </div>
      {mode === "video" ? (
        /* 视频模式：仅右下角一个互动按钮，模拟遥控 / 语音控制输入 */
        <>
          <div className="audio-hint">点击画面任意处可开启视频原声</div>
          {/* 视频模式：底部居中场景切换条（保持纯净、不带大顶栏整框）
              点击直接切场景视频并带声播放，满足"非数字人接待也能跳场景看视频有声音" */}
          <div className="scene-switch">
            {Object.entries(SCENE_META).map(([k, s]) => (
              <button
                key={k}
                className={"sc-tab" + (k === nav.scene ? " active" : "")}
                onClick={() => switchScene(k as Scene)}
              >
                {s.short}
              </button>
            ))}
          </div>
          <button className="enter-btn" onClick={enterInteractive}>
            <span className="enter-ico">🎤</span>
            <span>开始互动</span>
          </button>
        </>
      ) : (
        <>
          <div className="bg-overlay" />

      {/* 顶部标题条 + 场景切换 tab：仅数字人（交互）界面显示，置于顶端 */}
      <header className="topbar">
        <span className="dot" />
        <div>
          <div className="title">{meta.title}</div>
          <div className="subtitle">{meta.subtitle}</div>
        </div>
        <nav className="scene-tabs">
          {Object.entries(SCENE_META).map(([k, s]) => (
            <button
              key={k}
              className={"tab" + (k === nav.scene ? " active" : "")}
              onClick={() => switchScene(k as Scene)}
            >
              {s.short}
            </button>
          ))}
        </nav>
      </header>

      {/* 中央舞台：数字人 + 对话气泡（常驻视频之上） */}
      <main className="center-stage">
        {/* AI 回复大气泡 */}
        <div
          className={
            "ai-bubble " +
            (aiFresh ? "fresh" : "") +
            (speaking ? " speaking" : "")
          }
        >
          {lastAi ? (
            <div className="bubble-content">{renderWithOS(lastAi)}</div>
          ) : null}
          {speaking && (
            <div className="sound-waves">
              <span />
              <span />
              <span />
              <span />
            </div>
          )}
        </div>

        {/* 用户问题小气泡 */}
        {lastUser && (
          <div className="user-bubble">
            <span className="you">你问：</span>
            {lastUser}
          </div>
        )}

        {/* 数字人 */}
        <Avatar speaking={speaking} listening={listening} scene={nav.scene} />

        {/* 状态标签 */}
        <div
          className={
            "status " +
            (speaking
              ? "speaking"
              : listening
              ? "listening"
              : loading
              ? "thinking"
              : "")
          }
        >
          {statusText}
        </div>

        {/* 调试面板：语音排错时显示 录音→识别→意图→播放 每一步 */}
        {debug.length > 0 && (
          <div
            style={{
              position: "fixed",
              left: 16,
              top: "50%",
              transform: "translateY(-50%)",
              maxWidth: 420,
              fontSize: 13,
              lineHeight: 1.6,
              color: "#b7f0b8",
              background: "rgba(0,0,0,0.72)",
              border: "1px solid rgba(158, 230, 160, 0.35)",
              borderRadius: 10,
              padding: "10px 12px",
              fontFamily: "Consolas, Menlo, monospace",
              pointerEvents: "none",
              zIndex: 90,
              whiteSpace: "pre-wrap",
            }}
          >
            {debug.map((d, i) => (
              <div key={i}>{d}</div>
            ))}
          </div>
        )}
      </main>

      {/* 子分区快捷入口：宣传廊 / 模拟药店 显示，点击进入对应分区（视频用父场景占位） */}
      {zoneChips(nav).length > 0 && (
        <div className="zone-chips">
          {zoneChips(nav).map((c) => (
            <button key={c.kw} className="zone-chip" onClick={() => handleUser(c.kw)}>
              {c.label}
            </button>
          ))}
        </div>
      )}

      {/* 底部输入区 */}
      <footer className="bottom-bar">
        <div className="input-bar">
          <button
            className={"btn mic" + (listening ? " listening" : "")}
            onClick={startListening}
            title="语音输入"
          >
            🎤
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleUser(input);
            }}
            placeholder="输入想咨询的法规问题，或说“去宣传廊 / 去药店 / 选药品”"
          />
          <button
            className="btn"
            onClick={() => handleUser(input)}
            disabled={loading}
          >
            发送
          </button>
        </div>
        <div className="hint">
          视频正在播放，数字人待命。您可随时输入或点麦克风与它互动；说“去宣传廊”“去模拟药店”“选药品”“返回”可切换场景。
        </div>
      </footer>
        </>
      )}

      {mode === "interactive" && (
        <button className="exit-btn" onClick={exitToVideo} title="返回视频">⤺ 返回视频</button>
      )}
    </div>
  );
}

// 把回答中的「内心OS / 动作提示」（中文或英文括号包裹）用不同样式呈现
function renderWithOS(text: string) {
  const parts = text.split(/([（(][^（）()]*[）)])/g);
  return parts.map((p: string, i: number) => {
    if (/^[（(].*[）)]$/.test(p.trim())) {
      return (
        <span className="os" key={i}>
          {p}
        </span>
      );
    }
    return <span key={i}>{p}</span>;
  });
}

// ===== 数字人形象（AI 生成图片 + 丰富动画）=====
function Avatar({
  speaking,
  listening,
  scene,
}: {
  speaking: boolean;
  listening: boolean;
  scene: Scene;
}) {
  const cls = speaking ? "speaking" : listening ? "listening" : "";
  const avatarSrc = SCENE_META[scene].avatar;
  return (
    <div className={"avatar-wrap " + cls}>
      <div className="avatar-glow" />
      <svg className="halo-svg" viewBox="0 0 200 270" xmlns="http://www.w3.org/2000/svg">
        <circle className="halo" cx="100" cy="108" r="96" />
      </svg>
      <img className="avatar-img" src={avatarSrc} alt="普法迎宾数字人" />

      {listening && (
        <div className="waves">
          <span />
          <span />
          <span />
          <span />
        </div>
      )}
    </div>
  );
}
