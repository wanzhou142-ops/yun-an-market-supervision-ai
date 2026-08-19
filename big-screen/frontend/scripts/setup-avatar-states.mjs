/**
 * 从现有三张场景 PNG 映射全局三态占位图，并同步 manifest（video 优先若 .webm 已存在）。
 * 运行：npm run setup:avatars
 */
import { copyFile, mkdir } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { syncAvatarManifest } from "./sync-avatar-manifest.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const OUT_DIR = path.join(PUBLIC, "avatar-states");

const STATE_SOURCES = {
  idle: "avatar-pharmacy.png",
  listening: "avatar-corridor.png",
  speaking: "avatar-welcome.png",
};

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  for (const [state, srcName] of Object.entries(STATE_SOURCES)) {
    const srcPath = path.join(PUBLIC, srcName);
    const destPath = path.join(OUT_DIR, `${state}.png`);
    await copyFile(srcPath, destPath);
    process.stdout.write(`  ${state}.png ← ${srcName}\n`);
  }

  const manifest = await syncAvatarManifest();
  process.stdout.write("Manifest synced.\n");
  for (const [state, meta] of Object.entries(manifest)) {
    process.stdout.write(`  ${state}: ${meta.type} → ${meta.src}\n`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
