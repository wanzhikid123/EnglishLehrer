// Opt-in real backend test; no production lessons or topics are changed.
import assert from "node:assert/strict";
import { config } from "../server/config.js";
import { Store } from "../server/store.js";
import { OpenAIService } from "../server/openai.js";
import { Preparation } from "../server/preparation.js";
const store = new Store(":memory:");
const preparation = new Preparation(store, new OpenAIService(config));
try {
  if (process.argv.includes("--delete")) {
    const result = await preparation.chat({
      eventId: "real-delete",
      topicId: "greetings",
      lessonId: null,
      message: "请删除现有的 Hallo, Welt! 主题，并让我确认。不要修改其他主题。",
    });
    assert.equal(result.changes.length, 0);
    assert.equal(result.deletionRequests.length, 1);
    assert.equal(result.deletionRequests[0].topicId, "greetings");
    assert.ok(
      store.topic("greetings"),
      "The real model must wait for confirmation",
    );
    preparation.deleteTopic("greetings", {
      expectedRevision: result.deletionRequests[0].expectedRevision,
      turnId: result.eventId,
      confirmed: true,
    });
    assert.equal(store.topic("greetings"), null);
    const cleared = preparation.clear({
      expectedGeneration: 0,
      confirmed: true,
    });
    assert.deepEqual(cleared.turns, []);
    assert.equal(cleared.topics.length, 6);
    console.log(
      "PASS: Real backend requested deletion, waited for confirmation, then cleared the conversation without restoring the topic.",
    );
  } else {
    await preparation.chat({
      eventId: "real-preparation",
      topicId: "days",
      lessonId: null,
      message:
        "请直接保存以下备课修改：1. days 主题要按顺序教完 Monday 到 Sunday 七天，跟读后继续下一天，设为覆盖全部单词；2. colors 保留所有旧词并加上 purple 和 orange；3. 新建 fruits 主题，包括 apple、banana、pear，用德语写标题和学习目标，适合8岁初学者。",
    });
    assert.equal(store.topic("days").coverage, "all");
    assert.equal(store.topic("days").words.length, 7);
    assert.ok(store.topic("days").words.includes("Sunday"));
    for (const word of ["red", "blue", "purple", "orange"])
      assert.ok(store.topic("colors").words.includes(word));
    const fruit = store
      .topics()
      .find((t) => t.words.includes("apple") && t.words.includes("banana"));
    assert.ok(fruit, "a new fruit topic must be stored");
    assert.equal(store.topics().length, 8);
    const lesson = store.create(fruit.id, "new-lesson");
    assert.ok(lesson.topic.words.includes("pear"));
    console.log(
      "PASS: Real backend updated days, expanded colors, created a playable fruit topic and saved all changes.",
    );
  }
} finally {
  await preparation.shutdown();
  store.close();
}
