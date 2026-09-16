import test from "node:test";
import assert from "node:assert/strict";
import { Store } from "../server/store.js";
import { Classroom } from "../server/classroom.js";

test("repeating Monday followed by Klasse still asks the planner for a next step", (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 100000 });
  const { classroom, id } = setup(t, {});
  classroom.room(id).ready = true;
  const turns = [];
  classroom.enqueue = (_id, trigger) => turns.push(trigger);
  classroom.onEvent(id, {
    type: "session.input_transcript.delta",
    event_id: "monday",
    start_ms: 1000,
    end_ms: 1600,
    delta: "Monday",
  });
  classroom.onEvent(id, {
    type: "session.output_transcript.delta",
    event_id: "klasse",
    start_ms: 1700,
    end_ms: 2200,
    delta: "Klasse!",
  });
  t.mock.timers.tick(5000);
  assert.equal(
    turns.length,
    1,
    "A spoken repetition without a quiz must not leave the planner idle",
  );
});

test("a Live delegation for a spoken repetition suppresses the duplicate fallback", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 100000 });
  let calls = 0;
  const { classroom, id } = setup(t, {
    responses: async () => {
      calls++;
      return {
        output: [
          {
            type: "message",
            content: [
              { type: "output_text", text: "Prima. Jetzt üben wir Tuesday." },
            ],
          },
        ],
      };
    },
  });
  classroom.room(id).ready = true;
  const sent = [];
  classroom.send = async (_id, _type, content) => sent.push(content);
  classroom.onEvent(id, {
    type: "session.input_transcript.delta",
    event_id: "word",
    delta: "Monday",
    start_ms: 100,
    end_ms: 500,
  });
  classroom.onEvent(id, {
    type: "session.delegation.created",
    delegation: { id: "delegation", target: "client" },
  });
  await classroom.room(id).queue;
  t.mock.timers.tick(5000);
  await classroom.room(id).queue;
  assert.equal(calls, 1);
  assert.equal(sent.length, 1);
});

test("backend can erase the old board and show a new step without erasing learning records", async (t) => {
  const { classroom, store, id } = setup(t, {});
  classroom.waitRendered = async () => {};
  await classroom.execute(
    id,
    "patch_board",
    {
      expectedRevision: 1,
      stepId: "clean-board",
      title: "Tuesday",
      operations: [{ action: "clear", id: null, element: null }],
      question: null,
      taught: [{ text: "Tuesday", kind: "word" }],
    },
    "clear-test",
    null,
    new AbortController().signal,
  );
  assert.deepEqual(store.lesson(id).state.elements, []);
  assert.equal(store.lesson(id).state.title, "Tuesday");
  assert.deepEqual(
    store
      .results(id)
      .taught.map((word) => word.text)
      .sort(),
    ["Tuesday", "cat"],
  );
});

async function connectedSetup(t) {
  t.mock.timers.enable({
    apis: ["Date", "setInterval", "setTimeout"],
    now: 100000,
  });
  const closed = [];
  const env = setup(t, {
    closeLive: async (remoteId) => closed.push(remoteId),
    responses: async () => {
      throw new Error("Waiting must not call a model");
    },
  });
  const sent = [],
    events = [];
  env.classroom.send = async (_id, type, content) =>
    sent.push({ type, content });
  env.classroom.emit = (_id, type, data) => events.push({ type, data });
  env.classroom.enqueue = () => {};
  const room = env.classroom.room(env.id);
  room.remoteId = "live-test";
  await env.classroom.ready(env.id);
  sent.length = 0;
  events.length = 0;
  return { ...env, room, sent, events, closed };
}

test("silence while the backend works never prompts for presence or closes the lesson", async (t) => {
  const { classroom, store, id, room, sent, events, closed } =
    await connectedSetup(t);
  room.busy = 1;
  for (let second = 1; second <= 120; second++) {
    classroom.heartbeat(id);
    t.mock.timers.tick(1000);
    await Promise.resolve();
  }
  assert.deepEqual(sent, [], "Waiting must not inject spoken reminders");
  assert.equal(
    events.some((event) => event.type === "inactivity"),
    false,
  );
  assert.equal(store.lesson(id).status, "active");
  assert.deepEqual(closed, []);
  assert.equal(room.controller.signal.aborted, false);
  assert.equal(store.results(id).taught[0].text, "cat");
});

test("a real disconnect still releases the session and preserves lesson progress", async (t) => {
  const { classroom, store, id, room, closed } = await connectedSetup(t);
  await classroom.disconnect(id);
  assert.equal(store.lesson(id).status, "interrupted");
  assert.deepEqual(closed, ["live-test"]);
  assert.equal(room.controller.signal.aborted, true);
  assert.equal(store.results(id).taught[0].text, "cat");
});

