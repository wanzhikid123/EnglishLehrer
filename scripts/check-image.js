// Optional paid check of the app's image adapter; outputs are isolated from the child's data.
import { config } from "../server/config.js";
import { OpenAIService } from "../server/openai.js";
import { resolve, join } from "node:path";
import { readFile } from "node:fs/promises";
const options = { ...config, dataDir: resolve(".cache/image-smoke") };
try {
  const result = await new OpenAIService(options).image(
    "One cheerful small brown bear holding a blue ball, simple isolated teaching illustration.",
    new AbortController().signal,
  );
  const file = join(options.dataDir, "images", result.hash + ".png");
  const bytes = await readFile(file);
  if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a")
    throw new Error("Unexpected image format");
  console.log(
    "Image API passed:",
    bytes.readUInt32BE(16) + "x" + bytes.readUInt32BE(20),
    "PNG",
  );
  console.log("Verified output:", file);
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
