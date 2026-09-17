import test from "node:test";
import assert from "node:assert/strict";
import { Store } from "../server/store.js";
import { practiceBoard } from "../server/practice.js";
import { Classroom } from "../server/classroom.js";

function setup(t, mode) {
  const store = new Store(":memory:");
  t.after(() => store.close());
  const lesson = store.create("animals", `test-${mode}`);
  store.connect(lesson.id, "test");
  store.updateBoard(
    lesson.id,
    "practice",
    practiceBoard(
      {
        expectedRevision: 0,
        mode,
        word: "cat",
        german: "Katze",
        distractors: ["dog"],
      },
      lesson.topic,
    ),
  );
  return { store, id: lesson.id, q: store.lesson(lesson.id).state.question };
}
test("color exercises preserve precise colored balls, including orange as a color", (t) => {
  const store = new Store(":memory:");
  t.after(() => store.close());
  const lesson = store.create("colors", "color-practice");
  store.connect(lesson.id, "test");
  for (const [index, mode] of ["repeat", "picture_speak"].entries()) {
    store.updateBoard(
      lesson.id,
      `color-${mode}`,
      practiceBoard(
        {
          expectedRevision: index,
          mode,
          word: "red",
          german: "Rot",
          distractors: [],
        },
        lesson.topic,
      ),
    );
    const visual = store.lesson(lesson.id).state.elements[0];
    assert.equal(visual.type, "shape");
    assert.equal(visual.shape, "circle");
    assert.equal(visual.color, "#ed5c54");
  }
  const board = practiceBoard(
    {
      expectedRevision: 2,
      mode: "repeat",
      word: "orange",
      german: "Orange",
      distractors: [],
    },
    { ...lesson.topic, words: ["orange"] },
  );
  assert.equal(board.operations[1].element.type, "shape");
});
for (const mode of [
  "repeat",
  "german_choice",
  "picture_speak",
  "german_speak",
]) {
  test(`${mode} renders appropriate cues and stores a voice answer once`, (t) => {
    const { store, id, q } = setup(t, mode);
    const publicState = store.publicLesson(id).state;
    if (mode !== "german_choice")
      assert.deepEqual(publicState.question.options, []);
    if (mode === "picture_speak") {
      assert.equal(publicState.elements[0].type, "emoji");
      assert.equal(
        publicState.elements.filter((e) => e.type === "text").length,
        0,
      );
      assert.ok(!publicState.title.includes("cat"));
    }
    if (mode === "german_speak")
      assert.equal(publicState.elements[0].text, "Katze");
    const data = {
      eventId: "answer",
      questionId: q.id,
      optionId: q.correctOptionId,
      mode: "voice",
      uncertain: false,
      hinted: false,
    };
    assert.equal(store.answer(id, data).outcome, "correct");
    store.answer(id, data);
    assert.equal(store.results(id).attempts.length, 1);
    assert.equal(store.lesson(id).state.question.status, "answered");
    if (mode === "repeat")
      assert.equal(store.mastery("animals")[0].attemptCount || 0, 0);
  });
}
test("spoken questions reject clicks; uncertainty, wrong words and hinted retry stay distinct", (t) => {
  const { store, id, q } = setup(t, "german_speak");
  const data = {
    questionId: q.id,
    optionId: q.correctOptionId,
    mode: "click",
    uncertain: false,
    hinted: false,
  };
  assert.throws(
    () => store.answer(id, { ...data, eventId: "click" }),
    /mündlich/,
  );
  assert.equal(
    store.answer(id, {
      ...data,
      eventId: "unclear",
      mode: "voice",
      optionId: null,
      uncertain: true,
    }).outcome,
    "uncertain",
  );
  assert.equal(
    store.answer(id, {
      ...data,
      eventId: "wrong",
      mode: "voice",
      optionId: null,
    }).outcome,
    "incorrect",
  );
  assert.equal(store.lesson(id).state.question.status, "open");
  store.hint(id, q.id);
  assert.equal(
    store.answer(id, { ...data, eventId: "retry", mode: "voice" }).hinted,
    true,
  );
  assert.equal(store.results(id).attempts.length, 3);
});
test("a picture exercise cannot be scored while its image is missing", (t) => {
  const { store, id, q } = setup(t, "picture_speak");
  const lesson = store.lesson(id);
  lesson.state.elements = [{ type: "image", imageStatus: "loading" }];
  store.saveState(id, lesson.state);
  assert.equal(
    store.answer(id, {
      eventId: "early",
      questionId: q.id,
      optionId: q.correctOptionId,
      mode: "voice",
      uncertain: false,
      hinted: false,
    }).ignored,
    true,
  );
  assert.equal(store.results(id).attempts.length, 0);
});
test("tempo changes are serialized, acknowledged and persisted without touching the board", async (t) => {
  const { store, id } = setup(t, "repeat");
  const classroom = new Classroom(store, {}, {});
  classroom.room(id).ready = true;
  const sent = [];
  classroom.send = async (_id, type, text) => {
    sent.push({ type, text });
  };
  await Promise.all([
    classroom.setSpeechTempo(id, 4),
    classroom.setSpeechTempo(id, 5),
  ]);
  assert.equal(store.lesson(id).state.speechTempo, 5);
  assert.equal(store.lesson(id).state.revision, 1);
  assert.equal(sent.length, 2);
  assert.equal(sent[0].type, "session.instructions.append");
  classroom.send = async () => {
    throw new Error("rejected");
  };
  await assert.rejects(classroom.setSpeechTempo(id, 1), /rejected/);
  assert.equal(store.lesson(id).state.speechTempo, 5);
  assert.throws(() => classroom.setSpeechTempo(id, 6));
});
