// One real image generation through the pre-class workflow, isolated from learner data.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { config } from "../server/config.js";
import { OpenAIService } from "../server/openai.js";
import { Store } from "../server/store.js";
import { LessonPlans } from "../server/lesson-plans.js";

const options = { ...config, dataDir: resolve(".cache/plan-image-smoke") };
const store = new Store(":memory:");
const ai = new OpenAIService(options);
let calls = 0;
const image = ai.image.bind(ai);
ai.image = (...args) => {
  calls++;
  return image(...args);
};
const plans = new LessonPlans(store, ai, options);
try {
  const topic = {
    ...store.topic("objects"),
    words: ["striped lunchbox"],
    phrases: [],
  };
  store.db
    .prepare("UPDATE topics SET payload=? WHERE id='objects'")
    .run(JSON.stringify(topic));
  const plan = {
    goal: "Eine gestreifte Brotdose benennen.",
    steps: ["repeat", "picture_speak"].map((mode, i) => ({
      id: `step-${i}`,
      mode,
      word: "striped lunchbox",
      german: "gestreifte Brotdose",
      distractors: [],
      stage: i ? "practice" : "new",
      seconds: 45,
    })),
  };
  let result = await plans.build(
    "objects",
    { expectedRevision: 0, expectedTopicRevision: 1, plan },
    true,
  );
  const material = result.plan.materials["striped lunchbox"];
  assert.equal(material.status, "ready");
  const file = join(options.dataDir, "images", material.src.split("/").at(-1));
  const bytes = await readFile(file);
  assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(bytes.readUInt32BE(16), 1024);
  assert.equal(bytes.readUInt32BE(20), 1024);
  assert.equal(result.previews[1].mode, "picture_speak");
  assert.equal(result.previews[1].elements[0].src, material.src);
  result = await plans.build(
    "objects",
    { expectedRevision: 1, expectedTopicRevision: 1, plan },
    true,
  );
  assert.equal(calls, 1);
  assert.equal(store.mastery("objects").length, 0);
  console.log(
    "PASS real pre-class image generation, 1024x1024 PNG, preview, cache reuse, and zero learning records.",
  );
  console.log("Verified image:", file);
} finally {
  await plans.shutdown();
  store.close();
}
