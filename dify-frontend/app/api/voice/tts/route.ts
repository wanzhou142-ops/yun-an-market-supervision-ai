import { NextRequest, NextResponse } from "next/server";

// 语音合成(TTS)代理：前端把要念的文本 POST 到这里，
// 转发给本机语音服务（voice-service）的 /tts。
// 语音服务离线可用：Piper/SAPI5 返回 wav，edge-tts 返回 mp3。
// 这里把上游的 Content-Type 原样转发，前端 <audio> 都能播。

function serviceUrl() {
  // Windows 下 Node fetch "localhost" 可能解析到 IPv6 (::1)，而 voice-service
  // 通常只监听 IPv4 (127.0.0.1)，会导致连接超时。默认优先 127.0.0.1。
  return process.env.VOICE_SERVICE_URL || "http://127.0.0.1:8000";
}

export async function POST(req: NextRequest) {
  const svc = serviceUrl();
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const text = (body.text || "").toString().slice(0, 500);
  const voice = body.voice || "zh-CN-XiaoxiaoNeural";
  if (!text.trim()) {
    return NextResponse.json({ error: "text required" }, { status: 400 });
  }
  try {
    const r = await fetch(`${svc}/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice }),
    });
    if (!r.ok) {
      const msg = await r.text();
      return NextResponse.json(
        { error: `TTS 服务失败 ${r.status}: ${msg}` },
        { status: 502 }
      );
    }
    const buf = Buffer.from(await r.arrayBuffer());
    const ctype = r.headers.get("Content-Type") || "audio/mpeg";
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": ctype,
        "Content-Length": String(buf.length),
        "Cache-Control": "no-store",
      },
    });
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
