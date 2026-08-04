import { NextResponse } from "next/server";

// 诊断端点：浏览器直接访问 /api/voice/health 即可看到
// Next.js 服务端能否连上本机语音服务（默认 127.0.0.1:8000），
// 以及如果不通，失败的真实原因（cause），方便现场排错。
// 注意：Windows 下 Node fetch "localhost" 可能解析到 IPv6 (::1)，而 voice-service
// 通常只监听 IPv4 (127.0.0.1)，会导致 4 秒超时 abort。因此默认优先 127.0.0.1，
// 并自动探测 localhost 作为兜底。

function serviceCandidates() {
  const env = process.env.VOICE_SERVICE_URL?.trim();
  const base = ["http://127.0.0.1:8000", "http://localhost:8000"];
  if (env && !base.includes(env)) return [env, ...base];
  return base;
}

async function probe(url: string, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${url}/health`, {
      method: "GET",
      signal: ctrl.signal,
      cache: "no-store",
    });
    clearTimeout(t);
    const text = await r.text();
    return { url, ok: r.ok, status: r.status, body: text.slice(0, 500) };
  } catch (e: any) {
    clearTimeout(t);
    const cause = e?.cause?.code || e?.cause?.message || e?.cause || "";
    return {
      url,
      ok: false,
      error: e?.message || String(e),
      cause: String(cause),
    };
  }
}

export async function GET() {
  const candidates = serviceCandidates();
  const probes = [];
  for (const url of candidates) {
    const p = await probe(url);
    probes.push(p);
    if (p.ok) break; // 有一个通就停，避免不必要等待
  }
  const best = probes.find((p) => p.ok) || probes[0];

  return NextResponse.json(
    {
      svc: best.url,
      reachable: best.ok,
      status: best.status,
      body: best.body,
      error: best.error,
      cause: best.cause,
      probes,
      envUrl: process.env.VOICE_SERVICE_URL || "(not set)",
      httpProxy: process.env.HTTP_PROXY || process.env.http_proxy || "(none)",
      httpsProxy: process.env.HTTPS_PROXY || process.env.https_proxy || "(none)",
      noProxy: process.env.NO_PROXY || process.env.no_proxy || "(none)",
    },
    { status: 200 }
  );
}
