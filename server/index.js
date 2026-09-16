import { join } from "node:path";
import { config } from "./config.js";
import { Store } from "./store.js";
import { OpenAIService } from "./openai.js";
import { Classroom } from "./classroom.js";
import { createApp } from "./app.js";
import { Preparation } from "./preparation.js";
const store = new Store(join(config.dataDir, "learning.sqlite"));
const ai = new OpenAIService(config);
const classroom = new Classroom(store, ai, config);
const preparation = new Preparation(store, ai);
const app = createApp({ store, classroom, config, preparation, ai });
const server = app.listen(config.port, "127.0.0.1", () => {
  // Recover only after owning the port. A second launch must not interrupt the running instance.
  store.recoverPreparation();
  for (const lesson of store.recover())
    if (lesson.remote_id) ai.closeLive(lesson.remote_id).catch(() => {});
  console.log(
    `EnglishLehrer ist bereit: http://127.0.0.1:${config.port}\nAPI key configured: ${Boolean(config.apiKey)}`,
  );
});
server.on("error", (error) => {
  console.error(
    error.code === "EADDRINUSE"
      ? "EnglishLehrer läuft bereits oder der Port ist belegt."
      : "Der lokale Server konnte nicht gestartet werden.",
  );
  process.exitCode = 1;
  store.close();
});
const sweep = setInterval(() => classroom.sweep().catch(() => {}), 10000);
sweep.unref();
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  clearInterval(sweep);
  await classroom.shutdown();
  await preparation.shutdown();
  server.close();
  server.closeAllConnections();
  store.close();
}
process.on("SIGINT", () => stop().finally(() => process.exit()));
process.on("SIGTERM", () => stop().finally(() => process.exit()));
