// 调用 Dify 的 chat-messages 接口（服务端使用，Key 不进前端）
// 文档参考：Dify /v1/chat-messages（blocking 非流式模式，新手先跑通这个）

export interface DifyChatResult {
  answer: string;
  conversationId: string;
}

export async function sendToDify(
  message: string,
  conversationId: string,
  apiKey: string,
  baseUrl: string,
  scene?: string
): Promise<DifyChatResult> {
  const res = await fetch(`${baseUrl}/chat-messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      // 方案 B：把当前场景透传给 Dify，由 Dify 按 scene 做提示词/知识库路由
      inputs: scene ? { scene } : {},
      query: message,
      response_mode: "blocking",
      conversation_id: conversationId || undefined,
      user: "kiosk-user", // 大屏固定一个用户标识即可
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
