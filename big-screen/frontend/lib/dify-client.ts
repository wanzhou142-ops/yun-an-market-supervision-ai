// 浏览器端调用 Next.js /api/chat → Dify（Key 只在服务端 .env.local）

export interface AskDifyInputs {
  scene: string;
  aspect?: string | null;
  chapter?: string | null;
}

export interface AskDifyResult {
  answer: string;
  conversationId: string;
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