function setup(t, ai) {
  const store = new Store(":memory:");
  t.after(() => store.close());
  const l = store.create("animals", "start");
  store.connect(l.id, "live-test");
  const classroom = new Classroom(store, ai, {
    imageModel: "test",
    dataDir: ".cache/test",
  });
  const element = {
    id: "animal",
    type: "image",
    text: "cat",
    translation: "Katze",
    shape: "none",
    color: "#335544",
    x: 10,
    y: 10,
    width: 80,
    height: 70,
    fontSize: 40,
    highlight: false,
  };
  store.updateBoard(l.id, "board", {
    expectedRevision: 0,
    stepId: "cat-step",
    title: "cat",
    operations: [{ action: "upsert", id: "animal", element }],
    question: null,
    taught: [{ text: "cat", kind: "word" }],
  });
  return {
    store,
    classroom,
    id: l.id,
    args: {
      expectedRevision: 1,
      stepId: "cat-step",
      elementId: "animal",
      prompt: "A friendly cat.",
    },
  };
}
test("late image is cached but never overwrites a newer teaching step", async (t) => {
  let deliver;
  const ai = { image: () => new Promise((r) => (deliver = r)) };
  const { store, classroom, id, args } = setup(t, ai);
  assert.equal(
    (await classroom.generateImage(id, args, new AbortController().signal))
      .status,
    "loading",
  );
  store.updateBoard(id, "next", {
    expectedRevision: 1,
    stepId: "dog-step",
    title: "dog",
    operations: [{ action: "clear", id: null, element: null }],
    question: null,
    taught: [],
  });
  deliver({ hash: "hash", path: "/assets/teaching/hash.png" });
  await new Promise((r) => setImmediate(r));
  assert.equal(store.lesson(id).state.title, "dog");
  assert.equal(store.lesson(id).state.elements.length, 0);
  assert.equal(store.db.prepare("SELECT COUNT(*) n FROM images").get().n, 1);
});
test("image failure leaves current learning content and permits further teaching", async (t) => {
  const { store, classroom, id, args } = setup(t, {
    image: async () => {
      throw new Error("offline");
    },
  });
  await classroom.generateImage(id, args, new AbortController().signal);
  await new Promise((r) => setImmediate(r));
  assert.equal(store.lesson(id).state.elements[0].imageStatus, "failed");
  assert.equal(store.results(id).taught.length, 1);
  assert.equal(store.lesson(id).status, "active");
});
test("summary failure cannot roll back a completed lesson or learned words", async (t) => {
  const { store, classroom, id } = setup(t, {
    closeLive: async () => {},
    responses: async () => {
      throw new Error("offline");
    },
  });
  store.requestFinish(id, "completed");
  await classroom.end(id, "completed");
  await classroom.room(id).ending;
  assert.equal(store.lesson(id).status, "completed");
  assert.equal(store.lesson(id).summary_status, "failed");
  assert.equal(store.results(id).taught[0].text, "cat");
});
test("an explicit end during remote-disconnect cleanup is not lost", async (t) => {
  let release;
  const { store, classroom, id } = setup(t, {
    closeLive: () => new Promise((r) => (release = r)),
    responses: async () => {
      throw new Error("offline");
    },
  });
  await classroom.end(id, "interrupted");
  const pending = classroom.end(id, "ended_early");
  release();
  await new Promise((r) => setImmediate(r));
  await pending;
  release();
  await classroom.room(id).ending;
  assert.equal(store.lesson(id).status, "ended_early");
  assert.equal(store.results(id).taught.length, 1);
});

test("an answer spanning a board change stays bound to its original question", (t) => {
  const { store, classroom, id } = setup(t, {});
  const makeQuestion = (id) => ({
    id,
    prompt: "Pick red",
    knowledge: "red",
    options: [
      { id: "a", label: "red", aliases: ["rot"], color: "#ff0000", emoji: "" },
      {
        id: "b",
        label: "blue",
        aliases: ["blau"],
        color: "#0000ff",
        emoji: "",
      },
    ],
    correctOptionId: "a",
    hint: "rot",
  });
  const step = (revision, qid) => ({
    expectedRevision: revision,
    stepId: qid,
    title: "Colors",
    operations: [],
    question: makeQuestion(qid),
    taught: [],
  });
  store.updateBoard(id, "step-q1", step(1, "q1"));
  classroom.onEvent(id, {
    type: "session.input_transcript.delta",
    event_id: "fragment1",
    start_ms: 100,
    end_ms: 200,
    delta: "r",
  });
  store.updateBoard(id, "step-q2", step(2, "q2"));
  classroom.onEvent(id, {
    type: "session.input_transcript.delta",
    event_id: "fragment2",
    start_ms: 200,
    end_ms: 350,
    delta: "ed",
  });
  assert.equal(classroom.room(id).transcripts.at(-1).questionId, "q1");
  assert.equal(store.results(id).attempts.length, 0);
});

test("a clear short answer prompts backend review but never scores directly from captions", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { store, classroom, id } = setup(t, {});
  const room = classroom.room(id);
  room.ready = true;
  const q = {
    id: "q1",
    prompt: "Pick red",
    knowledge: "red",
    options: [
      { id: "a", label: "red", aliases: ["rot"], color: "#ff0000", emoji: "" },
      {
        id: "b",
        label: "blue",
        aliases: ["blau"],
        color: "#0000ff",
        emoji: "",
      },
    ],
    correctOptionId: "a",
    hint: "rot",
  };
  store.updateBoard(id, "step-q1", {
    expectedRevision: 1,
    stepId: "q1",
    title: "Colors",
    operations: [],
    question: q,
    taught: [],
  });
  const reviews = [];
  classroom.enqueue = (_id, trigger) => reviews.push(trigger);
  classroom.onEvent(id, {
    type: "session.input_transcript.delta",
    event_id: "fragment1",
    start_ms: 100,
    end_ms: 200,
    delta: "rot",
  });
  t.mock.timers.tick(1700);
  assert.equal(reviews.length, 1);
  assert.equal(store.results(id).attempts.length, 0);
});
