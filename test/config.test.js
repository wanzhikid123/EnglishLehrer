import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../server/config.js";
import { OpenAIService } from "../server/openai.js";
import { teacherTools } from "../server/teacher.js";

test("thinking effort is read from env, validated, and passed to every Responses call", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "english-effort-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.equal(loadConfig({}, dir).teacherReasoningEffort, "low");
  writeFileSync(join(dir, ".env"), "ENGLISH_TEACHER_REASONING_EFFORT=high\n");
  assert.equal(loadConfig({}, dir).teacherReasoningEffort, "high");
  assert.equal(
    loadConfig({ ENGLISH_TEACHER_REASONING_EFFORT: "medium" }, dir)
      .teacherReasoningEffort,
    "medium",
  );
  assert.throws(
    () => loadConfig({ ENGLISH_TEACHER_REASONING_EFFORT: "typo" }, dir),
    /ENGLISH_TEACHER_REASONING_EFFORT/,
  );
  const service = new OpenAIService(loadConfig({}, dir));
  let payload;
  service.request = async (path, body) => {
    payload = { path, body };
    return {};
  };
  await service.responses([], [], "test");
  assert.equal(payload.path, "/responses");
  assert.deepEqual(payload.body.reasoning, { effort: "high" });
  assert.equal(service.image, undefined);
  assert.equal(
    teacherTools.some((t) => t.name === "generate_image"),
    false,
  );
});
