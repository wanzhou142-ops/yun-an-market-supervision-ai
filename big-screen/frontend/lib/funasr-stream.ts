/**
 * FunASR WebSocket 客户端（online 模式 · 客户端 VAD）。
 * 协议：首条 JSON 配置 → 二进制 PCM → 句末 {"is_speaking":false}
 */

const NAV_HOTWORDS = JSON.stringify({
  宣传廊: 10,
  普法宣传廊: 10,
  宣传栏: 10,
  宣传郎: 10,
  模拟药店: 8,
  药品区: 8,
  器械区: 8,
  化妆品区: 8,
  科普: 6,
  法规: 6,
  案例: 6,
  返回: 6,
  迎宾: 6,
});

export type FunAsrCallbacks = {
  onDebug?: (m: string) => void;
  onPartial?: (text: string) => void;
};

function floatToInt16(ch: Float32Array): ArrayBuffer {
  const buf = new Int16Array(ch.length);
  for (let i = 0; i < ch.length; i++) {
    const s = Math.max(-1, Math.min(1, ch[i]));
    buf[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return buf.buffer;
}

function wsUrl(base: string): string {
  const b = base.replace(/\/$/, "");
  if (b.endsWith("/asr/stream") || b.endsWith("/ws")) return b;
  return `${b}/asr/stream`;
}

export function createFunAsrStream(wsBase: string) {
  let ws: WebSocket | null = null;
  let callbacks: FunAsrCallbacks = {};
  let partial = "";
  let final = "";
  let fedBytes = 0;
  let utteranceOpen = false;
  let pending: Float32Array[] = [];
  let commitWait: {
    resolve: (t: string) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;

  function dbg(m: string) {
    callbacks.onDebug?.(m);
  }

  function flushPending() {
    if (!ws || ws.readyState !== WebSocket.OPEN || !utteranceOpen) return;
    for (const chunk of pending) {
      ws.send(floatToInt16(chunk));
      fedBytes += chunk.length * 2;
    }
    pending.length = 0;
  }

  function onMessage(ev: MessageEvent) {
    try {
      const msg = JSON.parse(String(ev.data));
      const text = String(msg.text || "").trim();
      const mode = String(msg.mode || "");
      if (msg.error) {
        dbg(`FunASR error: ${msg.error}`);
      }
      if (!text || (!mode.includes("online") && mode !== "2pass-online")) return;
      if (msg.is_final) {
        final = text;
        partial = text;
        dbg(`FunASR final "${text.slice(0, 24)}"`);
        if (commitWait) {
          clearTimeout(commitWait.timer);
          commitWait.resolve(text);
          commitWait = null;
        }
      } else {
        partial = text;
        dbg(`FunASR partial "${text.slice(0, 24)}"`);
        callbacks.onPartial?.(text);
      }
    } catch {
      /* ignore */
    }
  }

  function openSocket(): Promise<boolean> {
    if (ws?.readyState === WebSocket.OPEN) return Promise.resolve(true);
    if (ws?.readyState === WebSocket.CONNECTING) {
      return waitOpen(8000);
    }
    return new Promise((resolve) => {
      try {
        const sock = new WebSocket(wsUrl(wsBase));
        sock.binaryType = "arraybuffer";
        sock.onopen = () => {
          ws = sock;
          dbg("FunASR: 连接就绪");
          if (utteranceOpen) {
            sendConfig();
            flushPending();
          }
          resolve(true);
        };
        sock.onmessage = onMessage;
        sock.onerror = () => {
          dbg("FunASR: 连接错误");
          resolve(false);
        };
        sock.onclose = () => {
          if (ws === sock) {
            ws = null;
            utteranceOpen = false;
          }
        };
        ws = sock;
      } catch (e: unknown) {
        dbg(`FunASR: 连接失败 ${e instanceof Error ? e.message : e}`);
        resolve(false);
      }
    });
  }

  function waitOpen(maxMs: number): Promise<boolean> {
    const t0 = Date.now();
    return new Promise((resolve) => {
      const tick = () => {
        if (ws?.readyState === WebSocket.OPEN) {
          resolve(true);
          return;
        }
        if (Date.now() - t0 >= maxMs) {
          resolve(false);
          return;
        }
        setTimeout(tick, 40);
      };
      tick();
    });
  }

  function sendConfig() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(
      JSON.stringify({
        mode: "online",
        wav_name: "mic",
        is_speaking: true,
        wav_format: "pcm",
        chunk_size: [5, 10, 5],
        chunk_interval: 10,
        audio_fs: 16000,
        hotwords: NAV_HOTWORDS,
      })
    );
  }

  return {
    async preheat(onDebug?: (m: string) => void) {
      callbacks = { ...callbacks, onDebug };
      dbg("FunASR: 预热连接…");
      return openSocket();
    },

    beginUtterance(cbs: FunAsrCallbacks) {
      callbacks = { ...callbacks, ...cbs };
      partial = "";
      final = "";
      fedBytes = 0;
      pending.length = 0;
      utteranceOpen = true;
      if (ws?.readyState === WebSocket.OPEN) {
        sendConfig();
        flushPending();
      }
    },

    pushPcm(ch: Float32Array) {
      if (!utteranceOpen) return;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        pending.push(new Float32Array(ch));
        return;
      }
      if (pending.length) flushPending();
      ws.send(floatToInt16(ch));
      fedBytes += ch.length * 2;
    },

    async commit(): Promise<string> {
      utteranceOpen = false;
      flushPending();
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        return partial || final;
      }
      return new Promise((resolve) => {
        const finish = (t: string) => {
          if (commitWait) {
            clearTimeout(commitWait.timer);
            commitWait = null;
          }
          resolve(t || partial || final);
        };
        commitWait = {
          resolve: finish,
          timer: setTimeout(() => finish(final || partial), 1500),
        };
        try {
          ws!.send(JSON.stringify({ is_speaking: false }));
        } catch {
          finish(partial || final);
        }
      });
    },

    getPartial() {
      return partial;
    },
    getFinal() {
      return final;
    },
    getFedBytes() {
      return fedBytes;
    },
    pendingCount() {
      return pending.length;
    },
    isConnected() {
      return ws?.readyState === WebSocket.OPEN;
    },
    close() {
      utteranceOpen = false;
      if (ws) {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      }
      ws = null;
    },
  };
}

export type FunAsrStream = ReturnType<typeof createFunAsrStream>;
