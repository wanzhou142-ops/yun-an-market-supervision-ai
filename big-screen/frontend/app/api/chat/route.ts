import { NextRequest, NextResponse } from "next/server";
import { sendToDify, streamFromDify } from "@/lib/dify";

export async function POST(req: NextRequest) {
  const apiKey = process.env.DIFY_API_KEY;
  const baseUrl = process.env.DIFY_API_BASE;

  if (!apiKey || !baseUrl) {
    return NextResponse.json(
      { error: "服务器未配置 DIFY_API_KEY 或 DIFY_API_BASE，请检查 .env.local" },
      { status: 500 }
    );
  }

  let body: {
    message?: string;
    conversationId?: string;
    scene?: string;
    aspect?: string;
    chapter?: string;
    stream?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体解析失败" }, { status: 400 });
  }

  const message = body.message?.trim();
  if (!message) {
    return NextResponse.json({ error: "message 不能为空" }, { status: 400 });
  }

  const scene = body.scene?.trim() || "welcome";
  const inputs = {
    scene,
    aspect: body.aspect?.trim() ?? "",
    chapter: body.chapter?.trim() ?? "",
  };
  const conversationId = body.conversationId ?? "";

  if (body.stream) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: object) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        };
        try {
          await streamFromDify(
            message,
            conversationId,
            apiKey,
            baseUrl,
            inputs,
            (answer, convId) => {
              send({ event: "message", answer, conversationId: convId });
            }
          );
          send({ event: "message_end" });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "未知错误";
          send({ event: "error", error: msg });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  try {
    const result = await sendToDify(
      message,
      conversationId,
      apiKey,
      baseUrl,
      inputs
    );
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "未知错误";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
