import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { createServer } from "node:http";
import { config } from "../server/config.js";
import { OpenAIService } from "../server/openai.js";
import { createApp } from "../server/app.js";

// Pass a synthetic speech fixture; this script never accesses the microphone or database.
const file = process.argv[2];
if (!file)
  throw new Error(
    "Usage: node scripts/smoke-transcription.js <synthetic-audio.webm|wav|mp3>",
  );
const type = {
  ".webm": "audio/webm",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
}[extname(file)];
if (!type) throw new Error("Unsupported smoke-test fixture format");
const audio = await readFile(resolve(file));
const server = createServer(
  createApp({ config, ai: new OpenAIService(config) }),
);
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
try {
  const response = await fetch(
    `http://127.0.0.1:${server.address().port}/api/preparation/transcribe?language=auto`,
    {
      method: "POST",
      headers: { "Content-Type": type },
      body: audio,
    },
  );
  const result = await response.json();
  if (!response.ok || !result.text?.trim())
    throw new Error(result.error || "Empty transcript");
  console.log(
    JSON.stringify({
      model: config.transcriptionModel,
      format: type,
      bytes: audio.length,
      text: result.text,
    }),
  );
} finally {
  server.closeAllConnections();
  server.close();
}
