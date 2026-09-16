import test from "node:test";
import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { Store } from "../server/store.js";
import { createApp } from "../server/app.js";

test("local HTTP API initializes history, enforces origins and never returns the long-lived key", async (t) => {
  const store = new Store(":memory:");
  const config = {
    port: 3210,
    apiKey: "secret-test-value",
    dataDir: ".cache/test-data",
    liveModel: "live-test",
    teacherModel: "teacher-test",
    imageModel: "image-test",
  };
  const app = createApp({ store, classroom: {}, config });
  const server = createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => {
    server.closeAllConnections();
    server.close();
    store.close();
  });
  const base = "http://127.0.0.1:" + server.address().port;
  const health = await (await fetch(base + "/api/health")).json();
  assert.equal(health.keyConfigured, true);
  assert.doesNotMatch(JSON.stringify(health), /secret-test-value/);
  const origin = await fetch(base + "/api/lessons", {
    method: "POST",
    headers: {
      Origin: "https://evil.example",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ topicId: "colors", eventId: "start" }),
  });
  assert.equal(origin.status, 403);
  const hostStatus = await new Promise((resolve) => {
    const req = request(
      base + "/api/home",
      { headers: { Host: "evil.example" } },
      (res) => {
        res.resume();
        resolve(res.statusCode);
      },
    );
    req.end();
  });
  assert.equal(hostStatus, 403);
  const create = await fetch(base + "/api/lessons", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topicId: "colors", eventId: "start" }),
  });
  assert.equal(create.status, 201);
  const lesson = await create.json();
  assert.equal(lesson.topic_id, "colors");
  assert.equal(lesson.remote_id, undefined);
  const home = await (await fetch(base + "/api/home")).json();
  assert.equal(home.history.length, 1);
  assert.equal(home.topics.length, 7);
  const broken = await fetch(base + "/api/lessons", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(broken.status, 400);
});
