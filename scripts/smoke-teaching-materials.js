// Real backend API, isolated in-memory lessons. No live microphone or production data.
import assert from "node:assert/strict";
import { config } from "../server/config.js";
import { OpenAIService } from "../server/openai.js";
import { Store } from "../server/store.js";
import { Classroom } from "../server/classroom.js";
import { runTeacher } from "../server/teacher.js";

const ai = new OpenAIService(config);
for (const [word, german, mode] of [
  ["bus", "Bus", "repeat"],
  ["train", "Zug", "german_choice"],
  ["sofa", "Sofa", "picture_speak"],
  ["bus", "Bus", "german_speak"],
]) {
  const store = new Store(":memory:");
  try {
    const lesson = store.create("objects", `smoke-${mode}`);
    lesson.state.topicSnapshot.words = ["bus", "train", "sofa"];
    store.saveState(lesson.id, lesson.state);
    store.connect(lesson.id, "test-only");
    store.updateBoard(lesson.id, "introduced", {
      expectedRevision: 0,
      stepId: "introduced",
      title: "Wiederholen",
      operations: [],
      question: null,
      taught: ["bus", "train", "sofa"].map((text) => ({ text, kind: "word" })),
    });
    const classroom = new Classroom(store, ai, config);
    classroom.waitRendered = async () => {};
    const signal = AbortSignal.timeout(90000);
    const text = await runTeacher({
      store,
      ai,
      id: lesson.id,
      transcripts: [],
      signal,
      trigger: `Das Kind kennt bus, train und sofa bereits. Es möchte jetzt genau eine Übung im Modus ${mode} mit ${word} (Deutsch: ${german}). Benutze show_practice. Keine Begrüßung.`,
      execute: (...args) => classroom.execute(lesson.id, ...args, null, signal),
    });
    const state = store.lesson(lesson.id).state;
    assert.equal(state.question?.mode, mode);
    if (["repeat", "picture_speak"].includes(mode))
      assert.ok(state.elements.some((e) => e.type === "emoji" && e.src));
    assert.ok(!state.elements.some((e) => e.type === "shape"));
    if (mode === "picture_speak")
      assert.ok(
        !state.elements.some((e) => e.type === "text" && /sofa/i.test(e.text)),
      );
    console.log(
      `PASS: ${word}, ${mode}, local emoji/answer visibility. Teacher cue: ${text.slice(0, 260)}`,
    );
  } finally {
    store.close();
  }
}
