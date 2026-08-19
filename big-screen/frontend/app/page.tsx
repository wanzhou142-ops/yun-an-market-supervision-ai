"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import {
  PLACEHOLDER_DURATION_MS,
  resolveVideo,
  type VideoKey,
} from "@/lib/tour-config";
import {
  backgroundVideoKey,
  caseReviewReminder,
  choicePanelHeadline,
  choicePanelHint,
  classify,
  contentVideoKey,
  defaultNext,
  hintFor,
  idleFallbackPatch,
  initialNav,
  isChoicePoint,
  isQuestionText,
  locationTrail,
  mergeNav,
  navigationChips,
  postContentStateAfterClip,
  postContentStateAfterPharmLeaf,
  script,
  shouldPlayPharmacyChoice,
  speakTextForNav,
  speakTextForPostContent,
  welcomeChoiceChips,
  type FinishedChapter,
  type NavChip,
  type NavState,
  type Scene,
  type WelcomePhase,
} from "@/lib/tour-nav";
import { createVoiceProvider, type Gender, type VoiceProvider } from "@/lib/voice";
import { askDifyBlocking } from "@/lib/dify-client";
import { matchNavFromPartial, navPatchKey } from "@/lib/nav-speculative";
import { InteractIcon, NavChipIcon } from "@/lib/exhibit-icons";
import { AvatarAnimated } from "@/lib/avatar-animated";
import {
  areaLabel,
  createQuizRound,
  currentPair,
  evaluateAnswer,
  hintKeyword,
  isQuizComplete,
  isQuizControl,
  isQuizMatch,
  shouldStartPharmQuiz,
  type PharmQuizArea,
  type QuizRound,
} from "@/lib/pharmacy-quiz";

interface Msg {
  role: "user" | "ai";
  content: string;
}

const ENABLE_TTS = true;
const IDLE_TIMEOUT_MS = Number(process.env.NEXT_PUBLIC_IDLE_TIMEOUT_MS) || 35000;
const CHOICE_TIMEOUT_MS = Number(process.env.NEXT_PUBLIC_CHOICE_TIMEOUT_MS) || 15000;
const SCENE_FADE_MS = 420;
const COMPANY_NAME = "云安区市场监管";

const SCENE_META: Record<
  Scene,
  { title: string; subtitle: string; short: string; photo: string; avatar: string }
> = {
  welcome: {
    title: "云安区市场监管 · 普法迎宾数字人",
    subtitle: "综合培训法治教育基地 · 迎宾大厅",
    short: "迎宾大厅",
    photo: "/scene-bg-welcome.jpg",
    avatar: "/avatar-welcome.png",
  },
  corridor: {
    title: "云安区市场监管 · 普法宣传廊",
    subtitle: "综合培训法治教育基地 · 宣传廊",
    short: "宣传廊",
    photo: "/scene-bg-corridor.jpg",
    avatar: "/avatar-corridor.png",
  },
  pharmacy: {
    title: "云安区市场监管 · 模拟药店",
    subtitle: "综合培训法治教育基地 · 模拟药店",
    short: "模拟药店",
    photo: "/scene-bg-pharmacy.jpg",
    avatar: "/avatar-pharmacy.png",
  },
};

const TIMEOUT_WARN_SEC = 10;

function chipRevealKey(c: { kw: string; label: string }) {
  return `${c.kw}::${c.label}`;
}

function chipKeywords(c: { kw: string; label: string }): string[] {
  const extras: Record<string, string[]> = {
    化妆区: ["化妆区", "化妆品", "化妆品区"],
    药品区: ["药品区", "药品"],
    非药品区: ["非药品区", "非药品"],
    器械专区: ["器械专区", "器械", "医疗器械", "医疗器械区"],
    科普篇: ["科普篇", "科普"],
    法规篇: ["法规篇", "法规"],
    案例篇: ["案例篇", "案例"],
    案例一: ["案例一", "第一个案例"],
    案例二: ["案例二", "第二个案例"],
    传统药房: ["传统药房", "传统"],
    新零售区: ["新零售区", "新零售", "新零售模式", "新零售模式区"],
    宣传廊: ["宣传廊"],
    模拟药店: ["模拟药店"],
    综合培训区: ["综合培训区", "综合培训"],
    返回迎宾: ["返回迎宾", "回迎宾"],
    返回宣传廊: ["返回宣传廊", "回宣传廊"],
    返回模拟药店: ["返回模拟药店", "回模拟药店"],
  };
  return extras[c.label] ?? [c.label, c.kw];
}

/** 口播里真正列选项的片段；避免前文「监管法规」「真实案例」等干扰 reveal 顺序 */
function speechChoiceRegion(text: string): { region: string; offset: number } {
  const patterns: RegExp[] = [
    /设有[^。！？\n]+三大篇章[^。！？\n]*/,
    /分为三个功能区[：:][^。！？\n]*/,
    /请问您希望[^。！？\n]+/,
    /展区分为[^。！？\n]+/,
    /还想了解[^。！？\n]+/,
    /请问您想[^。！？\n]+/,
    /本区域划分[^。！？\n]+/,
    /本区域分为[^。！？\n]+/,
    /传统药房分为[^。！？\n]+/,
    /药品区主要包括[^。！？\n]+/,
    /非药品区主要包括[^。！？\n]+/,
    /新零售模式区包括[^。！？\n]+/,
    /您可以选择一个区域[^。！？\n]+/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.index != null) return { region: m[0], offset: m.index };
  }
  const parts = text.split(/[。！？\n]+/).filter(Boolean);
  const last = parts[parts.length - 1] ?? text;
  const offset = text.lastIndexOf(last);
  return { region: last, offset: offset >= 0 ? offset : 0 };
}

function chipMentionPosInSentence(sentence: string, c: { kw: string; label: string }): number {
  let best = -1;
  for (const k of chipKeywords(c)) {
    const i = sentence.indexOf(k);
    if (i >= 0 && (best < 0 || i < best)) best = i;
  }
  return best;
}

function chipsMentionedInSentence(sentence: string, chips: NavChip[]): NavChip[] {
  return chips.filter((c) => chipMentionPosInSentence(sentence, c) >= 0);
}

function chipMentionPos(text: string, c: { kw: string; label: string }): number {
  const { region, offset } = speechChoiceRegion(text);
  let best = -1;
  for (const k of chipKeywords(c)) {
    const i = region.indexOf(k);
    if (i >= 0) {
      const abs = offset + i;
      if (best < 0 || abs < best) best = abs;
    }
  }
  if (best >= 0) return best;
  for (const k of chipKeywords(c)) {
    const i = text.indexOf(k);
    if (i >= 0 && (best < 0 || i < best)) best = i;
  }
  return best;
}

/** 与 voice.ts TTS 切分一致，避免句子 index 与 onSentence 回调对不上 */
function cleanSpeechText(text: string): string {
  return text
    .replace(/[（(][^（）()]*[）)]/g, "")
    .replace(/⚠️/g, "")
    .trim();
}

function splitSpeechSentences(text: string): string[] {
  const clean = cleanSpeechText(text);
  if (!clean) return [];
  const parts: string[] = [];
  let buf = "";
  for (const ch of clean) {
    buf += ch;
    if (/[。！？；!?]/.test(ch)) {
      const s = buf.trim();
      if (s) parts.push(s);
      buf = "";
    }
  }
  const tail = buf.trim();
  if (tail) parts.push(tail);
  return parts;
}

function findSentenceIndex(sentences: string[], current: string): number {
  const cur = cleanSpeechText(current);
  if (!cur) return -1;
  for (let i = sentences.length - 1; i >= 0; i--) {
    const s = sentences[i];
    if (cur === s || cur.includes(s) || s.includes(cur)) return i;
  }
  return -1;
}

