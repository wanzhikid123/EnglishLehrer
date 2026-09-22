import { config } from "../server/config.js";
import { OpenAIService } from "../server/openai.js";
const ai = new OpenAIService(config);
console.log("Environment API key configured:", Boolean(config.apiKey));
for (const model of [
  config.liveModel,
  config.teacherModel,
  config.transcriptionModel,
]) {
  try {
    await ai.request("/models/" + encodeURIComponent(model));
    console.log(model + ": accessible");
  } catch (e) {
    console.log(model + ": " + e.message);
    process.exitCode = 1;
  }
}
if (process.argv.includes("--response")) {
  try {
    const r = await ai.responses(
      [{ role: "user", content: "Say exactly: Hallo!" }],
      [],
      "Return one greeting.",
    );
    console.log("Teaching API response:", r.status);
  } catch (e) {
    console.log(e.message);
    process.exitCode = 1;
  }
}
