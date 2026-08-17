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
  type FinishedChapter,
  type NavState,
  type Scene,
  type WelcomePhase,
} from "@/lib/tour-nav";
import { createVoiceProvider, type Gender, type VoiceProvider } from "@/lib/voice";
import { askDifyBlocking } from "@/lib/dify-client";

interface Msg {
  role: "user" | "ai";
  content: string;
}

const ENABLE_TTS = true;
const IDLE_TIMEOUT_MS = Number(process.env.NEXT_PUBLIC_IDLE_TIMEOUT_MS) || 35000;
const CHOICE_TIMEOUT_MS = Number(process.env.NEXT_PUBLIC_CHOICE_TIMEOUT_MS) || 15000;
const SCENE_FADE_MS = 420;

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

export default function Page() {
  const router = useRouter();

  const [nav, setNav] = useState<NavState>(initialNav);
  const [welcomePhase, setWelcomePhase] = useState<WelcomePhase>("standby");
  const [contentPlayback, setContentPlayback] = useState<VideoKey | null>(null);
  const [placeholderActive, setPlaceholderActive] = useState(false);
  const [placeholderLabel, setPlaceholderLabel] = useState("");

  const meta = SCENE_META[nav.scene];
  const bgKey = contentPlayback ?? backgroundVideoKey(nav, welcomePhase);
  const bgResolved = resolveVideo(bgKey);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [lastAi, setLastAi] = useState("");
  const [lastUser, setLastUser] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [aiFresh, setAiFresh] = useState(false);
  const [mode, setMode] = useState<"video" | "interactive">("video");
  const [modeOut, setModeOut] = useState<"video" | "interactive" | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [gender, setGender] = useState<Gender>("neutral");
  const [curScene, setCurScene] = useState<Scene>("welcome");
  const [prevScene, setPrevScene] = useState<Scene | null>(null);
  const [debug, setDebug] = useState<string[]>([]);

  const welcomeFlowLock = useRef(false);
  const modeRef = useRef(mode);
  const bgVideoRef = useRef<HTMLVideoElement | null>(null);
  const voiceRef = useRef<VoiceProvider | null>(null);
  const healthCheckedRef = useRef(false);
  const placeholderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playingChapterRef = useRef<FinishedChapter>(null);
  const convIdRef = useRef("");

  if (!voiceRef.current) voiceRef.current = createVoiceProvider();

  const navRef = useRef(nav);
  useEffect(() => {
    navRef.current = nav;
  }, [nav]);

  const showInteractive =
    mode === "interactive" &&
    welcomePhase !== "intro_video" &&
    !contentPlayback &&
    !placeholderActive;

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

  const speak = useCallback(
    (text: string, onEnd?: () => void, onSentence?: (sentence: string, index: number) => void) => {
      if (!ENABLE_TTS || !text) {
        onEnd?.();
        return;
      }
      voiceRef.current?.speak(
        text,
        () => setSpeaking(true),
        () => {
          setSpeaking(false);
          onEnd?.();
        },
        onSentence
      );
    },
    []
  );

  const aiSay = useCallback(
    (text: string, onEnd?: () => void, reset = false) => {
      const reveal = (sentence: string) => {
        setLastAi(sentence);
        setAiFresh(true);
        setTimeout(() => setAiFresh(false), 800);
      };

      setMessages((m) =>
        reset ? [{ role: "ai", content: text }] : [...m, { role: "ai", content: text }]
      );

      if (!ENABLE_TTS || !text.trim()) {
        reveal(text);
        onEnd?.();
        return;
      }

      setLastAi("");
      speak(text, onEnd, reveal);
    },
    [speak]
  );

  const clearPlaceholderTimer = () => {
    if (placeholderTimerRef.current) {
      clearTimeout(placeholderTimerRef.current);
      placeholderTimerRef.current = null;
    }
  };

  const finishContentPlayback = useCallback(() => {
    const finished = playingChapterRef.current;
    playingChapterRef.current = null;
    clearPlaceholderTimer();
    setPlaceholderActive(false);
    setContentPlayback(null);
    if (finished) enterPostContentRef.current?.(finished);
  }, []);

  const enterPostContent = useCallback(
    (finished: FinishedChapter) => {
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
    [aiSay]
  );

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

  const enterPostContentRef = useRef(enterPostContent);
  enterPostContentRef.current = enterPostContent;

  function stopVoiceAndPlayback() {
    voiceRef.current?.cancel();
    setSpeaking(false);
    clearPlaceholderTimer();
    setContentPlayback(null);
    setPlaceholderActive(false);
    playingChapterRef.current = null;
  }

  const applyNavSilent = useCallback((patch: Partial<NavState>) => {
    stopVoiceAndPlayback();
    const next = mergeNav(navRef.current, patch);
    navRef.current = next;
    setNav(next);
  }, []);

  const startContentPlayback = useCallback(
    (key: VideoKey) => {
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
        const v = bgVideoRef.current;
        if (!v) return;
        v.loop = false;
        v.currentTime = 0;
        v.muted = true;
        v.play().catch(() => {});
      });
    },
    [finishContentPlayback, mode]
  );

  const startIntroReplay = useCallback(() => {
    setWelcomePhase("intro_video");
    setMode("video");
    setLastAi("");
    requestAnimationFrame(() => {
      const v = bgVideoRef.current;
      if (!v) return;
      v.loop = false;
      v.currentTime = 0;
      v.muted = false;
      v.play().catch(() => {});
    });
  }, []);

  const startWelcomeChoice = useCallback(() => {
    setWelcomePhase("choice_ready");
    setMode("interactive");
    const say = script("welcome.choice");
    aiSay(say, undefined, true);
  }, [aiSay]);

  const navigateTo = useCallback(
    (patch: Partial<NavState>, resetConversation = false, silent = false) => {
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
        if (next.scene !== "welcome") setWelcomePhase("done");
        return;
      }

      const say = speakTextForNav(next, prev);
      const cv = contentVideoKey(next);
      const pharmacyChoice = shouldPlayPharmacyChoice(prev, next)
        ? script("pharmacy.choice")
        : null;

      const afterSpeech = () => {
        if (cv) {
          if (
            next.chapter === "science" ||
            next.chapter === "law" ||
            next.chapter === "case1" ||
            next.chapter === "case2"
          ) {
            playingChapterRef.current = next.chapter;
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
        startContentPlayback(cv);
      } else if (next.pharmLeaf) {
        enterPostContentPharmacy(next.pharmLeaf);
      }

      if (next.scene !== "welcome") setWelcomePhase("done");
    },
    [curScene, router, aiSay, startContentPlayback, enterPostContentPharmacy]
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
    setWelcomePhase("standby");
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
    if (welcomePhase === "intro_video" || (mode === "video" && !contentPlayback)) {
      if (welcomePhase !== "intro_video") {
        v.muted = false;
        v.play().catch(() => {});
      }
    } else if (bgVideoMuted) {
      v.muted = true;
      v.pause();
    }
  }, [mode, welcomePhase, contentPlayback, placeholderActive, bgVideoMuted, bgKey]);

  useEffect(() => {
    if (!showInteractive || speaking || listening || preparing || loading) return;
    if (contentPlayback || placeholderActive) return;
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
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInteractive, speaking, listening, preparing, loading, contentPlayback, placeholderActive, nav, welcomePhase]);

  useEffect(() => {
    if (speaking || listening || preparing || loading) return;
    if (contentPlayback || placeholderActive) return;
    if (!isChoicePoint(nav, welcomePhase)) return;
    const timer = setTimeout(applyDefaultChoice, CHOICE_TIMEOUT_MS);
    return () => clearTimeout(timer);
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
    welcomeFlowLock.current = false;
    stopVoiceAndPlayback();
    setWelcomePhase("standby");
    setMode("video");
    setPreparing(false);
    setNav(initialNav());
    setCurScene("welcome");
    setLastAi("");
    setLastUser("");
    setMessages([]);
    convIdRef.current = "";
    const v = bgVideoRef.current;
    if (v) {
      v.loop = true;
      v.muted = false;
      v.play().catch(() => {});
    }
  }

  function enterInteractive() {
    if (welcomeFlowLock.current || welcomePhase !== "standby") return;
    welcomeFlowLock.current = true;
    setWelcomePhase("intro_speaking");
    setMode("interactive");
    setPreparing(true);

    const afterIntro = () => startIntroReplay();

    voiceRef.current?.preheat?.(
      () => {
        setPreparing(false);
        aiSay(script("welcome.intro"), afterIntro, true);
      },
      () => {
        setPreparing(false);
        aiSay(script("welcome.intro"), afterIntro, true);
      },
      (dbg) => pushDebug(dbg)
    );
  }

  function handleVideoEnded() {
    if (welcomePhase === "intro_video") {
      startWelcomeChoice();
      return;
    }
    if (contentPlayback && bgResolved.ready) {
      finishContentPlayback();
    }
  }

  async function askDify(question: string) {
    setLoading(true);
    pushDebug("Dify 问答中…");
    try {
      const nav = navRef.current;
      const { answer, conversationId } = await askDifyBlocking(
        question,
        {
          scene: nav.scene,
          aspect: nav.aspect,
          chapter: nav.chapter,
        },
        convIdRef.current
      );
      if (conversationId) convIdRef.current = conversationId;
      pushDebug(`Dify 回答 ${answer.length} 字`);
      if (answer) aiSay(answer);
      else aiSay(script("global.fallback"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      pushDebug("⚠️ Dify: " + msg);
      aiSay(script("global.fallback"));
    } finally {
      setLoading(false);
    }
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

    const intent = classify(text, nav);
    pushDebug(`ASR: "${text}" → ${intent.kind}`);
    setMessages((m) => [...m, { role: "user", content: text }]);
    setLastUser(text);

    if (intent.kind === "training") {
      aiSay(script("training.pointer"));
      return;
    }

    if (intent.kind === "nav") {
      navigateTo(intent.next);
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
    voiceRef.current?.listen(
      (r) => {
        setListening(false);
        setGender(r.gender);
        handleUser(r.text, r.gender);
      },
      (msg) => {
        setListening(false);
        if (msg) {
          pushDebug("⚠️ " + msg);
          if (/未检测|未采集|ASR/.test(msg)) aiSay(script("global.fallback"));
        }
      },
      (dbg) => pushDebug(dbg)
    );
  }

  function switchScene(key: Scene) {
    setWelcomePhase(key === "welcome" ? "standby" : "done");
    navigateTo(
      {
        scene: key,
        aspect: null,
        chapter: null,
        pharmMode: null,
        pharmArea: null,
        pharmLeaf: null,
        uiPhase: "choosing",
        lastFinishedChapter: null,
        lastFinishedLeaf: null,
      },
      true,
      key === "welcome"
    );
  }

  const chips = navigationChips(nav, welcomePhase);
  const trail = locationTrail(nav, welcomePhase);

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
    : nav.uiPhase === "postContent"
    ? "请选择下一步…"
    : "数字人待命";

  const showVideoLayer =
    mode === "video" ||
    welcomePhase === "intro_video" ||
    !!contentPlayback ||
    placeholderActive;

  return (
    <div className="screen">
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
        <video
          key={bgResolved.src + bgKey}
          ref={bgVideoRef}
          className={
            "bg-video" +
            (!showVideoLayer && mode === "interactive" && !modeOut ? " is-hidden" : "") +
            (modeOut === "interactive" ? " bg-fade-in" : "") +
            (modeOut === "video" ? " bg-fade-out" : "")
          }
          src={placeholderActive ? undefined : bgResolved.src}
          autoPlay
          muted={bgVideoMuted}
          loop={videoLoop && !contentPlayback}
          playsInline
          onEnded={handleVideoEnded}
          onCanPlay={(e) => {
            const v = e.currentTarget;
            if (welcomePhase === "intro_video") {
              v.muted = false;
              v.loop = false;
            } else if (mode === "video" && welcomePhase === "standby") {
              v.muted = false;
              v.loop = true;
            } else if (contentPlayback && bgResolved.ready) {
              v.muted = true;
            } else if (bgVideoMuted) {
              v.muted = true;
              v.pause();
            }
          }}
        />
        {placeholderActive && (
          <div className="video-placeholder">
            <p className="video-placeholder-title">视频待补充</p>
            <p className="video-placeholder-sub">{placeholderLabel}</p>
            <p className="video-placeholder-hint">成片到位后自动替换</p>
          </div>
        )}
        {showInteractive && (
          <div className={"bg-photos-layer" + (modeOut === "interactive" ? " bg-fade-out" : "")}>
            <img key={curScene} className="bg-photo bg-cross-in" src={SCENE_META[curScene].photo} alt="" />
            {prevScene && (
              <img key={prevScene} className="bg-photo bg-cross-out" src={SCENE_META[prevScene].photo} alt="" />
            )}
          </div>
        )}
      </div>

      {mode === "video" && welcomePhase === "standby" ? (
        <>
          <div className="audio-hint">点击画面任意处可开启视频原声</div>
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
      ) : showInteractive ? (
        <>
          <div className="bg-overlay" />
          <header className="topbar">
            <span className="dot" />
            <div>
              <div className="title">{meta.title}</div>
              <div className="location-trail" aria-label="当前位置">
                {trail.map((seg, i) => (
                  <span key={i} className={i === trail.length - 1 ? "current" : undefined}>
                    {i > 0 && <span className="sep"> · </span>}
                    {seg}
                  </span>
                ))}
              </div>
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

          <main className="center-stage">
            <div
              className="avatar-stack"
              style={{ ["--scene-fade" as string]: `${SCENE_FADE_MS}ms` } as CSSProperties}
            >
              <Avatar speaking={speaking} listening={listening} scene={curScene} cross="in" />
              {prevScene && (
                <Avatar speaking={speaking} listening={listening} scene={prevScene} cross="out" />
              )}
            </div>
            <div className={"status " + (speaking ? "speaking" : listening ? "listening" : "")}>{statusText}</div>
          </main>

          {chips.length > 0 && (
            <div className="zone-chips">
              {chips.map((c) => (
                <button
                  key={c.kw + c.label}
                  className="zone-chip"
                  onClick={() => (c.patch ? navigateTo(c.patch) : handleUser(c.kw))}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}

          <button className={"mic-fab" + (listening ? " listening" : "")} onClick={startListening} title="点击说话">
            <span className="mic-ico">🎤</span>
          </button>

          <div className={"subtitle-bar" + (aiFresh ? " fresh" : "") + (speaking ? " speaking" : "")} aria-live="polite">
            {lastAi ? <div className="sub-main">{lastAi}</div> : null}
            <div className="sub-hint">{hintFor(nav, welcomePhase)}</div>
          </div>

          <button
            className="exit-btn"
            onClick={exitToVideo}
            title="退出导览，回到迎宾循环视频"
          >
            ⤺ 结束互动
          </button>
        </>
      ) : welcomePhase === "intro_video" ? (
        <div className="welcome-flow-hint">正在播放展厅总体介绍…</div>
      ) : null}

      {debug.length > 0 && (
        <div className="debug-panel">
          {debug.map((d, i) => (
            <div key={i}>{d}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function Avatar({
  speaking,
  listening,
  scene,
  cross,
}: {
  speaking: boolean;
  listening: boolean;
  scene: Scene;
  cross?: "in" | "out";
}) {
  const cls = speaking ? "speaking" : listening ? "listening" : "";
  const crossCls = cross === "in" ? " avatar-cross-in" : cross === "out" ? " avatar-cross-out" : "";
  return (
    <div className={"avatar-wrap " + cls + crossCls}>
      <div className="avatar-glow" />
      <img className="avatar-img" src={SCENE_META[scene].avatar} alt="普法迎宾数字人" />
    </div>
  );
}
