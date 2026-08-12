import { NextRequest, NextResponse } from "next/server";

// 语音识别(ASR)代理：前端把麦克风录音 POST 到这里（二进制音频），
// 我们转发给本机语音服务（voice-service，默认 127.0.0.1:8000）的 /asr，
// 返回 { text, gender }。生产 ASR 走国内云（voice-service 内拨号），
// 阶段1 未配 key 时 voice-service 返回 mock 短语，整条 UX 链路仍可 demo。

function serviceUrl() {
  // Windows 下 Node fetch "localhost" 可能解析到 IPv6 (::1)，而 voice-service
  // 通常只监听 IPv4 (127.0.0.1)，会导致连接超时。默认优先 127.0.0.1。
  return process.env.VOICE_SERVICE_URL || "http://127.0.0.1:8000";
}

export async function POST(req: NextRequest) {
  const svc = serviceUrl();
  const buf = Buffer.from(await req.arrayBuffer());
  try {
    const r = await fetch(`${svc}/asr`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: buf,
    });
    const data = await r.json();
    return NextResponse.json(data, { status: r.status });
  } catch (e: any) {
    const cause = e?.cause?.code || e?.cause?.message || e?.cause || "";
    return NextResponse.json(
      {
        error: `语音服务不可达(${svc})：${e?.message || e}`,
        cause: String(cause),
      },
      { status: 502 }
    );
  }
}