/** 列选项那句 + 后一句，由选项卡替代 */
function choiceSentenceRange(
  fullText: string,
  sentences = splitSpeechSentences(fullText)
): { start: number; end: number } | null {
  if (sentences.length === 0) return null;

  const clean = cleanSpeechText(fullText);
  const { offset } = speechChoiceRegion(fullText);

  let charPos = 0;
  let startIdx = -1;
  for (let i = 0; i < sentences.length; i++) {
    const idx = clean.indexOf(sentences[i], charPos);
    const sStart = idx >= 0 ? idx : charPos;
    const sEnd = sStart + sentences[i].length;
    if (offset >= sStart && offset < sEnd) {
      startIdx = i;
      break;
    }
    charPos = sEnd;
  }

  if (startIdx < 0) {
    for (let i = 0; i < sentences.length; i++) {
      if (
        /(?:宣传廊|模拟药店|综合培训|化妆区|药品区|器械|传统药房|新零售|科普篇|法规篇|案例篇|案例一|案例二)/.test(
          sentences[i]
        ) &&
        /(?:、|或|还是|可以选择|分为|包括|想了解|参观)/.test(sentences[i])
      ) {
        startIdx = i;
        break;
      }
    }
  }

  if (startIdx < 0) return null;
  return { start: startIdx, end: sentences.length - 1 };
}

function subtitleDisplaySegments(opts: {
  fullText: string;
  currentSentence: string;
  atChoice: boolean;
  speaking: boolean;
}): string[] {
  const { fullText, currentSentence, atChoice, speaking } = opts;

  if (!fullText && !currentSentence) return [];

  if (!atChoice) {
    const line = currentSentence || fullText;
    return line ? [line] : [];
  }

  const sentences = splitSpeechSentences(fullText);
  const range = choiceSentenceRange(fullText, sentences);
  if (!range) {
    const line = currentSentence || fullText;
    return line ? [line] : [];
  }

  const idx = currentSentence ? findSentenceIndex(sentences, currentSentence) : -1;
  const inChoiceBlock = idx >= range.start && idx <= range.end;
  const lead = range.start > 0 ? sentences[range.start - 1] : "";

  if (inChoiceBlock || (!speaking && idx >= range.start)) {
    return lead ? [lead] : [];
  }

  if (currentSentence) return [currentSentence];
  return lead ? [lead] : [];
}

function effectiveWelcomePhase(
  st: NavState,
  wp: WelcomePhase,
  speechText: string
): WelcomePhase {
  if (st.scene === "welcome" && /三个功能区|哪个区域开始/.test(speechText)) {
    return "choice_ready";
  }
  return wp;
}

function guideChipsForSpeech(st: NavState, wp: WelcomePhase, speechText: string): NavChip[] {
  const effWp = effectiveWelcomePhase(st, wp, speechText);
  if (!isChoicePoint(st, effWp)) return [];
  return navigationChips(st, effWp);
}

type SplitPhase = "speech" | "split-out" | "split" | "split-in";

