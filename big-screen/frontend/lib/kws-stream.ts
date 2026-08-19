/**
 * sherpa-onnx KWS WebSocket 客户端（导航关键词 · 客户端 VAD）。
 * 协议：JSON start → binary PCM int16 16kHz → JSON keyword/stop
 */

export type KwsCallbacks = {
  onDebug?: (m: string) => void;
  onKeyword?: (text: string) => void;
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
  if (b.endsWith("/kws")) return b;
  return `${b}/kws`;
}

export function createKwsStream(wsBase: string) {
  let ws: WebSocket | null = null;
  let callbacks: KwsCallbacks = {};
  let utteranceOpen = false;
  let pending: Float32Array[] = [];
  let fedBytes = 0;
  let lastKeyword = "";

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
      if (msg.type === "keyword" && msg.text) {
        const t = String(msg.text).trim();
        lastKeyword = t;
        dbg(`KWS hit "${t}"`);
        callbacks.onKeyword?.(t);
      } else if (msg.type === "error") {
        dbg(`KWS error: ${msg.error || msg.message}`);
      }
    } catch {
      /* ignore */
    }
  }

  function openSocket(): Promise<boolean> {
    if (ws?.readyState === WebSocket.OPEN) return Promise.resolve(true);
    if (ws?.readyState === WebSocket.CONNECTING) return waitOpen(8000);
    return new Promise((resolve) => {
      try {
        const sock = new WebSocket(wsUrl(wsBase));
        sock.binaryType = "arraybuffer";
        sock.onopen = () => {
          ws = sock;
          dbg("KWS: 连接就绪");
          if (utteranceOpen) {
            sendStart();
            flushPending();
          }
          resolve(true);
        };
        sock.onmessage = onMessage;
        sock.onerror = () => {
          dbg("KWS: 连接错误");
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
        dbg(`KWS: 连接失败 ${e instanceof Error ? e.message : e}`);
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

  function sendStart() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "start" }));
  }

  function sendStop() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(JSON.stringify({ type: "stop" }));
    } catch {
      /* ignore */
    }
  }

  return {
    async preheat(onDebug?: (m: string) => void) {
      callbacks = { ...callbacks, onDebug };
      dbg("KWS: 预热连接…");
      return openSocket();
    },

    beginUtterance(cbs: KwsCallbacks) {
      callbacks = { ...callbacks, ...cbs };
      fedBytes = 0;
      pending.length = 0;
      utteranceOpen = true;
      if (ws?.readyState === WebSocket.OPEN) {
        sendStart();
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

    endUtterance() {
      utteranceOpen = false;
      flushPending();
      sendStop();
    },

    getLastKeyword() {
      return lastKeyword;
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

export type KwsStream = ReturnType<typeof createKwsStream>;
