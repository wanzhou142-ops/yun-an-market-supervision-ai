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
  initialNav,
  isChoicePoint,
  mergeNav,
  script,
  speakTextForNav,
  type NavState,
  type Scene,
  type WelcomePhase,
  zoneChips,
} from "@/lib/tour-nav";
import { createVoiceProvider, type Gender, type VoiceProvider } from "@/lib/voice";

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

  const videoLoop =
    welcomePhase === "standby" ||
    (mode === "video" && welcomePhase !== "intro_video" && !contentPlayback);

  function pushDebug(s: string) {
    const t = new Date().toLocaleTimeString("zh-CN", { hour12: false });
    setDebug((d) => [...d.slice(-7), `[${t}] ${s}`]);
  }

  const speak = useCallback((text: string, onEnd?: () => void) => {
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
      }
    );
  }, []);

  const aiSay = useCallback(
    (text: string, onEnd?: () => void, reset = false) => {
      setLastAi(text);
      setAiFresh(true);
      setTimeout(() => setAiFresh(false), 800);
      setMessages((m) =>
        reset ? [{ role: "ai", content: text }] : [...m, { role: "ai", content: text }]
      );
      speak(text, onEnd);
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
    clearPlaceholderTimer();
    setPlaceholderActive(false);
    setContentPlayback(null);
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
        v.muted = mode === "interactive";
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
    (patch: Partial<NavState>, resetConversation = false) => {
      const next = mergeNav(navRef.current, patch);
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

      const say = speakTextForNav(next);
      const cv = contentVideoKey(next);

      const afterSpeech = () => {
        if (cv) startContentPlayback(cv);
      };

      if (say) aiSay(say, afterSpeech);
      else if (cv) startContentPlayback(cv);

      if (next.scene !== "welcome") setWelcomePhase("done");
    },
    [curScene, router, aiSay, startContentPlayback]
  );

  const applyDefaultChoice = useCallback(() => {
    if (welcomePhase === "choice_ready") {
      pushDebug("选择超时，默认进入宣传廊");
      navigateTo(defaultNext(initialNav()));
      return;
    }
    const patch = defaultNext(navRef.current);
    if (Object.keys(patch).length) {
      pushDebug("选择超时，默认第一项");
      navigateTo(patch);
    }
  }, [welcomePhase, navigateTo]);

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
    } else if (showInteractive && !contentPlayback && !placeholderActive) {
      v.muted = true;
      v.pause();
    }
  }, [mode, welcomePhase, contentPlayback, placeholderActive, showInteractive]);

  useEffect(() => {
    if (!showInteractive || speaking || listening || preparing) return;
    if (contentPlayback || placeholderActive) return;
    const timer = setTimeout(() => {
      pushDebug("空闲超时，返回视频待机");
      exitToVideo();
    }, IDLE_TIMEOUT_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInteractive, speaking, listening, preparing, contentPlayback, placeholderActive]);

  useEffect(() => {
    if (speaking || listening || preparing) return;
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
    clearPlaceholderTimer();
    setWelcomePhase("standby");
    setContentPlayback(null);
    setPlaceholderActive(false);
    setMode("video");
    setPreparing(false);
    setNav(initialNav());
    setCurScene("welcome");
    setLastAi("");
    setLastUser("");
    setMessages([]);
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

  function handleUser(text: string, g?: Gender) {
    if (!text.trim() || loading) return;
    if (welcomePhase === "intro_speaking" || welcomePhase === "intro_video") return;
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

    aiSay(script("global.fallback"));
  }

  function startListening() {
    if (preparing || speaking || welcomePhase === "intro_video") return;
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
        if (msg) pushDebug("⚠️ " + msg);
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
      },
      true
    );
  }

  const statusText = preparing
    ? "正在准备麦克风…"
    : speaking
    ? "正在讲解…"
    : listening
    ? "聆听中…"
    : placeholderActive
    ? "占位视频…"
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

          {zoneChips(nav).length > 0 && (
            <div className="zone-chips">
              {zoneChips(nav).map((c) => (
                <button key={c.kw} className="zone-chip" onClick={() => handleUser(c.kw)}>
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

          <button className="exit-btn" onClick={exitToVideo} title="返回视频">
            ⤺ 返回视频
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
