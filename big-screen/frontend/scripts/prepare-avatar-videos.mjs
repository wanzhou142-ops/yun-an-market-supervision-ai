/**
 * 将 raw/*.mp4 转为透明 WebM，并同步 avatar-states manifest。
 * 运行：npm run prepare:avatars
 *
 * 前置：ffmpeg 在 PATH 中；原始文件放在 public/avatar-states/raw/{idle,listening,speaking}.mp4
 */
import { existsSync } from "fs";
import { execSync, spawnSync } from "child_process";
import { mkdir, readdir } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import { syncAvatarManifest } from "./sync-avatar-manifest.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "public", "avatar-states");
const RAW_DIR = path.join(OUT_DIR, "raw");

const STATES = ["idle", "listening", "speaking"];

/** 绿幕抠像参数（生成时用 #00FF00 背景） */
const CHROMAKEY = "chromakey=0x00FF00:0.12:0.08,format=yuva420p";

function hasFfmpeg() {
  const r = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  return r.status === 0;
}

function findRawInput(state) {
  const base = path.join(RAW_DIR, state);
  for (const ext of [".mp4", ".mov", ".webm", ".mkv"]) {
    const p = base + ext;
    if (existsSync(p)) return p;
  }
  return null;
}

function convertToWebm(input, output, durationSec = 5) {
  const vf = CHROMAKEY;
  const cmd = [
    "ffmpeg",
    "-y",
    "-i",
    input,
    "-t",
    String(durationSec),
    "-vf",
    vf,
    "-c:v",
    "libvpx-vp9",
    "-pix_fmt",
    "yuva420p",
    "-auto-alt-ref",
    "0",
    "-b:v",
    "2M",
    output,
  ];
  execSync(cmd.join(" "), { stdio: "inherit" });
}

async function syncManifest() {
  return syncAvatarManifest();
}

async function main() {
  await mkdir(RAW_DIR, { recursive: true });
  await mkdir(OUT_DIR, { recursive: true });

  const ffmpegOk = hasFfmpeg();
  if (!ffmpegOk) {
    process.stdout.write("ffmpeg not found — skipping transcode, syncing manifest only.\n");
  }

  if (ffmpegOk) {
    let rawFiles = [];
    try {
      rawFiles = await readdir(RAW_DIR);
    } catch {
      rawFiles = [];
    }
    if (rawFiles.length === 0) {
      process.stdout.write(
        `No files in ${RAW_DIR}. Place idle.mp4 / listening.mp4 / speaking.mp4 to transcode.\n`
      );
    }

    for (const state of STATES) {
      const input = findRawInput(state);
      if (!input) continue;
      const output = path.join(OUT_DIR, `${state}.webm`);
      process.stdout.write(`Transcoding ${state}: ${path.basename(input)} → ${state}.webm\n`);
      try {
        convertToWebm(input, output);
      } catch (err) {
        console.error(`Failed to transcode ${state}:`, err.message);
      }
    }
  }

  const manifest = await syncManifest();
  process.stdout.write("Manifest synced:\n");
  for (const [state, meta] of Object.entries(manifest)) {
    process.stdout.write(`  ${state}: ${meta.type} → ${meta.src}\n`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
