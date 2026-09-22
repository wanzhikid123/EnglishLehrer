import { Store } from "../server/store.js";
import { createApp } from "../server/app.js";
import { Preparation } from "../server/preparation.js";
import { practiceBoard } from "../server/practice.js";
import { Classroom } from "../server/classroom.js";
import { topics } from "../shared/topics.js";
const store = new Store(":memory:");
const config = {
  port: 3213,
  apiKey: "fixture-only-not-a-real-key",
  dataDir: ".cache/browser-data",
  liveModel: "gpt-live-1",
  teacherModel: "gpt-5.6-terra",
  transcriptionModel: "gpt-transcribe",
  voice: "marin",
};
const clients = new Set();
const classroom = {
  deleteResults(id) {
    return store.deleteLesson(id);
  },
  async connect(id) {
    store.connect(id, "fixture-remote");
    this.publish(id);
    return { sdp: "fixture-answer" };
  },
  async ready() {},
  async setSpeechTempo(id, tempo) {
    const lesson = store.lesson(id);
    lesson.state.speechTempo = tempo;
    store.saveState(id, lesson.state);
    return { ok: true, tempo };
  },
  heartbeat(id) {
    return store.heartbeat(id);
  },
  emit(type, data) {
    for (const res of clients)
      res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
  },
  publish(id) {
    this.emit("lesson", store.publicLesson(id));
  },
  subscribe(id, res) {
    clients.add(res);
    res.write(
      "event: lesson\ndata: " + JSON.stringify(store.publicLesson(id)) + "\n\n",
    );
    res.on("close", () => clients.delete(res));
  },
  rendered() {},
  async end(id, status) {
    const lesson = store.finish(id, status);
    this.publish(id);
    return lesson;
  },
};
const l = store.create("colors", "fixture-course");
store.connect(l.id, "fixture-remote");
store.updateBoard(l.id, "fixture-board", {
  expectedRevision: 0,
  stepId: "red",
  title: "Red · Rot",
  operations: [
    {
      action: "upsert",
      id: "ball",
      element: {
        id: "ball",
        type: "shape",
        shape: "circle",
        color: "#ed5c54",
        text: "red ball",
        translation: "",
        x: 35,
        y: 5,
        width: 30,
        height: 45,
        fontSize: 50,
        highlight: false,
      },
    },
    {
      action: "upsert",
      id: "label",
      element: {
        id: "label",
        type: "text",
        shape: "none",
        color: "#354f3c",
        text: "red",
        translation: "rot",
        x: 10,
        y: 55,
        width: 80,
        height: 35,
        fontSize: 70,
        highlight: false,
      },
    },
  ],
  question: {
    id: "pick-red",
    prompt: "Welcher Ball ist red?",
    knowledge: "red",
    options: [
      {
        id: "red",
        label: "red",
        color: "#ed5c54",
        emoji: "",
        aliases: ["rot"],
      },
      {
        id: "blue",
        label: "blue",
        color: "#5599dd",
        emoji: "",
        aliases: ["blau"],
      },
    ],
    correctOptionId: "red",
    hint: "Rot wie eine Erdbeere.",
  },
  taught: [{ text: "red", kind: "word" }],
});
store.finish(l.id, "interrupted");
const preparation = new Preparation(store, {
  responses: async (input) => {
    if (input.at(-1).type === "function_call_output")
      return {
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text:
                  JSON.parse(input.at(-1).output).status === "pending"
                    ? "已准备好删除 Hallo, Welt!，请点击下方按钮确认。"
                    : "已保存主题和教学安排。新课堂会使用这些内容。",
              },
            ],
          },
        ],
      };
    if (input.at(-1).content.includes("删除 Hallo"))
      return {
        output: [
          {
            type: "function_call",
            name: "request_topic_deletion",
            call_id: "fixture-delete",
            arguments: JSON.stringify({
              topicId: "greetings",
              expectedRevision: store.topic("greetings").revision,
            }),
          },
        ],
      };
    const isNew = input.at(-1).content.includes("Obst");
    const source = store.topic("colors");
    const topic = isNew
      ? {
          ...source,
          id: "fruit",
          name: "Obst entdecken",
          english: "Fruit",
          icon: "🍎",
          goal: "Lerne leckere Früchte auf Englisch kennen.",
          words: ["apple", "banana"],
          phrases: ["I like apples."],
          teachingNotes: "Obst in kleinen Schritten üben.",
        }
      : {
          ...source,
          words: [...source.words, "purple"],
          teachingNotes: "Auch purple üben.",
        };
    return {
      output: [
        {
          type: "function_call",
          name: "save_topic",
          call_id: "fixture-save",
          arguments: JSON.stringify({
            topic,
            expectedRevision: isNew ? 0 : source.revision,
          }),
        },
      ],
    };
  },
});
const ai = {
  async responses(input) {
    const data = JSON.parse(input[0].content);
    return {
      output: [
        {
          type: "function_call",
          name: "save_lesson_plan",
          arguments: JSON.stringify({
            goal: "Tiere erkennen und selbst benennen.",
            steps: [
              {
                id: "cat",
                stage: "new",
                seconds: 45,
                mode: "repeat",
                word: "cat",
                german: "Katze",
                distractors: [],
              },
              {
                id: "dog",
                stage: "new",
                seconds: 45,
                mode: "repeat",
                word: "dog",
                german: "Hund",
                distractors: [],
              },
              {
                id: "choice",
                stage: "practice",
                seconds: 45,
                mode: "german_choice",
                word: "cat",
                german: "Katze",
                distractors: ["dog"],
              },
              {
                id: "speak",
                stage: "practice",
                seconds: 45,
                mode: "picture_speak",
                word: "dog",
                german: "Hund",
                distractors: [],
              },
            ],
          }),
        },
      ],
    };
  },
  async transcribe(audio, mimeType, language) {
    if (!audio.length || !mimeType.startsWith("audio/"))
      throw new Error("Invalid fixture audio");
    return {
      format: mimeType,
      signature: audio.subarray(0, 4).toString("hex"),
      text:
        language === "de"
          ? "Bitte die Farben wiederholen."
          : "请复习颜色，red und blue。",
    };
  },
};
const app = createApp({ store, classroom, config, preparation, ai });
// Exercise the actual farewell timer through a separate fixture-only classroom.
const farewell = new Classroom(
  store,
  {
    closeLive: async () => {},
    responses: async () => {
      throw new Error("No live API in fixtures");
    },
  },
  config,
);
farewell.publish = (id) => classroom.publish(id);
farewell.emit = (_id, type, data) => classroom.emit(type, data);
classroom.inputActivity = (id, token) => farewell.inputActivity(id, token);
app.post("/fixture/goodbye", (req, res) => {
  const room = farewell.room(l.id);
  room.ready = true;
  room.remoteId = "fixture-remote";
  farewell.onEvent(l.id, {
    type: "session.input_transcript.delta",
    event_id: `farewell-${Date.now()}`,
    delta: "Tschüsschen!",
    start_ms: Date.now(),
    end_ms: Date.now() + 100,
  });
  res.json({ ok: true });
});
app.post("/fixture/result", (_req, res) => {
  for (const row of store.db
    .prepare("SELECT id FROM lessons WHERE status='active'")
    .all())
    store.finish(row.id, "interrupted");
  // The earlier deletion UI tests deliberately remove the full catalog.
  const fixtureTopic = {
    ...topics.find((t) => t.id === "animals"),
    id: "result-fixture",
    name: "Test-Lernergebnisse",
    teachingNotes: "",
    coverage: "small_steps",
  };
  store.db
    .prepare("INSERT OR IGNORE INTO topics VALUES(?,?,1)")
    .run(fixtureTopic.id, JSON.stringify(fixtureTopic));
  const lesson = store.create(fixtureTopic.id, `result-${crypto.randomUUID()}`);
  store.connect(lesson.id, "fixture-result");
  store.updateBoard(
    lesson.id,
    `board-${lesson.id}`,
    practiceBoard(
      {
        expectedRevision: 0,
        mode: "repeat",
        word: "cat",
        german: "Katze",
        distractors: [],
      },
      lesson.topic,
    ),
  );
  store.finish(lesson.id, "ended_early");
  store.setSummary(lesson.id, { message: "Du hast cat geübt." }, "ready");
  res.json(store.publicLesson(lesson.id));
});
// Fixture-only controls exercise the browser's real SSE and media cleanup path.
app.post("/fixture/disconnect", async (req, res) => {
  await classroom.end(l.id, "interrupted");
  res.json({ ok: true });
});
app.post("/fixture/practice", (req, res) => {
  // UI tests share this in-memory server; make the fixture lesson the only resumable one.
  for (const row of store.db
    .prepare(
      "SELECT id FROM lessons WHERE id!=? AND status IN ('active','interrupted')",
    )
    .all(l.id))
    store.finish(row.id, "ended_early");
  const current = store.lesson(l.id);
  store.connect(l.id, "fixture-remote");
  const topic = {
    ...current.topic,
    words: ["bus", "train", "sofa", "striped lunchbox"],
  };
  store.updateBoard(
    l.id,
    `fixture-${Date.now()}`,
    practiceBoard(
      {
        expectedRevision: current.state.revision,
        mode: req.body.mode,
        word: req.body.word || "sofa",
        german: req.body.german || "Sofa",
        distractors: ["train", "bus"],
      },
      topic,
    ),
  );
  classroom.publish(l.id);
  res.json(store.publicLesson(l.id));
});
app.listen(config.port, "127.0.0.1");
