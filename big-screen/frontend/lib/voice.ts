// 语音能力抽象层（客户端）
// ---------------------------------------------------------------------------
// 生产默认 server：麦克风录成 16k 单声道 WAV → POST /api/voice(ASR) → 意图判定
//   → POST /api/voice/tts(TTS) → 播放音频。
// 底层由本机语音服务（voice-service）提供【离线】语音引擎：
//   TTS = Piper(本地模型) / SAPI5(系统嗓音) / edge-tts(在线调试)；
//   ASR = Vosk(本地模型) / mock。
// 客户机【不连外网】，故交付用 Piper+Vosk，模型一次性下载后永不联网。
// browser 模式仅用于开发期快速看 TTS 效果，ASR 走 Google 在国内不可用。
// ---------------------------------------------------------------------------

export type Gender = "male" | "female" | "neutral";

export interface AsrResult {
  text: string;
  gender: Gender; // 浏览器原生无法判定 → neutral；生产外部 ASR 返回 male/female
  bytes?: number; // 发给 ASR 的音频字节数（调试用）
  rms_dbfs?: number; // 音频 RMS 音量（dBFS），静音约 -90，正常语音约 -30~-10
}

export interface VoiceProvider {
  listen(
    onResult: (r: AsrResult) => void,
    onError?: (msg: string) => void,
    onDebug?: (msg: string) => void
  ): void;
  stop(): void;
  isListening(): boolean;
  speak(
    text: string,
    onStart?: () => void,
    onEnd?: () => void,
    onSentence?: (sentence: string, index: number) => void
  ): void;
  cancel(): void;
  // 方案A（进交互前预热麦克风）：获取权限 + 建 AudioContext + 估算底噪，
  // 期间前端显示「正在准备…」，避免用户首句落在冷启动期被 VAD 漏检。
  // 可选实现：browser 模式无需预热（无独立 VAD 初始化），直接视为就绪。
  preheat?(
    onReady?: (info: { noiseFloor: number }) => void,
    onError?: (msg: string) => void,
    onDebug?: (msg: string) => void
  ): void;
}

// 性别 → 称呼
export function genderWord(g: Gender): string {
  if (g === "female") return "女士";
  if (g === "male") return "先生";
  return "您";
}

// 预生成话术音频映射（由 voice-service/gen_tts_audio.py 生成）：
// 文本 → /audio/tts/line_xxx.mp3。命中则直接播本地文件（发音标准·零延迟·离线）。
// 未命中的动态文本（如未来接 LLM）回退到 Piper 实时合成。
import ttsMapData from "./tts-map.json";
const TTS_MAP: Record<string, string> = ttsMapData as Record<string, string>;

// 清掉括号里的内心OS/动作提示，避免 TTS 念出“（稍作停顿）”
function cleanForTts(text: string): string {
  return text
    .replace(/[（(][^（）()]*[）)]/g, "")
    .replace(/⚠️/g, "")
    .trim();
}

/** 单屏建议最多显示的汉字数（约 1~2 行）；超出则继续切分 */
const MAX_DISPLAY_CHARS = 30;

const WEAK_BREAKS = ["，", "、", "；", "：", "—", " "] as const;

/** 在 limit 以内找最后一个弱分隔符，避免把定语/专名拦腰截断 */
function findWeakBreak(text: string, limit: number): number {
  const window = text.slice(0, limit + 1);
  for (const d of WEAK_BREAKS) {
    const idx = window.lastIndexOf(d);
    if (idx > limit * 0.35) return idx + d.length;
  }
  return 0;
}

