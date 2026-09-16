import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
export const root = fileURLToPath(new URL("../", import.meta.url));
export function loadConfig(env = process.env, directory = root) {
  const path = resolve(directory, ".env");
  const file = existsSync(path) ? parseEnv(readFileSync(path, "utf8")) : {};
  const setting = (key, fallback) =>
    env[key]?.trim() || file[key]?.trim() || fallback;
  return {
    port: Number(env.ENGLISH_PORT || 3210),
    dataDir: resolve(env.ENGLISH_DATA_DIR || resolve(directory, "data")),
    // Windows environment names are case-insensitive; support the conventional spelling on other OSes.
    apiKey: (env.openai_api_key || env.OPENAI_API_KEY || "").trim(),
    liveModel: setting("ENGLISH_LIVE_MODEL", "gpt-live-1"),
    teacherModel: setting("ENGLISH_TEACHER_MODEL", "gpt-5.6-terra"),
    imageModel: setting("ENGLISH_IMAGE_MODEL", "gpt-image-2.5-flare"),
    transcriptionModel: setting(
      "ENGLISH_TRANSCRIPTION_MODEL",
      "gpt-transcribe",
    ),
    voice: setting("ENGLISH_VOICE", "marin"),
  };
}
export const config = loadConfig();
