// 浏览器端调用 Next.js /api/chat → Dify（Key 只在服务端 .env.local）

import {
  extractAnswerFromEvent,
  isSpeakableSentence,
  mergeStreamAnswer,
} from "./dify-stream-utils";
import { splitStreamingSentences } from "./sentence-stream";

export interface AskDifyInputs {
  scene: string;
  aspect?: string | null;
  chapter?: string | null;
}

export interface AskDifyResult {
  answer: string;
  conversationId: string;
}

export interface AskDifyStreamCallbacks {
  onSentence: (sentence: string, index: number) => void;
  onDone?: (result: AskDifyResult) => void;
}

export async function askDifyBlocking(
  message: string,
  inputs: AskDifyInputs,
  conversationId: string
): Promise<AskDifyResult> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      scene: inputs.scene,
      aspect: inputs.aspect ?? "",
      chapter: inputs.chapter ?? "",
      conversationId: conversationId || undefined,
      stream: false,
    }),
  });
  let data: { answer?: string; conversationId?: string; error?: string } = {};
  try {
    data = await res.json();
  } catch {
    /* 非 JSON 响应 */
  }
  if (!res.ok) {
    throw new Error(data.error || `Dify 请求失败 ${res.status}`);
  }
  return {
    answer: (data.answer ?? "").trim(),
    conversationId: data.conversationId ?? conversationId,
  };
}

function applyStreamEvent(
  evt: Record<string, unknown>,
  state: { answer: string; convId: string }
): boolean {
  const event = evt.event as string | undefined;
  if (event === "error") {
    throw new Error((evt.message as string) || (evt.error as string) || "Dify 流式错误");
  }
  const cid = (evt.conversationId ?? evt.conversation_id) as string | undefined;
  if (cid) state.convId = cid;

  let changed = false;
  const chunk = evt.answer;
  if (typeof chunk === "string" && chunk) {
    if (!event || event === "message" || event === "agent_message") {
      const merged = mergeStreamAnswer(state.answer, chunk);
      if (merged !== state.answer) {
        state.answer = merged;
        changed = true;
      }
    }
  }

  if (event === "workflow_finished") {
    const final = extractAnswerFromEvent(evt);
    if (final && final.length > state.answer.length) {
      state.answer = final;
      changed = true;
    }
  }
  return changed;
}

/** Step 6：SSE 流式问答，按句回调（首句即播 TTS）。 */
export async function askDifyStreaming(
  message: string,
  inputs: AskDifyInputs,
  conversationId: string,
  callbacks: AskDifyStreamCallbacks
): Promise<AskDifyResult> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      scene: inputs.scene,
      aspect: inputs.aspect ?? "",
      chapter: inputs.chapter ?? "",
      conversationId: conversationId || undefined,
      stream: true,
    }),
  });

  if (!res.ok) {
    let err = `Dify 请求失败 ${res.status}`;
    try {
      const j = await res.json();
      err = j.error || err;
    } catch {
      /* ignore */
    }
    throw new Error(err);
  }
  if (!res.body) throw new Error("Dify 流式响应无 body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const state = { answer: "", convId: conversationId };
  let emittedLen = 0;
  let sentenceIndex = 0;

  const emitFromFull = () => {
    const { sentences, emittedLen: next } = splitStreamingSentences(
      state.answer,
      emittedLen
    );
    emittedLen = next;
    for (const s of sentences) {
      if (!isSpeakableSentence(s)) continue;
      callbacks.onSentence(s, sentenceIndex++);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      let evt: Record<string, unknown>;
      try {
        evt = JSON.parse(payload);
      } catch {
        continue;
      }
      if (applyStreamEvent(evt, state)) emitFromFull();
    }
  }

  const tail = state.answer.slice(emittedLen).trim();
  if (tail && isSpeakableSentence(tail)) {
    callbacks.onSentence(tail, sentenceIndex++);
  }

  const result = {
    answer: state.answer.trim(),
    conversationId: state.convId,
  };
  callbacks.onDone?.(result);
  return result;
}
