/*
 * 一键启动入口（展机双击 start.bat / start.sh 即调用本文件）
 * 作用：
 *   1. 读取 .env.local 注入环境变量（DIFY_API_KEY / DIFY_API_BASE 等）
 *      注：当前大屏三场景未调用 Dify，保留配置供后续扩展/统一接口。
 *   2. 启动 Next.js standalone 服务（server.js，自带运行时，无需 npm install）
 *   3. 延迟几秒后用默认浏览器打开迎宾大厅（非全屏，便于自由切换场景）
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

// ── 1. 加载 .env.local ──────────────────────────────────────────────
const envPath = path.join(__dirname, ".env.local");
if (fs.existsSync(envPath)) {
  const txt = fs.readFileSync(envPath, "utf8");
  for (const raw of txt.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([\w.-]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
  console.log("[start] 已加载 .env.local");
} else {
  console.warn(
    "[start] 未找到 .env.local，请复制 .env.local.example 为 .env.local 并填入客户 Dify 的 Key"
  );
}

// ── 2. 启动服务 ────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const server = spawn(process.execPath, ["server.js"], {
  cwd: __dirname,
  env: process.env,
  stdio: "inherit",
});

// ── 3. 等几秒用浏览器打开（展机优先 Chrome + 允许自动带声播放）──
const SCENE = process.env.SCENE || "welcome";
setTimeout(() => {
  const url = `http://localhost:${PORT}?scene=${SCENE}`;

  // 展机场景：用 Chrome 并加 --autoplay-policy=no-user-gesture-required，
  // 让背景视频无需用户手势即可带声自动播放；找不到 Chrome 时回退默认浏览器。
  const chromeCandidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    (process.env.LOCALAPPDATA || "") + "\\Google\\Chrome\\Application\\chrome.exe",
  ];
  const chrome = chromeCandidates.find((p) => p && fs.existsSync(p));

  let opener;
  if (chrome) {
    opener = spawn(chrome, [
      "--autoplay-policy=no-user-gesture-required",
      "--start-fullscreen",
      url,
    ]);
    console.log("[start] 用 Chrome 打开（已允许自动带声播放）：" + url);
  } else if (process.platform === "win32") {
    opener = spawn("cmd", ["/c", "start", "", url]);
  } else if (process.platform === "darwin") {
    opener = spawn("open", [url]);
  } else {
    opener = spawn("xdg-open", [url]);
  }
  opener.on("error", () => {});
  if (!chrome)
    console.log(
      "[start] 未找到 Chrome，已用默认浏览器打开（自动带声播放可能受限，建议安装 Chrome 或手动允许自动播放）：" +
        url
    );
}, 5000);

server.on("exit", (code) => process.exit(code ?? 0));
