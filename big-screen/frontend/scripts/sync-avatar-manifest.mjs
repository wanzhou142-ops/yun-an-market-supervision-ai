/**
 * 扫描 public/avatar-states 下 webm/png，写入 manifest。
 * 被 setup:avatars / prepare:avatars 调用，也可单独：node scripts/sync-avatar-manifest.mjs
 */
import { existsSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "public", "avatar-states");
const LIB_MANIFEST = path.join(ROOT, "lib", "avatar-states-manifest.json");

const STATES = ["idle", "listening", "speaking"];

export async function syncAvatarManifest() {
  await mkdir(OUT_DIR, { recursive: true });
  const manifest = {};
  for (const state of STATES) {
    const hasWebm = existsSync(path.join(OUT_DIR, `${state}.webm`));
    const hasPng = existsSync(path.join(OUT_DIR, `${state}.png`));
    manifest[state] = {
      type: hasWebm ? "video" : "image",
      src: hasWebm ? `/avatar-states/${state}.webm` : `/avatar-states/${state}.png`,
      ...(hasPng ? { poster: `/avatar-states/${state}.png` } : {}),
      loop: true,
    };
  }
  const json = JSON.stringify(manifest, null, 2) + "\n";
  await writeFile(path.join(OUT_DIR, "manifest.json"), json);
  await writeFile(LIB_MANIFEST, json);
  return manifest;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  syncAvatarManifest()
    .then((m) => {
      for (const [k, v] of Object.entries(m)) {
        process.stdout.write(`${k}: ${v.type} ${v.src}\n`);
      }
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
