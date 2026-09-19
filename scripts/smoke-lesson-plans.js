// Real Responses API; isolated in-memory learning data. No microphone or real learner records.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { config } from "../server/config.js";
import { OpenAIService } from "../server/openai.js";
import { Store } from "../server/store.js";
import { LessonPlans } from "../server/lesson-plans.js";
import { Classroom } from "../server/classroom.js";

const smokeConfig = { ...config, dataDir: resolve(".cache/plan-smoke") };
const store = new Store(":memory:");
const ai = new OpenAIService(smokeConfig);
const plans = new LessonPlans(store, ai, smokeConfig);
try {
  const before = performance.now();
  const data = await plans.build("animals", {
    expectedTopicRevision: 1,
    expectedRevision: 0,
  });
  assert.ok(data.plan.steps.length > 2);
  assert.equal(store.mastery("animals").length, 0);
  console.log(
    `PASS real plan: ${data.plan.steps.length} steps, ${Math.round(performance.now() - before)} ms; no learning records created.`,
  );
  const l = store.create("animals", "smoke-start", plans.snapshot("animals"));
  store.connect(l.id, "isolated-test");
  const classroom = new Classroom(store, ai, smokeConfig);
  classroom.waitRendered = async () => {};
  const room = classroom.room(l.id);
  room.ready = true;
  await classroom.prepared.present(l.id, room.controller.signal);
  let q = store.lesson(l.id).state.question;
  const answer = {
    role: "child",
    text: q.knowledge,
    questionId: q.id,
    receivedAt: store.now(),
    answerToken: randomUUID(),
  };
  const started = performance.now();
  await classroom.prepared.run({
    id: l.id,
    trigger: "Das Kind hat das Zielwort nachgesprochen.",
    transcripts: [answer],
    latestChild: answer,
    signal: room.controller.signal,
    inputVersion: room.inputVersion,
  });
  assert.equal(store.results(l.id).attempts.length, 1);
  assert.equal(store.results(l.id).attempts[0].outcome, "correct");
  assert.equal(store.lesson(l.id).state.planCursor, 2);
  console.log(
    `PASS real assessment → prepared next step: ${Math.round(performance.now() - started)} ms; one saved repetition; no independent mastery claim.`,
  );
  q = store.lesson(l.id).state.question;
  const wish = {
    role: "child",
    text: "Ich möchte jetzt ein Auswahlspiel machen.",
    questionId: q.id,
    receivedAt: store.now(),
    answerToken: randomUUID(),
  };
  const result = await classroom.prepared.run({
    id: l.id,
    trigger: "Neuer Unterrichtswunsch",
    transcripts: [wish],
    latestChild: wish,
    signal: room.controller.signal,
    inputVersion: room.inputVersion,
  });
  assert.equal(result, null);
  assert.equal(store.results(l.id).attempts.length, 1);
  console.log(
    "PASS explicit exercise request returns to flexible planning without scoring or skipping.",
  );
} finally {
  await plans.shutdown();
  store.close();
}
