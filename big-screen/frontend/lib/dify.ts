// 调用 Dify 的 chat-messages 接口（服务端使用，Key 不进前端）
// 文档参考：Dify /v1/chat-messages（blocking 非流式模式，新手先跑通这个）

export interface DifyChatInputs {
  scene: string;
  aspect?: string;
  chapter?: string;
}

export interface DifyChatResult {
  answer: string;
  conversationId: string;
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
    body: JSON.stringify({
      inputs: {
        scene: inputs.scene,
        aspect: inputs.aspect ?? "",
        chapter: inputs.chapter ?? "",
      },
      query: message,
      response_mode: "blocking",
      conversation_id: conversationId || undefined,
      user: "kiosk-user",
    }),
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
