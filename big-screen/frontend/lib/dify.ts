// 调用 Dify 的 chat-messages 接口（服务端使用，Key 不进前端）
// Chatflow 流式：message 事件的 answer 为增量 chunk，需拼接（见 Dify streaming 文档）。

import {
  extractAnswerFromEvent,
  mergeStreamAnswer,
} from "./dify-stream-utils";

export interface DifyChatInputs {
  scene: string;
  aspect?: string;
  chapter?: string;
}

export interface DifyChatResult {
  answer: string;
  conversationId: string;
}

function buildChatBody(
  message: string,
  conversationId: string,
  inputs: DifyChatInputs,
  streaming: boolean
) {
  return {
    inputs: {
      scene: inputs.scene,
      aspect: inputs.aspect ?? "",
      chapter: inputs.chapter ?? "",
    },
    query: message,
    response_mode: streaming ? "streaming" : "blocking",
    conversation_id: conversationId || undefined,
    user: "kiosk-user",
  };
}

export async function sendToDify(
  message: string,
  conversationId: string,
  apiKey: string,
  baseUrl: string,
  inputs: DifyChatInputs
): Promise<DifyChatResult> {
  const res = await fetch(`${baseUrl}/chat-messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildChatBody(message, conversationId, inputs, false)),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Dify API ${res.status}: ${text}`);
  }

  const data = await res.json();
  return {
    answer: data.answer ?? "",
    conversationId: data.conversation_id ?? "",
  };
}

/** Dify SSE 流式：拼接 message/agent_message，累积后回调全文。 */
export async function streamFromDify(
  message: string,
  conversationId: string,
  apiKey: string,
  baseUrl: string,
  inputs: DifyChatInputs,
  onDelta: (fullAnswer: string, conversationId: string) => void
): Promise<DifyChatResult> {
  const res = await fetch(`${baseUrl}/chat-messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildChatBody(message, conversationId, inputs, true)),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Dify API ${res.status}: ${text}`);
  }
  if (!res.body) {
    throw new Error("Dify 流式响应无 body");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";
  let convId = conversationId;

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
      let evt: {
        event?: string;
        answer?: string;
        conversation_id?: string;
        message?: string;
        data?: unknown;
      };
      try {
        evt = JSON.parse(payload);
      } catch {
        continue;
      }
      if (evt.event === "error") {
        throw new Error(evt.message || "Dify 流式错误");
      }
      if (evt.conversation_id) convId = evt.conversation_id;

      if (typeof evt.answer === "string" && evt.answer) {
        const ev = evt.event;
        if (!ev || ev === "message" || ev === "agent_message") {
          answer = mergeStreamAnswer(answer, evt.answer);
          onDelta(answer, convId);
        }
      }

      if (evt.event === "workflow_finished") {
        const final = extractAnswerFromEvent(evt as Record<string, unknown>);
        if (final && final.length > answer.length) {
          answer = final;
          onDelta(answer, convId);
        }
      }

      if (evt.event === "message_end" && evt.conversation_id) {
        convId = evt.conversation_id;
      }
    }
  }

  return { answer, conversationId: convId };
}