/** 将超长片段按逗号/顿号等再切，仍过长则硬切 */
function splitToMaxLen(chunk: string): string[] {
  if (chunk.length <= MAX_DISPLAY_CHARS) return [chunk];

  const breakAt = findWeakBreak(chunk, MAX_DISPLAY_CHARS);
  if (breakAt > 0) {
    const head = chunk.slice(0, breakAt).trim();
    const tail = chunk.slice(breakAt).trim();
    return [...(head ? [head] : []), ...splitToMaxLen(tail)];
  }

  const head = chunk.slice(0, MAX_DISPLAY_CHARS).trim();
  const tail = chunk.slice(MAX_DISPLAY_CHARS).trim();
  return [...(head ? [head] : []), ...splitToMaxLen(tail)];
}

/**
 * 展示与 TTS 共用切分：
 * 1. 强分隔：。！？；及换行
 * 2. 弱分隔：无句号的长段按，、；：— 再切
 * 3. 兜底：仍超 MAX_DISPLAY_CHARS 则按字数硬切
 */
export function splitSentences(text: string): string[] {
  const strong = text
    .split(/(?<=[。！？!?；])|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return strong.flatMap((chunk) => splitToMaxLen(chunk));
}

/* ===================== 浏览器原生实现（开发/演示默认） ===================== */
function createBrowserVoice(): VoiceProvider {
  let rec: any = null;
  const synth =
    typeof window !== "undefined" ? window.speechSynthesis : null;

  return {
    listen(onResult, onError, _onDebug) {
      const SR =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;
      if (!SR) {
        onError?.("当前浏览器不支持语音识别，请用 Chrome 或 Edge");
        return;
      }
      if (rec) {
        rec.stop();
        rec = null;
        return;
      }
      const r = new SR();
      r.lang = "zh-CN";
      r.interimResults = false;
      r.onresult = (e: any) => {
        const text = (e.results[0][0].transcript as string) || "";
        rec = null;
        // 浏览器原生 ASR 不返回性别 → neutral；生产外部 ASR 会带 gender
        onResult({ text, gender: "neutral" });
      };
      r.onend = () => {
        rec = null;
      };
      r.onerror = (e: any) => {
        const err = e?.error || "unknown";
        rec = null;
        if (err === "aborted" || err === "no-speech") return;
        onError?.(err);
      };
      rec = r;
      r.start();
    },
    stop() {
      if (rec) {
        rec.stop();
        rec = null;
      }
    },
    isListening() {
      return !!rec;
    },
    speak(text, onStart, onEnd, onSentence) {
      if (!synth) return;
      const t = cleanForTts(text);
      if (!t) return;
      synth.cancel();
      const sentences = splitSentences(t);
      if (sentences.length <= 1) {
        onSentence?.(t, 0);
        const u = new SpeechSynthesisUtterance(t);
        u.lang = "zh-CN";
        u.onstart = () => onStart?.();
        u.onend = () => onEnd?.();
        synth.speak(u);
        return;
      }
      let i = 0;
      const next = () => {
        if (i >= sentences.length) {
          onEnd?.();
          return;
        }
        const s = sentences[i];
        onSentence?.(s, i);
        const u = new SpeechSynthesisUtterance(s);
        u.lang = "zh-CN";
        if (i === 0) u.onstart = () => onStart?.();
        u.onend = () => {
          i++;
          next();
        };
        synth.speak(u);
      };
      next();
    },
    cancel() {
      if (synth) synth.cancel();
    },
    // 浏览器原生实现无需预热（无独立 VAD 初始化），直接视为就绪
    preheat() {},
  };
}

/* ===================== 服务端实现（生产默认；我们自建离线语音服务） ===================== */
// 流程：麦克风录 16k 单声道 WAV → POST /api/voice(ASR) → { text, gender }
//       → 前端意图判定 → POST /api/voice/tts(TTS) → 播放音频
// 底层语音服务跑在本机（voice-service，默认 127.0.0.1:8000），离线引擎 Piper+Vosk。
// 录音用 Web Audio 直接采 PCM 并降采样到 16k 单声道再封 WAV，Vosk 可直接吃，
// 免去在服务端引 ffmpeg。
function createServerVoice(): VoiceProvider {
  let stream: MediaStream | null = null;
  let audioCtx: AudioContext | null = null;
  let scriptNode: ScriptProcessorNode | null = null;
  let sourceNode: MediaStreamAudioSourceNode | null = null;
  let recording = false;
  let pcmL: Float32Array[] = [];
  // 句子级 TTS 播放队列：逐句合成、逐句播放，首句即播，不等整段合成完
  const tts: {
    queue: string[];
    playing: boolean;
    currentEl: HTMLAudioElement | null;
    onStart?: () => void;
    onEnd?: () => void;
    onSentence?: (sentence: string, index: number) => void;
    sentenceTimers: ReturnType<typeof setTimeout>[];
    sentenceIndex: number;
    gen: number;
  } = {
    queue: [],
    playing: false,
    currentEl: null,
    sentenceTimers: [],
    sentenceIndex: 0,
    gen: 0,
  };
  const TTS_VOICE = "zh-CN-XiaoxiaoNeural";
  const TARGET_RATE = 16000;

  function schedulePrerecordSentences(
    sentences: string[],
    durationSec: number,
    myGen: number
  ) {
    const onSentence = tts.onSentence;
    if (!onSentence || sentences.length <= 1) return;
    tts.sentenceTimers.forEach(clearTimeout);
    tts.sentenceTimers = [];
    const totalChars = sentences.reduce((n, s) => n + s.length, 0) || 1;
    const dur =
      durationSec > 0 && Number.isFinite(durationSec)
        ? durationSec
        : sentences.length * 2.5;
    let acc = 0;
    sentences.forEach((s, i) => {
      if (i === 0) {
        acc += s.length;
        return;
      }
      const delayMs = (acc / totalChars) * dur * 1000;
      const timer = setTimeout(() => {
        if (myGen === tts.gen) onSentence(s, i);
      }, delayMs);
      tts.sentenceTimers.push(timer);
      acc += s.length;
    });
  }

  // 逐句播放：取队首→请求 TTS→播放→onended 再取下一句。
  // 首句合成完即播，不用等整段；onStart 仅首句触发，onEnd 仅末句触发。
  async function playNextSentence(myGen?: number) {
    const s = tts.queue.shift();
    if (!s) {
      tts.playing = false;
      tts.onEnd?.();
      return;
    }
    const idx = tts.sentenceIndex++;
    try {
      const resp = await fetch("/api/voice/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: s, voice: TTS_VOICE }),
      });
      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        let errMsg = errText;
        try {
          const j = JSON.parse(errText);
          errMsg = j.error || errText;
        } catch {}
        console.error(`TTS 失败 ${resp.status}:`, errMsg);
        if (myGen === tts.gen) playNextSentence(myGen);
        return;
      }
      const ctype = resp.headers.get("Content-Type") || "audio/mpeg";
      const buf = await resp.arrayBuffer();
      // fetch 完成才出声：若期间已有新句取代本代，直接放弃，避免旧句与新句叠加
      if (myGen !== tts.gen) return;
      const url = URL.createObjectURL(new Blob([buf], { type: ctype }));
      const el = new Audio();
      tts.currentEl = el;
      el.src = url;
      el.onplay = () => {
        if (myGen !== tts.gen) return;
        if (!tts.playing) tts.onStart?.();
        tts.playing = true;
        tts.onSentence?.(s, idx);
      };
      el.onended = () => {
        URL.revokeObjectURL(url);
        if (myGen === tts.gen) playNextSentence(myGen);
      };
      el.onerror = () => {
        URL.revokeObjectURL(url);
        if (myGen === tts.gen) playNextSentence(myGen);
      };
      await el.play();
    } catch (e) {
      console.error("TTS 播放失败", e);
      if (myGen === tts.gen) playNextSentence(myGen);
    }
  }

  // 采集麦克风 → 16k 单声道 PCM → 封 WAV Blob
  // onDone 第二参返回本地音高估计出的性别（离线，无需服务端支持）
  function startRecording(
    onDone: (wav: Blob, g: Gender) => void,
    onError?: (m: string) => void,
    onDebug?: (m: string) => void
  ) {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) {
      onError?.("当前环境不支持麦克风，请用 Chrome/Edge 并授权");
      return;
    }

    // 先尝试关闭浏览器音频处理（保留最原始麦克风数据）；
    // 若浏览器不支持这些约束，再 fallback 到最简约束。
    const constraints = {
      audio: {
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    };
    const simpleConstraints = { audio: { channelCount: 1 } };

    const tryStart = (s: MediaStream) => {
      stream = s;
      audioCtx = new (window.AudioContext ||
        (window as any).webkitAudioContext)({ sampleRate: TARGET_RATE });
      const ctxRate = audioCtx.sampleRate;

      sourceNode = audioCtx.createMediaStreamSource(s);
      scriptNode = audioCtx.createScriptProcessor(4096, 1, 1);
      pcmL = [];
      // —— 自适应能量 VAD ——
      // 之前用固定阈值 0.008：因 AEC/降噪被刻意关闭（给 Vosk 小模型保真），
      // 安静房间的本底噪声 RMS 刚好卡在阈值附近 → 停顿检测不到 → 一直录到最大时长才提交。
      // 改为：先测环境底噪，再按"相对底噪"判定，安静/嘈杂两种环境都能自动适配。
      const MIN_SILENCE_MS = 700; // 连续静音超此值→判定"说完"（350ms 易截断句中停顿）
      const START_GRACE_MS = 250; // 启动宽限：测底噪 + 避开开头爆音（缩短以减少首句延迟）
      const WAIT_SPEECH_MS = 5000; // 一直没声音超此值→自动取消
      const MAX_SPEECH_MS = 12000; // 从检测到人声起算的最长录音（避免犹豫占用时长）
      const ABS_MAX_MS = 20000; // 从点按钮起算的绝对上限（防 VAD 卡死）
      // VAD 阈值外置到 .env（设计 §8.4 / §B）：现场按环境调，无需改代码。
      // 默认：ABS_FLOOR=0.008（原 0.012 偏严，轻声用户触发不了）；起止倍率 2.2 / 1.6。
      const ABS_FLOOR = Number(process.env.NEXT_PUBLIC_VAD_FLOOR) || 0.008;
      const VAD_START_K = Number(process.env.NEXT_PUBLIC_VAD_START_K) || 2.2;
      const VAD_END_K = Number(process.env.NEXT_PUBLIC_VAD_END_K) || 1.6;
      const vadStart = Date.now();
      let speechStarted = false;
      let lastSpeechAt = 0;
      let noiseFloor = 0; // 环境底噪 RMS（前 400ms 估算 + 说话间隙持续自适应）
      let vadInitDone = false; // 底噪只初始化一次（修复：grace 全 0 时 === 0 误判会每帧重设）
      let graceMin = Infinity; // 宽限期取最小 RMS 作底噪（避免开口说话污染基准）
      let lastWaitLogAt = 0; // 等待说话期间节流日志（每 1s 1 行，避免刷屏）
      let speechStartAt = 0; // 检测到人声的时刻（MAX_SPEECH_MS 从此起算）

      scriptNode.onaudioprocess = (e) => {
        const ch = e.inputBuffer.getChannelData(0);
        pcmL.push(new Float32Array(ch));
        const now = Date.now();
        let sum = 0;
        for (let i = 0; i < ch.length; i++) sum += ch[i] * ch[i];
        const rms = Math.sqrt(sum / ch.length);
        const elapsed = now - vadStart;
        // 宽限期内只测底噪，不判定说话/静音
        if (elapsed < START_GRACE_MS) {
          graceMin = Math.min(graceMin, rms);
          return;
        }
        // 宽限结束：取最小 RMS 作为初始底噪（只初始化一次）
        if (!vadInitDone) {
          vadInitDone = true;
          noiseFloor = graceMin !== Infinity ? graceMin : rms;
          onDebug?.(`VAD: 底噪基准=${noiseFloor.toFixed(4)}（说话阈值=${(Math.max(noiseFloor * VAD_START_K, ABS_FLOOR)).toFixed(4)}）`);
        }
        const startTh = Math.max(noiseFloor * VAD_START_K, ABS_FLOOR); // 高于此=说话
        const endTh = Math.max(noiseFloor * VAD_END_K, ABS_FLOOR);   // 低于此=静音
        if (!speechStarted) {
          if (rms > startTh) {
            speechStarted = true;
            speechStartAt = now;
            lastSpeechAt = now;
            (startRecording as any)._speechStarted = true;
            onDebug?.(`VAD: 检测到人声 (RMS=${rms.toFixed(4)})`);
          } else if (elapsed > WAIT_SPEECH_MS) {
            onDebug?.(`VAD: 未检测到人声，取消 (RMS=${rms.toFixed(4)})`);
            (startRecording as any)._cancel?.("未检测到说话，请再试一次");
            return;
          } else {
            // 未说话时持续自适应底噪（环境可能渐变）
            noiseFloor = noiseFloor * 0.9 + rms * 0.1;
            // 反馈：每秒打印一次当前 RMS，让用户看见麦在工作 / 声音够不够大
            if (now - lastWaitLogAt >= 1000) {
              lastWaitLogAt = now;
              onDebug?.(`等待说话... RMS=${rms.toFixed(4)} / 阈值=${startTh.toFixed(4)}`);
            }
          }
        } else {
          if (rms < endTh) {
            if (now - lastSpeechAt > MIN_SILENCE_MS) {
              onDebug?.(`VAD: 静音 ${MIN_SILENCE_MS}ms，判定说完`);
              (startRecording as any)._stop?.();
              return;
            }
          } else {
            lastSpeechAt = now;
          }
          if (now - speechStartAt > MAX_SPEECH_MS) {
            onDebug?.("VAD: 达到最大录音时长，自动提交");
            (startRecording as any)._stop?.();
            return;
          }
        }
        if (elapsed > ABS_MAX_MS) {
          onDebug?.("VAD: 达到绝对上限，自动提交");
          (startRecording as any)._stop?.();
        }
      };

      sourceNode.connect(scriptNode);
      // ScriptProcessorNode 的输出必须被消费才会稳定触发 onaudioprocess；
      // 但不能直接连 destination（会回环到扬声器）。
      // 方案：接一条 gain=0 的链路再连 destination，既触发回调，又不播出声音。
      const zeroGain = audioCtx.createGain();
      zeroGain.gain.value = 0;
      scriptNode.connect(zeroGain);
      zeroGain.connect(audioCtx.destination);

      // 确保 AudioContext 处于 running 状态（某些浏览器需要显式 resume）
      if (audioCtx.state === "suspended") {
        audioCtx.resume().catch(() => {});
      }

      recording = true;

      const stop = (cancel = false, msg = "") => {
        if (!recording) return;
        recording = false;
        try {
          scriptNode?.disconnect();
          sourceNode?.disconnect();
          audioCtx?.close();
          stream?.getTracks().forEach((t) => t.stop());
        } catch {}
        if (cancel) {
          onError?.(msg || "已取消");
          return;
        }
        const total = pcmL.reduce((n, a) => n + a.length, 0);
        if (total === 0) {
          onError?.("麦克风未采集到声音，请检查麦克风权限/默认设备/浏览器是否静音");
          return;
        }
        const merged = new Float32Array(total);
        let off = 0;
        for (const a of pcmL) {
          merged.set(a, off);
          off += a.length;
        }
        // ===== 诊断：扫描整段 PCM 真实数值范围（定位 RMS=3.99 异常值来源）=====
        let oob = 0, mn = Infinity, mx = -Infinity, nan = 0;
        for (let i = 0; i < merged.length; i++) {
          const v = merged[i];
          if (Number.isNaN(v)) { nan++; continue; }
          if (v > 1.0001 || v < -1.0001) oob++;
          if (v < mn) mn = v;
          if (v > mx) mx = v;
        }
        const headStr = Array.from(merged.slice(0, 10)).map((x) => x.toFixed(3)).join(",");
        const tailStr = Array.from(merged.slice(-10)).map((x) => x.toFixed(3)).join(",");
        onDebug?.(
          `PCM诊断: 采样率=${ctxRate} 样本数=${merged.length} 超[-1,1]=${oob} 最小=${mn.toFixed(4)} 最大=${mx.toFixed(4)} NaN=${nan}`
        );
        onDebug?.(`PCM首尾: 头[${headStr}] 尾[${tailStr}]`);
        // ===== 诊断结束 =====
        // 用同一段 PCM 离线估计性别（音高法），与 ASR 结果合并
        onDone(encodeWav(merged, ctxRate), estimateGender(merged, ctxRate));
      };
      (startRecording as any)._stop = () => stop(false);
      (startRecording as any)._cancel = (m?: string) => stop(true, m);
      (startRecording as any)._speechStarted = false;
    };

    navigator.mediaDevices
      .getUserMedia(constraints as any)
      .then(tryStart)
      .catch(() => {
        // 第一次失败可能是浏览器不支持高级约束，再试最简约束
        navigator.mediaDevices
          .getUserMedia(simpleConstraints as any)
          .then(tryStart)
          .catch((e2: any) => {
            onError?.(`无法访问麦克风：${e2?.message || e2}`);
          });
      });
  }

  // 方案A（进交互前预热麦克风）：单独开一路采集，只跑 START_GRACE_MS 估算底噪
  // （此刻数字人尚未开口，环境安静，底噪不会被 TTS 回声抬高），估算完成后立刻
  // 关闭这路采集并回调 onReady。
  // 目的：① 提前获取麦克风权限（避免首次 listen 弹窗冷启动）；
  //       ② 让浏览器 AudioContext / 硬件链路进入"已激活"状态，大幅缩短首次 listen 的冷启动；
  //       ③ 验证 VAD 能拿到音频数据（onDebug 可见）。
  // 完全独立于 listen() 的状态机，不进入识别、不送 ASR，风险为零。
  function preheat(
    onReady?: (info: { noiseFloor: number }) => void,
    onError?: (msg: string) => void,
    onDebug?: (msg: string) => void
  ) {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) {
      onError?.("当前环境不支持麦克风，请用 Chrome/Edge 并授权");
      return;
    }
    const constraints = {
      audio: {
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    };
    const simpleConstraints = { audio: { channelCount: 1 } };
    const tryStart = (s: MediaStream) => {
      const audioCtx = new (window.AudioContext ||
        (window as any).webkitAudioContext)({ sampleRate: TARGET_RATE });
      const sourceNode = audioCtx.createMediaStreamSource(s);
      const scriptNode = audioCtx.createScriptProcessor(4096, 1, 1);
      const START_GRACE_MS = 250; // 与 startRecording 的宽限期一致
      const vadStart = Date.now();
      let graceMin = Infinity;
      scriptNode.onaudioprocess = (e) => {
        const ch = e.inputBuffer.getChannelData(0);
        let sum = 0;
        for (let i = 0; i < ch.length; i++) sum += ch[i] * ch[i];
        const rms = Math.sqrt(sum / ch.length);
        const elapsed = Date.now() - vadStart;
        if (elapsed < START_GRACE_MS) {
          graceMin = Math.min(graceMin, rms);
          return;
        }
        const noiseFloor = graceMin !== Infinity ? graceMin : rms;
        onDebug?.(`预校准: 底噪基准=${noiseFloor.toFixed(4)}`);
        onReady?.({ noiseFloor });
        // 校准完成 → 关闭这路采集，不占用麦克风（用户真说话由 listen() 另开）
        try {
          scriptNode.disconnect();
          sourceNode.disconnect();
          audioCtx.close();
          s.getTracks().forEach((t) => t.stop());
        } catch {}
      };
      sourceNode.connect(scriptNode);
      // 必须消费输出才会稳定触发 onaudioprocess，但 gain=0 不播出声
      const zeroGain = audioCtx.createGain();
      zeroGain.gain.value = 0;
      scriptNode.connect(zeroGain);
      zeroGain.connect(audioCtx.destination);
      if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    };
    navigator.mediaDevices
      .getUserMedia(constraints as any)
      .then(tryStart)
      .catch(() => {
        navigator.mediaDevices
          .getUserMedia(simpleConstraints as any)
          .then(tryStart)
          .catch((e2: any) => {
            onError?.(`无法访问麦克风：${e2?.message || e2}`);
          });
      });
  }

  function encodeWav(samples: Float32Array, rate: number): Blob {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    const writeStr = (off: number, s: string) => {
      for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
    };
    writeStr(0, "RIFF");
    view.setUint32(4, 36 + samples.length * 2, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, "data");
    view.setUint32(40, samples.length * 2, true);
    let off = 44;
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
    return new Blob([view], { type: "audio/wav" });
  }

  // 基于音高（基频 F0）的性别估计：男性基频约 85–180Hz，女性约 165–255Hz。
  // 用自相关法从录音 PCM 估计平均 F0，离线、无额外模型依赖。
  // 结果保守：落在男女交界区或无明显周期时返回 neutral，避免叫错"先生/女士"尴尬。
  function estimateF0(seg: Float32Array, rate: number): number {
    // 降采样到 8k 降低计算量
    const target = 8000;
    const step = Math.max(1, Math.round(rate / target));
    const down: number[] = [];
    for (let i = 0; i < seg.length; i += step) down.push(seg[i]);
    const N = down.length;
    if (N < 256) return 0;
    let zeroLag = 0;
    for (let i = 0; i < N; i++) zeroLag += down[i] * down[i];
    const minLag = Math.floor(target / 300); // 300Hz 上限
    const maxLag = Math.floor(target / 70); // 70Hz 下限
    let bestLag = -1, bestCorr = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let corr = 0;
      for (let i = 0; i + lag < N; i++) corr += down[i] * down[i + lag];
      if (corr > bestCorr) {
        bestCorr = corr;
        bestLag = lag;
      }
    }
    // 无明显周期（清音/噪声/静音）→ 返回 0
    if (bestLag <= 0 || bestCorr < 0.3 * zeroLag) return 0;
    return target / bestLag;
  }

  function estimateGender(samples: Float32Array, rate: number): Gender {
    // 取中间 80%，去掉首尾静音段
    const start = Math.floor(samples.length * 0.1);
    const end = Math.floor(samples.length * 0.9);
    const seg = samples.subarray(start, end);
    const f0 = estimateF0(seg, rate);
    if (f0 <= 0) return "neutral";
    if (f0 < 160) return "male";
    if (f0 > 175) return "female";
    return "neutral"; // 交界区，保守处理
  }

  async function postAsr(blob: Blob): Promise<AsrResult> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const resp = await fetch("/api/voice", { method: "POST", body: blob, signal: ctrl.signal });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || `ASR 请求失败 ${resp.status}`);
      }
      const data = await resp.json();
      return {
        text: data.text || "",
        gender: data.gender || "neutral",
        bytes: data.bytes ?? blob.size,
        rms_dbfs: data.rms_dbfs,
      };
    } catch (e: any) {
      if (e?.name === "AbortError") throw new Error("ASR 超时，请检查语音服务是否启动");
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  function speakViaPiper(
    t: string,
    onStart?: () => void,
    onEnd?: () => void,
    myGen?: number,
    onSentence?: (sentence: string, index: number) => void
  ) {
    tts.queue = splitSentences(t);
    tts.onStart = onStart;
    tts.onEnd = onEnd;
    tts.onSentence = onSentence;
    tts.sentenceIndex = 0;
    tts.playing = false;
    playNextSentence(myGen);
  }

  function cancelPlayback() {
    tts.gen++;
    tts.queue = [];
    tts.sentenceTimers.forEach(clearTimeout);
    tts.sentenceTimers = [];
    tts.sentenceIndex = 0;
    tts.onSentence = undefined;
    if (tts.currentEl) {
      tts.currentEl.pause();
      tts.currentEl.currentTime = 0;
      tts.currentEl = null;
    }
    tts.playing = false;
  }

  return {
    listen(onResult, onError, onDebug) {
      if (recording) {
        // 已检测到人声→提交；还没说话→取消（避免送空录音）
        if ((startRecording as any)._speechStarted)
          (startRecording as any)._stop?.();
        else (startRecording as any)._cancel?.("已取消");
        return;
      }
      startRecording(
        async (wav, localGender) => {
          try {
            const res = await postAsr(wav);
            // 优先用本地音高估计的性别；拿不准（neutral）时回退服务端（通常也是 neutral）
            const g: Gender =
              localGender !== "neutral" ? localGender : res.gender || "neutral";
            onResult({ ...res, gender: g });
          } catch (e: any) {
            onError?.(e?.message || "ASR 失败");
          }
        },
        (m) => onError?.(m),
        onDebug
      );
    },
    stop() {
      (startRecording as any)._stop?.();
    },
    isListening() {
      return recording;
    },
    async speak(text, onStart, onEnd, onSentence) {
      const t = cleanForTts(text);
      if (!t) return;
      cancelPlayback();
      const myGen = ++tts.gen;
      tts.onSentence = onSentence;
      const sentences = splitSentences(t);
      const file = TTS_MAP[t] ?? TTS_MAP[text];
      if (file) {
        let fallbackUsed = false;
        const el = new Audio(`/audio/tts/${file}`);
        tts.currentEl = el;
        tts.playing = true;
        el.onloadedmetadata = () => {
          if (myGen === tts.gen) schedulePrerecordSentences(sentences, el.duration, myGen);
        };
        el.onplay = () => {
          if (myGen !== tts.gen) return;
          onStart?.();
          if (onSentence && sentences.length > 0) onSentence(sentences[0], 0);
        };
        el.onended = () => {
          if (myGen !== tts.gen) return;
          tts.playing = false;
          tts.currentEl = null;
          tts.sentenceTimers.forEach(clearTimeout);
          tts.sentenceTimers = [];
          onEnd?.();
        };
        const fallback = () => {
          if (myGen !== tts.gen || fallbackUsed) return;
          fallbackUsed = true;
          tts.playing = false;
          tts.currentEl = null;
          tts.sentenceTimers.forEach(clearTimeout);
          tts.sentenceTimers = [];
          speakViaPiper(t, onStart, onEnd, myGen, onSentence);
        };
        el.onerror = fallback;
        el.play().catch(fallback);
        return;
      }
      speakViaPiper(t, onStart, onEnd, myGen, onSentence);
    },
    cancel() {
      cancelPlayback();
    },
    preheat,
  };
}

export function createVoiceProvider(): VoiceProvider {
  // 生产默认 server（浏览器原生 ASR 走 Google，国内大屏不可用）
  const mode = (
    process.env.NEXT_PUBLIC_VOICE_PROVIDER || "server"
  ).toLowerCase();
  return mode === "browser" ? createBrowserVoice() : createServerVoice();
}