export default function Page() {
  const router = useRouter();

  const [nav, setNav] = useState<NavState>(initialNav);
  const [welcomePhase, setWelcomePhase] = useState<WelcomePhase>("standby");
  const [contentPlayback, setContentPlayback] = useState<VideoKey | null>(null);
  const [placeholderActive, setPlaceholderActive] = useState(false);
  const [placeholderLabel, setPlaceholderLabel] = useState("");

  const bgKey = contentPlayback ?? backgroundVideoKey(nav, welcomePhase);
  const bgResolved = resolveVideo(bgKey);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [lastAi, setLastAi] = useState("");
  const [lastAiFull, setLastAiFull] = useState("");
  const [lastUser, setLastUser] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [aiFresh, setAiFresh] = useState(false);
  const [mode, setMode] = useState<"video" | "interactive">("video");
  const [modeOut, setModeOut] = useState<"video" | "interactive" | null>(null);
  const [splitPhase, setSplitPhase] = useState<SplitPhase>("speech");
  const [preparing, setPreparing] = useState(false);
  const [gender, setGender] = useState<Gender>("neutral");
  const [curScene, setCurScene] = useState<Scene>("welcome");
  const [prevScene, setPrevScene] = useState<Scene | null>(null);
  const [debug, setDebug] = useState<string[]>([]);
  const [navPillsVisible, setNavPillsVisible] = useState(false);
  const [revealedChipKeys, setRevealedChipKeys] = useState<string[]>([]);
  const [reminderCallout, setReminderCallout] = useState<{ content: string } | null>(null);
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [choiceSecondsLeft, setChoiceSecondsLeft] = useState<number | null>(null);
  const [idleSecondsLeft, setIdleSecondsLeft] = useState<number | null>(null);
  const [quizRound, setQuizRound] = useState<QuizRound | null>(null);

  const welcomeFlowLock = useRef(false);
  const introFinishingRef = useRef(false);
  const preheatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const introVideoWatchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chipRevealTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const welcomePhaseRef = useRef(welcomePhase);
  const modeRef = useRef(mode);
  const bgVideoRef = useRef<HTMLVideoElement | null>(null);
  const splitVideoRef = useRef<HTMLVideoElement | null>(null);
  const splitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceRef = useRef<VoiceProvider | null>(null);
  const healthCheckedRef = useRef(false);
  const placeholderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playingChapterRef = useRef<FinishedChapter>(null);
  const playingLeafRef = useRef<NonNullable<NavState["pharmLeaf"]> | null>(null);
  const caseAutoFlowRef = useRef(false);
  const convIdRef = useRef("");
  const quizRoundRef = useRef<QuizRound | null>(null);

  if (!voiceRef.current) voiceRef.current = createVoiceProvider();

  const navRef = useRef(nav);
  const speculativeLockRef = useRef<string | null>(null);
  useEffect(() => {
    navRef.current = nav;
  }, [nav]);

  useEffect(() => {
    quizRoundRef.current = quizRound;
  }, [quizRound]);

  useEffect(() => {
    welcomePhaseRef.current = welcomePhase;
  }, [welcomePhase]);

  useEffect(() => {
    if (mode === "video" && welcomePhase === "standby") {
      welcomeFlowLock.current = false;
    }
  }, [mode, welcomePhase]);

  useEffect(() => {
    void voiceRef.current?.ensureStreamReady?.((d) => pushDebug(d));
  }, []);

  useEffect(() => {
    setDebugEnabled(new URLSearchParams(window.location.search).get("debug") === "1");
  }, []);

  const showInteractive =
    mode === "interactive" &&
    welcomePhase !== "intro_video" &&
    !contentPlayback &&
    !placeholderActive &&
    splitPhase === "speech";

  const showSplitChrome =
    splitPhase === "split-out" || splitPhase === "split" || splitPhase === "split-in";

  const showInteractiveChrome =
    mode === "interactive" && welcomePhase !== "standby";

  /** 交互模式下背景视频始终静音（含内容片），避免与 TTS 叠音 */
  const bgVideoMuted =
    mode === "interactive" && welcomePhase !== "intro_video";

  const videoLoop =
    welcomePhase === "standby" ||
    (mode === "video" && welcomePhase !== "intro_video" && !contentPlayback);

  function pushDebug(s: string) {
    const t = new Date().toLocaleTimeString("zh-CN", { hour12: false });
    setDebug((d) => [...d.slice(-7), `[${t}] ${s}`]);
  }

  function setWelcomePhaseSync(phase: WelcomePhase) {
    welcomePhaseRef.current = phase;
    setWelcomePhase(phase);
  }

  /** 交互/TTS 阶段：背景视频停播且静音，避免与数字人叠音 */
  function pauseBgVideoForSpeech() {
    const v = bgVideoRef.current;
    if (!v) return;
    v.pause();
    v.muted = true;
  }

  /** 视频模式：恢复背景视频原声播放 */
  function resumeBgVideoWithSound(opts?: { loop?: boolean }) {
    const v = bgVideoRef.current;
    if (!v) return;
    if (opts?.loop != null) v.loop = opts.loop;
    v.muted = false;
    v.play().catch(() => {});
  }

  function enterInteractiveSpeech() {
    voiceRef.current?.cancel();
    setSpeaking(false);
    pauseBgVideoForSpeech();
    setMode("interactive");
  }

  function enterVideoPlayback(opts?: { loop?: boolean }) {
    setMode("video");
    requestAnimationFrame(() => resumeBgVideoWithSound(opts));
  }

  const clearSplitTimer = useCallback(() => {
    if (splitTimerRef.current) {
      clearTimeout(splitTimerRef.current);
      splitTimerRef.current = null;
    }
  }, []);

  const enterSplitPlayback = useCallback(
    (activate: () => void) => {
      clearSplitTimer();
      setSplitPhase("split-out");
      splitTimerRef.current = setTimeout(() => {
        activate();
        setSplitPhase("split");
        splitTimerRef.current = null;
      }, SCENE_FADE_MS);
    },
    [clearSplitTimer]
  );

  const exitSplitPlayback = useCallback(
    (deactivate: () => void) => {
      clearSplitTimer();
      setSplitPhase("split-in");
      splitTimerRef.current = setTimeout(() => {
        deactivate();
        setSplitPhase("speech");
        splitTimerRef.current = null;
      }, SCENE_FADE_MS);
    },
    [clearSplitTimer]
  );

  const clearChipRevealTimers = useCallback(() => {
    chipRevealTimersRef.current.forEach(clearTimeout);
    chipRevealTimersRef.current = [];
  }, []);

  const dismissNavPills = useCallback(() => {
    clearChipRevealTimers();
    setRevealedChipKeys([]);
    setNavPillsVisible(false);
  }, [clearChipRevealTimers]);

  const scheduleChipReveal = useCallback(
    (sentence: string, chips: NavChip[], charMs = 200) => {
      const pending = chipsMentionedInSentence(sentence, chips);
      if (pending.length === 0) return;

      pending.sort(
        (a, b) => chipMentionPosInSentence(sentence, a) - chipMentionPosInSentence(sentence, b)
      );

      pending.forEach((c) => {
        const key = chipRevealKey(c);
        const pos = chipMentionPosInSentence(sentence, c);
        const delay = Math.max(0, pos * charMs);
        const timer = setTimeout(() => {
          setRevealedChipKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
        }, delay);
        chipRevealTimersRef.current.push(timer);
      });
    },
    []
  );

  const maybeRevealChipsAtChoice = useCallback(
    (speechText: string, sentence: string, chips: NavChip[]) => {
      const sentences = splitSpeechSentences(speechText);
      const range = choiceSentenceRange(speechText, sentences);
      const idx = findSentenceIndex(sentences, sentence);

      if (range && idx >= 0 && idx < range.start) return;

      scheduleChipReveal(sentence, chips);
    },
    [scheduleChipReveal]
  );

  const revealMissedChips = useCallback(
    (speechText: string, chips: NavChip[]) => {
      const missed = chips.filter(
        (c) => chipMentionPos(speechText, c) >= 0
      );
      if (missed.length === 0) return;

      missed.sort((a, b) => chipMentionPos(speechText, a) - chipMentionPos(speechText, b));
      missed.forEach((c, i) => {
        const key = chipRevealKey(c);
        const timer = setTimeout(() => {
          setRevealedChipKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
        }, i * 350);
        chipRevealTimersRef.current.push(timer);
      });
    },
    []
  );

  const speak = useCallback(
    (
      text: string,
      onEnd?: () => void,
      onSentence?: (sentence: string, index: number) => void,
      onStart?: () => void,
      onSpeechDuration?: (durationSec: number) => void
    ) => {
      if (!ENABLE_TTS || !text) {
        onStart?.();
        onEnd?.();
        return;
      }
      voiceRef.current?.speak(
        text,
        () => {
          setSpeaking(true);
          onStart?.();
        },
        () => {
          setSpeaking(false);
          onEnd?.();
        },
        onSentence,
        onSpeechDuration
      );
    },
    []
  );

  const aiSay = useCallback(
    (
      text: string,
      onEnd?: () => void,
      reset = false,
      opts?: { reminder?: boolean; skipMessages?: boolean }
    ) => {
      const st = navRef.current;
      const wp = welcomePhaseRef.current;
      const guideChips = opts?.reminder ? [] : guideChipsForSpeech(st, wp, text);
      const atChoice = guideChips.length > 0;

      const reveal = (sentence: string, _sentenceIndex?: number) => {
        if (opts?.reminder) return;
        setLastAi(sentence);
        setAiFresh(true);
        setTimeout(() => setAiFresh(false), 800);
        if (atChoice) maybeRevealChipsAtChoice(text, sentence, guideChips);
      };

      if (atChoice) {
        setNavPillsVisible(true);
        clearChipRevealTimers();
        setRevealedChipKeys([]);
      }
      if (!opts?.reminder) setReminderCallout(null);

      if (!opts?.reminder) {
        setLastAi("");
        setLastAiFull(text);
      }

      if (!opts?.skipMessages) {
        setMessages((m) =>
          reset ? [{ role: "ai", content: text }] : [...m, { role: "ai", content: text }]
        );
      }

      if (!ENABLE_TTS || !text.trim()) {
        reveal(text, 0);
        if (atChoice) {
          const sentences = splitSpeechSentences(text);
          const range = choiceSentenceRange(text, sentences);
          const listing = range ? sentences[range.start] : text;
          if (listing) scheduleChipReveal(listing, guideChips, 320);
        }
        onEnd?.();
        return;
      }

      speak(
        text,
        () => {
          if (atChoice) revealMissedChips(text, guideChips);
          onEnd?.();
        },
        reveal
      );
    },
    [speak, scheduleChipReveal, maybeRevealChipsAtChoice, revealMissedChips, clearChipRevealTimers]
  );

  const aiSayCaseReview = useCallback(
    (aspect: "cosmetic" | "drug" | "device", caseNum: 1 | 2, onDone?: () => void) => {
      const body = script(`corridor.${aspect}.case${caseNum}.review`);
      const reminder = caseReviewReminder(aspect, caseNum);
      aiSay(body, () => {
        setLastAi("");
        setLastAiFull("");
        setReminderCallout({ content: reminder });
        aiSay(script(`corridor.${aspect}.case${caseNum}.reminder.say`), () => {
          setReminderCallout(null);
          onDone?.();
        }, false, { reminder: true, skipMessages: true });
      });
    },
    [aiSay]
  );

  const clearPlaceholderTimer = () => {
    if (placeholderTimerRef.current) {
      clearTimeout(placeholderTimerRef.current);
      placeholderTimerRef.current = null;
    }
  };

  const finishContentPlayback = useCallback(() => {
    const finishedChapter = playingChapterRef.current;
    const finishedLeaf = playingLeafRef.current;
    exitSplitPlayback(() => {
      playingChapterRef.current = null;
      playingLeafRef.current = null;
      clearPlaceholderTimer();
      setPlaceholderActive(false);
      setContentPlayback(null);
      const v = splitVideoRef.current;
      if (v) {
        v.pause();
        v.muted = true;
      }
      if (finishedChapter) enterPostContentRef.current?.(finishedChapter);
      else if (finishedLeaf) enterPostContentPharmacyRef.current?.(finishedLeaf);
    });
  }, [exitSplitPlayback]);

  const enterPostContentPharmacy = useCallback(
    (finished: NonNullable<NavState["lastFinishedLeaf"]>) => {
      const patch = postContentStateAfterPharmLeaf(navRef.current, finished);
      const next = mergeNav(navRef.current, patch);
      navRef.current = next;
      setNav(next);
      const say = speakTextForPostContent(next);
      if (say) {
        voiceRef.current?.cancel();
        setSpeaking(false);
        aiSay(say);
      }
    },
    [aiSay]
  );

  const enterPostContentPharmacyRef = useRef(enterPostContentPharmacy);
  enterPostContentPharmacyRef.current = enterPostContentPharmacy;

  const promptQuizQuestion = useCallback(
    (round: QuizRound) => {
      if (isQuizComplete(round)) {
        const total = round.pairs.length;
        aiSay(
          script("pharmacy.quiz.areaComplete", {
            areaName: areaLabel(round.area),
            total: String(total),
            score: String(round.score),
          }),
          () => {
            setQuizRound(null);
            const next = mergeNav(navRef.current, { uiPhase: "choosing" });
            navRef.current = next;
            setNav(next);
            exitSplitPlayback(() => {});
          }
        );
        return;
      }
      aiSay(script("pharmacy.quiz.prompt"));
    },
    [aiSay, exitSplitPlayback]
  );

  const startPharmacyQuiz = useCallback(
    (area: PharmQuizArea) => {
      const round = createQuizRound(area);
      if (!round.pairs.length) {
        aiSay(script("pharmacy.quiz.noPairs"));
        return;
      }
      setQuizRound(round);
      quizRoundRef.current = round;
      const next = mergeNav(navRef.current, { uiPhase: "quiz", pharmLeaf: null });
      navRef.current = next;
      setNav(next);
      enterSplitPlayback(() => promptQuizQuestion(round));
    },
    [aiSay, enterSplitPlayback, promptQuizQuestion]
  );

  const advanceQuizQuestion = useCallback(
    (round: QuizRound, correct: boolean) => {
      const nextRound: QuizRound = {
        ...round,
        index: round.index + 1,
        score: correct ? round.score + 1 : round.score,
        attempts: 0,
        hintShown: false,
      };
      quizRoundRef.current = nextRound;
      setQuizRound(nextRound);
      if (isQuizComplete(nextRound)) {
        promptQuizQuestion(nextRound);
        return;
      }
      aiSay(script("pharmacy.quiz.next"), () => promptQuizQuestion(nextRound));
    },
    [aiSay, promptQuizQuestion]
  );

  const handleQuizUser = useCallback(
    (text: string) => {
      const round = quizRoundRef.current;
      if (!round || navRef.current.uiPhase !== "quiz") return;

      const control = isQuizControl(text);
      const pair = currentPair(round);

      if (control === "next" || control === "skip") {
        advanceQuizQuestion(round, false);
        return;
      }

      if (control === "reveal" && pair) {
        aiSay(script("pharmacy.quiz.reveal", { answer: pair.answer }), () =>
          advanceQuizQuestion(round, false)
        );
        return;
      }

      if (control === "giveUp" && pair) {
        if (!round.hintShown) {
          const hinted = { ...round, hintShown: true };
          quizRoundRef.current = hinted;
          setQuizRound(hinted);
          aiSay(script("pharmacy.quiz.hint", { hint: hintKeyword(pair) }));
        } else {
          aiSay(script("pharmacy.quiz.reveal", { answer: pair.answer }), () =>
            advanceQuizQuestion(round, false)
          );
        }
        return;
      }

      if (control === "hint" && pair) {
        aiSay(script("pharmacy.quiz.hint", { hint: hintKeyword(pair) }));
        return;
      }

      if (!pair) return;

      const result = evaluateAnswer(round, text);
      if (isQuizMatch(result)) {
        aiSay(script("pharmacy.quiz.correct", { answer: pair.answer }), () =>
          advanceQuizQuestion(round, true)
        );
        return;
      }

      const attempts = round.attempts + 1;
      const tried = { ...round, attempts };
      quizRoundRef.current = tried;
      setQuizRound(tried);

      if (attempts >= 2) {
        aiSay(script("pharmacy.quiz.reveal", { answer: pair.answer }), () =>
          advanceQuizQuestion(tried, false)
        );
        return;
      }

      aiSay(script("pharmacy.quiz.wrong"));
    },
    [advanceQuizQuestion, aiSay]
  );

  const enterPostContentRef = useRef<(finished: FinishedChapter) => void>(() => {});

  function stopVoiceAndPlayback() {
    voiceRef.current?.cancel();
    setSpeaking(false);
    clearPlaceholderTimer();
    clearSplitTimer();
    setSplitPhase("speech");
    setContentPlayback(null);
    setPlaceholderActive(false);
    playingChapterRef.current = null;
    playingLeafRef.current = null;
    caseAutoFlowRef.current = false;
    setReminderCallout(null);
    const v = splitVideoRef.current;
    if (v) {
      v.pause();
      v.muted = true;
    }
  }

  const applyNavSilent = useCallback((patch: Partial<NavState>) => {
    stopVoiceAndPlayback();
    if (navRef.current.uiPhase === "quiz") {
      setQuizRound(null);
    }
    const next = mergeNav(navRef.current, patch);
    navRef.current = next;
    setNav(next);
  }, []);

  const startContentPlayback = useCallback(
    (key: VideoKey) => {
      enterSplitPlayback(() => {
        const info = resolveVideo(key);
        setContentPlayback(key);
        if (!info.ready) {
          setPlaceholderLabel(info.label);
          setPlaceholderActive(true);
          placeholderTimerRef.current = setTimeout(() => {
            finishContentPlayback();
          }, PLACEHOLDER_DURATION_MS);
          return;
        }
        setPlaceholderActive(false);
        requestAnimationFrame(() => {
          const v = splitVideoRef.current;
          if (!v) return;
          v.loop = false;
          v.currentTime = 0;
          v.muted = true;
          v.play().catch(() => {});
        });
      });
    },
    [enterSplitPlayback, finishContentPlayback]
  );

  const playCaseChapter = useCallback(
    (chapter: "case1" | "case2") => {
      dismissNavPills();
      const next = mergeNav(navRef.current, {
        chapter,
        uiPhase: "playing",
        lastFinishedChapter: null,
      });
      navRef.current = next;
      setNav(next);
      const cv = contentVideoKey(next);
      if (cv) {
        playingChapterRef.current = chapter;
        startContentPlayback(cv);
      }
    },
    [dismissNavPills, startContentPlayback]
  );

  const beginCaseAutoFlow = useCallback(() => {
    caseAutoFlowRef.current = true;
    aiSay(script("corridor.case.case1.before"), () => playCaseChapter("case1"));
  }, [aiSay, playCaseChapter]);

  const handleCaseClipFinished = useCallback(
    (finished: "case1" | "case2") => {
      const st = navRef.current;
      const aspect = st.aspect;
      if (!aspect) return;

      if (caseAutoFlowRef.current) {
        if (finished === "case1") {
          aiSayCaseReview(aspect, 1, () => {
            aiSay(script("corridor.case.case2.before"), () => playCaseChapter("case2"));
          });
          return;
        }
        aiSayCaseReview(aspect, 2, () => {
          caseAutoFlowRef.current = false;
          const next = mergeNav(st, {
            chapter: null,
            uiPhase: "postContent",
            lastFinishedChapter: "case2",
          });
          navRef.current = next;
          setNav(next);
          aiSay(script("corridor.case.afterAll"));
        });
        return;
      }

      const patch = postContentStateAfterClip(st, finished);
      const next = mergeNav(st, patch);
      navRef.current = next;
      setNav(next);
      const say = speakTextForPostContent(next);
      if (say) {
        voiceRef.current?.cancel();
        setSpeaking(false);
        aiSay(say);
      }
    },
    [aiSayCaseReview, aiSay, playCaseChapter]
  );

  const enterPostContent = useCallback(
    (finished: FinishedChapter) => {
      if (finished === "case1" || finished === "case2") {
        handleCaseClipFinished(finished);
        return;
      }
      const patch = postContentStateAfterClip(navRef.current, finished);
      const next = mergeNav(navRef.current, patch);
      navRef.current = next;
      setNav(next);
      const say = speakTextForPostContent(next);
      if (say) {
        voiceRef.current?.cancel();
        setSpeaking(false);
        aiSay(say);
      }
    },
    [aiSay, handleCaseClipFinished]
  );

  enterPostContentRef.current = enterPostContent;

  const clearIntroVideoWatch = useCallback(() => {
    if (introVideoWatchRef.current) {
      clearTimeout(introVideoWatchRef.current);
      introVideoWatchRef.current = null;
    }
  }, []);

  const clearPreheatTimer = useCallback(() => {
    if (preheatTimerRef.current) {
      clearTimeout(preheatTimerRef.current);
      preheatTimerRef.current = null;
    }
  }, []);

  const startWelcomeChoice = useCallback(() => {
    clearIntroVideoWatch();
    introFinishingRef.current = false;
    setWelcomePhaseSync("choice_ready");
    setMode("interactive");
    pauseBgVideoForSpeech();
    setNavPillsVisible(true);
    clearChipRevealTimers();
    setRevealedChipKeys([]);
    const say = script("welcome.choice");
    aiSay(say, undefined, true);
  }, [aiSay, clearIntroVideoWatch, clearChipRevealTimers]);

  const finishIntroVideo = useCallback(() => {
    if (welcomePhaseRef.current !== "intro_video") return;
    if (introFinishingRef.current) return;
    introFinishingRef.current = true;
    clearIntroVideoWatch();
    pauseBgVideoForSpeech();
    voiceRef.current?.cancel();
    setSpeaking(false);
    exitSplitPlayback(() => {
      startWelcomeChoice();
    });
  }, [clearIntroVideoWatch, exitSplitPlayback, startWelcomeChoice]);

  const playIntroVideo = useCallback(() => {
    const v = splitVideoRef.current;
    if (!v) {
      pushDebug("intro 视频元素缺失，跳过至选项");
      finishIntroVideo();
      return;
    }

    v.loop = false;
    v.currentTime = 0;
    v.muted = false;
    v.play().catch(() => {
      pushDebug("intro 视频无法播放，跳过至选项");
      finishIntroVideo();
    });

    clearIntroVideoWatch();
    const dur =
      v.duration > 0 && Number.isFinite(v.duration) ? v.duration : 12;
    introVideoWatchRef.current = setTimeout(() => {
      if (welcomePhaseRef.current !== "intro_video") return;
      pushDebug("intro 视频超时，自动进入选项");
      finishIntroVideo();
    }, Math.ceil(dur * 1000) + 2500);
  }, [clearIntroVideoWatch, finishIntroVideo]);

  const startIntroReplay = useCallback(() => {
    introFinishingRef.current = false;
    enterSplitPlayback(() => {
      setWelcomePhaseSync("intro_video");
      setLastAi("");
      setLastAiFull("");
      requestAnimationFrame(() => playIntroVideo());
    });
  }, [enterSplitPlayback, playIntroVideo]);

  const navigateTo = useCallback(
    (patch: Partial<NavState>, resetConversation = false, silent = false) => {
      dismissNavPills();
      stopVoiceAndPlayback();
      const merged: Partial<NavState> = { ...patch };
      if (
        merged.chapter === "science" ||
        merged.chapter === "law" ||
        merged.chapter === "case1" ||
        merged.chapter === "case2"
      ) {
        merged.uiPhase = merged.uiPhase ?? "playing";
        merged.lastFinishedChapter = null;
      }
      if (merged.pharmLeaf) {
        merged.uiPhase = merged.uiPhase ?? "playing";
        merged.lastFinishedLeaf = null;
      }
      if (!merged.uiPhase && !merged.chapter && !merged.pharmLeaf) {
        merged.uiPhase = "choosing";
      }

      if (
        merged.chapter === "case1" ||
        merged.chapter === "case2"
      ) {
        caseAutoFlowRef.current = false;
      }

      const prev = navRef.current;
      const next = mergeNav(prev, merged);
      navRef.current = next;
      setNav(next);
      if (resetConversation) {
        setMessages([]);
        setLastUser("");
      }
      if (next.scene !== curScene) {
        setPrevScene(curScene);
        setCurScene(next.scene);
        setTimeout(() => setPrevScene(null), SCENE_FADE_MS);
      }
      router.replace(`?scene=${next.scene}`, { scroll: false });

      if (silent) {
        if (next.scene !== "welcome") setWelcomePhaseSync("done");
        return;
      }

      const say = speakTextForNav(next, prev);
      const cv = contentVideoKey(next);
      const pharmacyChoice = shouldPlayPharmacyChoice(prev, next)
        ? script("pharmacy.choice")
        : null;

      const afterSpeech = () => {
        if (shouldStartPharmQuiz(prev, next)) {
          const area =
            next.pharmMode === "newretail"
              ? "newretail"
              : next.pharmArea === "drug"
              ? "drug"
              : next.pharmArea === "nondrug"
              ? "nondrug"
              : null;
          if (area) {
            startPharmacyQuiz(area);
            return;
          }
        }
        if (next.chapter === "casePick" && next.aspect) {
          beginCaseAutoFlow();
          return;
        }
        if (cv) {
          if (
            next.chapter === "science" ||
            next.chapter === "law" ||
            next.chapter === "case1" ||
            next.chapter === "case2"
          ) {
            playingChapterRef.current = next.chapter;
          }
          if (next.pharmLeaf) {
            playingLeafRef.current = next.pharmLeaf;
          }
          startContentPlayback(cv);
        } else if (next.pharmLeaf) {
          enterPostContentPharmacy(next.pharmLeaf);
        }
      };

      if (say && pharmacyChoice) {
        aiSay(say, () => aiSay(pharmacyChoice, afterSpeech));
      } else if (say) aiSay(say, afterSpeech);
      else if (cv) {
        if (
          next.chapter === "science" ||
          next.chapter === "law" ||
          next.chapter === "case1" ||
          next.chapter === "case2"
        ) {
          playingChapterRef.current = next.chapter;
        }
        if (next.pharmLeaf) {
          playingLeafRef.current = next.pharmLeaf;
        }
        startContentPlayback(cv);
      } else if (next.pharmLeaf) {
        enterPostContentPharmacy(next.pharmLeaf);
      }

      if (next.scene !== "welcome") setWelcomePhaseSync("done");
    },
    [curScene, router, aiSay, startContentPlayback, enterPostContentPharmacy, dismissNavPills, beginCaseAutoFlow, startPharmacyQuiz]
  );

  const applyDefaultChoice = useCallback(() => {
    if (welcomePhase === "choice_ready") {
      pushDebug("选择超时，默认进入宣传廊");
      navigateTo(defaultNext(initialNav()));
      return;
    }
    const st = navRef.current;
    const patch = defaultNext(st);
    if (!Object.keys(patch).length) return;
    if (st.uiPhase === "postContent") {
      pushDebug("postContent 超时，回到选择界面");
      applyNavSilent(patch);
      return;
    }
    pushDebug("选择超时，默认下一项");
    navigateTo(patch);
  }, [welcomePhase, navigateTo, applyNavSilent]);

  useEffect(() => {
    const old = modeRef.current;
    if (old !== mode) {
      setModeOut(old);
      const t = setTimeout(() => setModeOut(null), SCENE_FADE_MS);
      modeRef.current = mode;
      return () => clearTimeout(t);
    }
  }, [mode]);

  useEffect(() => {
    setNav(initialNav());
    setWelcomePhaseSync("standby");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (nav.scene === curScene) return;
    setPrevScene(curScene);
    setCurScene(nav.scene);
    const t = setTimeout(() => setPrevScene(null), SCENE_FADE_MS);
    return () => clearTimeout(t);
  }, [nav.scene, curScene]);

  useEffect(() => {
    const v = bgVideoRef.current;
    if (!v) return;
    if (mode === "interactive") {
      v.muted = true;
      v.pause();
      return;
    }
    if (mode === "video" && !contentPlayback) {
      v.muted = false;
      if (welcomePhase === "standby") v.loop = true;
      v.play().catch(() => {});
    }
  }, [mode, welcomePhase, contentPlayback, placeholderActive, bgKey, bgResolved.ready]);

  useEffect(() => {
    const v = splitVideoRef.current;
    if (!v || splitPhase !== "split") return;
    if (welcomePhase === "intro_video") {
      v.loop = false;
      v.muted = false;
      v.play().catch(() => {});
      return;
    }
    if (contentPlayback || placeholderActive) {
      v.muted = true;
      if (contentPlayback && bgResolved.ready && !placeholderActive) {
        v.loop = false;
        v.play().catch(() => {});
      }
    }
  }, [splitPhase, welcomePhase, contentPlayback, placeholderActive, bgKey, bgResolved.ready]);

  useEffect(() => {
    if (!showInteractive || speaking || listening || preparing || loading) {
      setIdleSecondsLeft(null);
      return;
    }
    if (contentPlayback || placeholderActive) {
      setIdleSecondsLeft(null);
      return;
    }
    const deadline = Date.now() + IDLE_TIMEOUT_MS;
    const tick = () => {
      const left = Math.ceil((deadline - Date.now()) / 1000);
      setIdleSecondsLeft(left > 0 ? left : 0);
    };
    tick();
    const interval = setInterval(tick, 500);
    const timer = setTimeout(() => {
      const patch = idleFallbackPatch(navRef.current, welcomePhase);
      if (patch) {
        pushDebug("空闲超时，回到上一级选择");
        applyNavSilent(patch);
      } else {
        pushDebug("空闲超时，返回待机视频");
        exitToVideo();
      }
    }, IDLE_TIMEOUT_MS);
    return () => {
      clearInterval(interval);
      clearTimeout(timer);
      setIdleSecondsLeft(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInteractive, speaking, listening, preparing, loading, contentPlayback, placeholderActive, nav, welcomePhase]);

  useEffect(() => {
    if (speaking || listening || preparing || loading) {
      setChoiceSecondsLeft(null);
      return;
    }
    if (contentPlayback || placeholderActive) {
      setChoiceSecondsLeft(null);
      return;
    }
    if (!isChoicePoint(nav, welcomePhase)) {
      setChoiceSecondsLeft(null);
      return;
    }
    const deadline = Date.now() + CHOICE_TIMEOUT_MS;
    const tick = () => {
      const left = Math.ceil((deadline - Date.now()) / 1000);
      setChoiceSecondsLeft(left > 0 ? left : 0);
    };
    tick();
    const interval = setInterval(tick, 500);
    const timer = setTimeout(applyDefaultChoice, CHOICE_TIMEOUT_MS);
    return () => {
      clearInterval(interval);
      clearTimeout(timer);
      setChoiceSecondsLeft(null);
    };
  }, [
    nav,
    welcomePhase,
    speaking,
    listening,
    preparing,
    loading,
    contentPlayback,
    placeholderActive,
    applyDefaultChoice,
  ]);

  useEffect(() => {
    if (healthCheckedRef.current) return;
    healthCheckedRef.current = true;
    fetch("/api/voice/health")
      .then((r) => r.json())
      .then((d) => {
        pushDebug(d.reachable ? `语音服务正常 (${d.svc})` : `语音服务不可达`);
      })
      .catch(() => pushDebug("语音健康检查失败"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function exitToVideo() {
    dismissNavPills();
    welcomeFlowLock.current = false;
    introFinishingRef.current = false;
    clearIntroVideoWatch();
    clearPreheatTimer();
    stopVoiceAndPlayback();
    setWelcomePhaseSync("standby");
    setPreparing(false);
    setNav(initialNav());
    navRef.current = initialNav();
    setCurScene("welcome");
    setLastAi("");
    setLastAiFull("");
    setLastUser("");
    setMessages([]);
    convIdRef.current = "";
    enterVideoPlayback({ loop: true });
  }

  function beginWelcomeIntroSpeech() {
    clearPreheatTimer();
    setPreparing(false);
    enterInteractiveSpeech();
    setWelcomePhaseSync("intro_speaking");
    const afterIntro = () => startIntroReplay();
    aiSay(script("welcome.intro"), afterIntro, true);
  }

  function enterInteractive() {
    if (welcomeFlowLock.current) return;
    if (mode !== "video" || contentPlayback || placeholderActive) return;
    if (welcomePhase !== "standby") {
      setWelcomePhaseSync("standby");
      setNav(initialNav());
      navRef.current = initialNav();
      setCurScene("welcome");
    }
    welcomeFlowLock.current = true;
    setWelcomePhaseSync("intro_speaking");
    setMode("interactive");
    setPreparing(true);

    const preheat = voiceRef.current?.preheat;
    if (!preheat) {
      beginWelcomeIntroSpeech();
      return;
    }

    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      clearPreheatTimer();
      beginWelcomeIntroSpeech();
    };

    preheatTimerRef.current = setTimeout(() => {
      pushDebug("麦克风预热超时，继续导览");
      settle();
    }, 8000);

    preheat(
      () => settle(),
      (msg) => {
        if (msg) pushDebug("⚠️ " + msg);
        settle();
      },
      (dbg) => pushDebug(dbg)
    );
  }

  function handleVideoEnded() {
    if (welcomePhaseRef.current === "intro_video") {
      finishIntroVideo();
      return;
    }
    if (contentPlayback && bgResolved.ready) {
      finishContentPlayback();
    }
  }

  async function askDify(question: string) {
    voiceRef.current?.cancel();
    setSpeaking(false);
    setLoading(true);
    pushDebug("Dify 问答中…");
    const nav = navRef.current;
    const inputs = {
      scene: nav.scene,
      aspect: nav.aspect,
      chapter: nav.chapter,
    };

    try {
      const { answer, conversationId } = await askDifyBlocking(
        question,
        inputs,
        convIdRef.current
      );
      if (conversationId) convIdRef.current = conversationId;
      pushDebug(`Dify 回答 ${answer.length} 字`);
      setLoading(false);
      if (answer) aiSay(answer);
      else aiSay(script("global.fallback"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      pushDebug("⚠️ Dify: " + msg);
      setLoading(false);
      voiceRef.current?.cancel();
      aiSay(script("global.fallback"));
    }
  }

  function trySpeculativeNav(partial: string) {
    if (loading) return;
    if (welcomePhase === "intro_speaking" || welcomePhase === "intro_video") return;
    const patch = matchNavFromPartial(partial, navRef.current);
    if (!patch) return;
    const key = navPatchKey(patch);
    if (speculativeLockRef.current === key) return;
    speculativeLockRef.current = key;
    pushDebug(`partial 投机: "${partial.slice(0, 24)}"`);
    navigateTo(patch);
  }

  function handleUser(text: string, g?: Gender) {
    if (loading) return;
    if (welcomePhase === "intro_speaking" || welcomePhase === "intro_video") return;
    if (!text.trim()) {
      aiSay(script("global.fallback"));
      return;
    }
    const eff = g ?? gender;
    if (g) setGender(g);

    if (navRef.current.uiPhase === "quiz" && quizRoundRef.current) {
      pushDebug(`ASR quiz: "${text}"`);
      setMessages((m) => [...m, { role: "user", content: text }]);
      setLastUser(text);
      handleQuizUser(text);
      return;
    }

    const intent = classify(text, nav);
    pushDebug(`ASR: "${text}" → ${intent.kind}`);
    setMessages((m) => [...m, { role: "user", content: text }]);
    setLastUser(text);

    if (intent.kind === "training") {
      aiSay(script("training.pointer"));
      return;
    }

    if (intent.kind === "nav") {
      if (navRef.current.uiPhase === "quiz") {
        setQuizRound(null);
        exitSplitPlayback(() => {});
      }
      const key = navPatchKey(intent.next);
      if (speculativeLockRef.current === key) {
        pushDebug("final 确认投机导航");
        speculativeLockRef.current = null;
        return;
      }
      if (speculativeLockRef.current) {
        pushDebug("final 纠正投机导航");
        speculativeLockRef.current = null;
      }
      navigateTo(intent.next);
      return;
    }

    if (navRef.current.scene === "pharmacy") {
      aiSay(script("pharmacy.quiz.noQa"));
      return;
    }

    if (intent.kind === "chat" || (intent.kind === "unknown" && isQuestionText(text))) {
      void askDify(text);
      return;
    }

    aiSay(script("global.fallback"));
  }

  function startListening() {
    if (preparing || loading || speaking || welcomePhase === "intro_video") return;
    if (voiceRef.current?.isListening()) {
      voiceRef.current.stop();
      setListening(false);
      return;
    }
    setListening(true);
    speculativeLockRef.current = null;
    voiceRef.current?.listen(
      (r) => {
        setListening(false);
        setGender(r.gender);
        handleUser(r.text, r.gender);
        void voiceRef.current?.ensureStreamReady?.((d) => pushDebug(d));
      },
      (msg) => {
        setListening(false);
        speculativeLockRef.current = null;
        if (msg) {
          pushDebug("⚠️ " + msg);
          if (/未检测|未采集|ASR/.test(msg)) aiSay(script("global.fallback"));
        }
      },
      (dbg) => pushDebug(dbg),
      (partial) => trySpeculativeNav(partial),
      () => !!speculativeLockRef.current
    );
  }

  const showStandbyDock =
    mode === "video" &&
    welcomePhase !== "intro_video" &&
    !contentPlayback &&
    !placeholderActive;

  const chips = navigationChips(nav, welcomePhase);
  const trail = locationTrail(nav, welcomePhase);
  const showNavGuide = chips.length > 0 && isChoicePoint(nav, welcomePhase);
  const visibleChips = chips.filter((c) => revealedChipKeys.includes(chipRevealKey(c)));
  const showChoicePanel = showNavGuide && navPillsVisible;
  const showInlinePills = showChoicePanel && visibleChips.length > 0;
  const subtitleSegments = subtitleDisplaySegments({
    fullText: lastAiFull,
    currentSentence: lastAi,
    atChoice: showNavGuide,
    speaking,
  });
  const subtitleLine = subtitleSegments[0] ?? "";
  const showLeftSubtitle =
    !reminderCallout &&
    !showInlinePills &&
    splitPhase !== "split" &&
    (Boolean(subtitleLine) ||
      Boolean(lastAi) ||
      Boolean(lastAiFull) ||
      speaking ||
      loading ||
      preparing ||
      Boolean(lastUser) ||
      nav.uiPhase === "postContent" ||
      nav.uiPhase === "quiz");
  const choiceContextKey = `${nav.scene}|${welcomePhase}|${chips.map((c) => c.label).join(",")}`;
  const navGuideKey = choiceContextKey;
  const showChoiceTimeout =
    choiceSecondsLeft !== null &&
    choiceSecondsLeft <= TIMEOUT_WARN_SEC &&
    showChoicePanel &&
    !speaking &&
    !listening;
  const showIdleTimeout =
    idleSecondsLeft !== null &&
    idleSecondsLeft <= TIMEOUT_WARN_SEC &&
    showInteractive &&
    !speaking &&
    !listening;
  const timeoutContent =
    showChoiceTimeout && choiceSecondsLeft !== null ? (
      <>
        <span className="timeout-sec">{choiceSecondsLeft}</span> 秒后将自动进入默认选项，请说话或点击选项
      </>
    ) : showIdleTimeout && idleSecondsLeft !== null ? (
      <>
        <span className="timeout-sec">{idleSecondsLeft}</span> 秒无操作将返回上一级
      </>
    ) : null;

  useEffect(() => {
    if (!showInteractive || !showNavGuide) {
      dismissNavPills();
    }
  }, [showInteractive, showNavGuide, choiceContextKey, dismissNavPills]);

  const statusText = preparing
    ? "正在准备麦克风…"
    : loading
    ? "正在思考…"
    : speaking
    ? "正在讲解…"
    : listening
    ? "聆听中…"
    : placeholderActive
    ? "占位视频…"
    : welcomePhase === "intro_video"
    ? "展厅总体介绍…"
    : contentPlayback && !speaking && !listening
    ? "正在播放…"
    : nav.uiPhase === "quiz"
    ? "找茬练习…"
    : nav.uiPhase === "postContent"
    ? "请选择下一步…"
    : "";

  const showStatus = Boolean(statusText);

  const showVideoLayer = mode === "video";

  const introVideoLabel = resolveVideo("welcome").label;
  const quizPair = nav.uiPhase === "quiz" ? currentPair(quizRound) : null;

  const subtitleStackClass =
    "subtitle-stack" +
    (splitPhase === "split-out" ? " panel-cross-out" : "") +
    (splitPhase === "split-in" ? " panel-cross-in" : "") +
    (splitPhase === "split" ? " is-layer-hidden" : "");

  const videoStackClass =
    "video-stack" +
    (splitPhase === "split-out" || splitPhase === "split"
      ? " panel-cross-in is-layer-visible"
      : "") +
    (splitPhase === "split-in" ? " panel-cross-out" : "");

  const bgVideoClassName =
    "bg-video" +
    (!showVideoLayer && mode === "interactive" && !modeOut ? " is-hidden" : "") +
    (modeOut === "interactive" ? " bg-fade-in" : "") +
    (modeOut === "video" ? " bg-fade-out" : "");

  const renderSplitVideo = () => (
    <video
      key={"split-" + bgResolved.src + bgKey}
      ref={splitVideoRef}
      className="content-video"
      src={placeholderActive ? undefined : bgResolved.src}
      autoPlay
      muted={welcomePhase !== "intro_video"}
      loop={false}
      playsInline
      onEnded={handleVideoEnded}
      onError={() => {
        if (welcomePhaseRef.current === "intro_video") {
          pushDebug("intro 视频加载失败，跳过至选项");
          finishIntroVideo();
        }
      }}
      onCanPlay={(e) => {
        const v = e.currentTarget;
        if (splitPhase !== "split") return;
        if (welcomePhaseRef.current === "intro_video") {
          v.loop = false;
          v.muted = false;
          v.play().catch(() => {});
          return;
        }
        if (contentPlayback && bgResolved.ready && !placeholderActive) {
          v.loop = false;
          v.muted = true;
          v.play().catch(() => {});
        }
      }}
    />
  );

  const renderBgVideo = () => (
    <video
      key={bgResolved.src + bgKey}
      ref={bgVideoRef}
      className={bgVideoClassName}
      src={placeholderActive ? undefined : bgResolved.src}
      autoPlay
      muted={bgVideoMuted}
      loop={videoLoop && !contentPlayback}
      playsInline
      onEnded={handleVideoEnded}
      onError={() => {
        if (welcomePhaseRef.current === "intro_video") {
          pushDebug("intro 视频加载失败，跳过至选项");
          finishIntroVideo();
        }
      }}
      onCanPlay={(e) => {
        const v = e.currentTarget;
        if (mode !== "video") return;
        if (welcomePhase === "standby") v.loop = true;
        v.muted = false;
        v.play().catch(() => {});
      }}
    />
  );

  return (
    <div className={"screen" + (showSplitChrome ? " content-split" : "") + (quizPair ? " quiz-active" : "")}>
      <div
        className="bg-layer"
        style={{ ["--scene-fade" as string]: `${SCENE_FADE_MS}ms` } as CSSProperties}
        onClick={() => {
          if (mode === "video" && bgVideoRef.current) {
            bgVideoRef.current.muted = false;
            bgVideoRef.current.play().catch(() => {});
          }
        }}
      >
        {mode === "video" && renderBgVideo()}
        {placeholderActive && mode === "video" && (
          <div className="video-placeholder">
            <p className="video-placeholder-title">视频待补充</p>
            <p className="video-placeholder-sub">{placeholderLabel}</p>
            <p className="video-placeholder-hint">成片到位后自动替换</p>
          </div>
        )}
        {showInteractiveChrome && (
          <div className={"bg-photos-layer" + (modeOut === "interactive" ? " bg-fade-out" : "")}>
            <img key={curScene} className="bg-photo bg-cross-in" src={SCENE_META[curScene].photo} alt="" />
            {prevScene && (
              <img key={prevScene} className="bg-photo bg-cross-out" src={SCENE_META[prevScene].photo} alt="" />
            )}
          </div>
        )}
      </div>

      {showStandbyDock ? (
        <div className="standby-dock">
          <button
            type="button"
            className="enter-btn enter-btn--standby"
            onClick={enterInteractive}
            aria-label="开始互动导览"
          >
            <InteractIcon className="enter-btn-icon" />
            <span className="enter-btn-label">开始互动导览</span>
          </button>
        </div>
      ) : showInteractiveChrome ? (
        <>
          <div className="bg-overlay" />
          <header className="topbar">
            <span className="dot" />
            <div className="title">{COMPANY_NAME}</div>
            <div className="location-trail" aria-label="当前位置">
              {trail.map((seg, i) => (
                <span key={i} className={i === trail.length - 1 ? "current" : undefined}>
                  {i > 0 && <span className="sep"> · </span>}
                  {seg}
                </span>
              ))}
            </div>
          </header>

          <div className="interactive-body">
            <aside className="left-panel" aria-live="polite">
              <div className="left-panel-stack">
                <div className={subtitleStackClass}>
                  {reminderCallout ? (
                    <div className="reminder-callout" aria-live="assertive">
                      <span className="reminder-badge">提醒</span>
                      <p className="reminder-text">{reminderCallout.content}</p>
                    </div>
                  ) : null}
                  {showLeftSubtitle ? (
                    <div
                      className={
                        "subtitle-panel scene-" +
                        nav.scene +
                        (aiFresh ? " fresh" : "") +
                        (speaking ? " speaking" : "")
                      }
                    >
                      {subtitleLine ? <p className="sub-main">{subtitleLine}</p> : null}
                      {!subtitleLine && (preparing || loading) ? (
                        <div className="sub-main sub-placeholder">{statusText}</div>
                      ) : null}
                      {!speaking && !loading && !preparing ? (
                        <div className="sub-hint">{hintFor(nav, welcomePhase)}</div>
                      ) : null}
                      {timeoutContent && !showInlinePills ? (
                        <div className="timeout-banner" role="status" aria-live="assertive">
                          {timeoutContent}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {lastUser && splitPhase === "speech" ? (
                    <div className="visitor-echo" aria-live="polite">
                      <span className="visitor-echo-badge">访客</span>
                      <p className="visitor-echo-text">
                        <span className="visitor-echo-prefix">您刚才说：</span>
                        {lastUser}
                      </p>
                    </div>
                  ) : null}
                  {showInlinePills ? (
                    <div className="choice-stack" key={navGuideKey}>
                      <div className="nav-pills nav-pills--choice">
                        {visibleChips.map((c, i) => (
                          <button
                            key={c.kw + c.label}
                            type="button"
                            className="nav-pill nav-slide-in"
                            style={{ animationDelay: `${i * 0.07}s` }}
                            onClick={() => {
                              dismissNavPills();
                              if (c.patch) navigateTo(c.patch);
                              else handleUser(c.kw);
                            }}
                            aria-label={`选择${c.label}`}
                          >
                            <span className="nav-pill-icon">
                              <NavChipIcon label={c.label} className="nav-chip-svg" />
                            </span>
                            <span className="nav-pill-label">{c.label}</span>
                          </button>
                        ))}
                      </div>
                      <div className="choice-caption" aria-live="polite">
                        <div className="choice-panel-head">
                          <p className="choice-panel-title">{choicePanelHeadline(nav, welcomePhase)}</p>
                          <p className="choice-panel-hint">{choicePanelHint()}</p>
                        </div>
                        {showChoiceTimeout && timeoutContent ? (
                          <div className="timeout-banner timeout-banner--choice" role="status" aria-live="assertive">
                            {timeoutContent}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className={videoStackClass}>
                  {showSplitChrome ? (
                    quizPair ? (
                      <div className="quiz-stage">
                        <div className={"content-video-frame scene-" + nav.scene + " quiz-frame"}>
                          <div className="quiz-image-shell">
                            <img
                              className="content-quiz-image"
                              src={quizPair.imageUrl}
                              alt="模拟药店违规场景"
                            />
                          </div>
                        </div>
                        <p className="content-video-label quiz-caption">
                          {`找茬练习 · ${areaLabel(quizPair.area)} · 第 ${(quizRound?.index ?? 0) + 1}/${quizRound?.pairs.length ?? 0} 题`}
                        </p>
                      </div>
                    ) : (
                    <div className={"content-video-frame scene-" + nav.scene}>
                      {renderSplitVideo()}
                      {placeholderActive ? (
                        <div className="video-placeholder video-placeholder--inline">
                          <p className="video-placeholder-title">视频待补充</p>
                          <p className="video-placeholder-sub">{placeholderLabel}</p>
                          <p className="video-placeholder-hint">成片到位后自动替换</p>
                        </div>
                      ) : null}
                      <p className="content-video-label">
                        {welcomePhase === "intro_video"
                          ? introVideoLabel
                          : bgResolved.label}
                      </p>
                      {welcomePhase === "intro_video" ? (
                        <button
                          type="button"
                          className="intro-split-skip"
                          onClick={finishIntroVideo}
                          aria-label="跳过介绍视频，进入区域选择"
                        >
                          跳过介绍
                        </button>
                      ) : null}
                    </div>
                    )
                  ) : null}
                </div>
              </div>
            </aside>

            <main className="right-stage">
              <div className="avatar-column">
                {showStatus ? (
                  <div
                    className={"status " + (speaking ? "speaking" : listening ? "listening" : "")}
                  >
                    {statusText}
                  </div>
                ) : null}
                <div
                  className="avatar-stack"
                  style={{ ["--scene-fade" as string]: `${SCENE_FADE_MS}ms` } as CSSProperties}
                >
                  <Avatar
                    speaking={speaking}
                    listening={listening}
                    thinking={preparing || loading}
                    scene={curScene}
                    cross="in"
                  />
                  {prevScene && (
                    <Avatar
                      speaking={speaking}
                      listening={listening}
                      thinking={preparing || loading}
                      scene={prevScene}
                      cross="out"
                    />
                  )}
                </div>
              </div>
            </main>
          </div>

          <div className="action-dock">
            <div className="mic-dock">
              <button
                type="button"
                className={"mic-fab" + (listening ? " listening" : "")}
                onClick={startListening}
                aria-label={listening ? "正在聆听，点击结束" : "点击说话"}
              >
                <VoiceWaveIcon active={listening || speaking} />
              </button>
              <span className="mic-fab-label">{listening ? "聆听中" : "点我说话"}</span>
            </div>
            <button
              type="button"
              className="exit-btn"
              onClick={exitToVideo}
              aria-label="退出导览，回到迎宾循环视频"
            >
              <ExitIcon />
            </button>
          </div>
        </>
      ) : null}

      {debugEnabled && debug.length > 0 && (
        <div className="debug-panel" aria-hidden="true">
          {debug.map((d, i) => (
            <div key={i}>{d}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function VoiceWaveIcon({ active }: { active?: boolean }) {
  return (
    <span className={"voice-wave" + (active ? " active" : "")} aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
      <span />
    </span>
  );
}

function ExitIcon() {
  return (
    <svg className="dock-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 12h10"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Avatar({
  speaking,
  listening,
  thinking = false,
  scene,
  cross,
}: {
  speaking: boolean;
  listening: boolean;
  thinking?: boolean;
  scene: Scene;
  cross?: "in" | "out";
}) {
  const cls = speaking ? "speaking" : listening || thinking ? "listening" : "";
  const crossCls = cross === "in" ? " avatar-cross-in" : cross === "out" ? " avatar-cross-out" : "";
  return (
    <div className={"avatar-wrap " + cls + crossCls}>
      <div className="avatar-glow" />
      <AvatarAnimated
        speaking={speaking}
        listening={listening}
        thinking={thinking}
      />
    </div>
  );
}
