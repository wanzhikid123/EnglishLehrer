// Opt-in real API smoke test. Synthetic silent microphone; isolated learning database.
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
const repeatTest = process.argv.includes("--repeat");
const base = "http://127.0.0.1:3212";
mkdirSync(".cache", { recursive: true });
const service = spawn(process.execPath, ["server/index.js"], {
  env: {
    ...process.env,
    ENGLISH_PORT: "3212",
    ENGLISH_DATA_DIR: resolve(".cache/live-smoke-data", String(Date.now())),
  },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
service.stdout.on("data", (d) => process.stdout.write(d));
service.stderr.on("data", (d) => process.stderr.write(d));
let browser;
try {
  for (let i = 0; i < 40; i++) {
    try {
      if ((await fetch(base + "/api/health")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  browser = await chromium.launch({
    headless: true,
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
  const context = await browser.newContext({
    permissions: ["microphone"],
    viewport: { width: 1440, height: 1050 },
  });
  await context.addInitScript(() => {
    const context = new AudioContext();
    const destination = context.createMediaStreamDestination();
    const oscillator = context.createOscillator();
    const quiet = context.createGain();
    oscillator.frequency.value = 80;
    quiet.gain.value = 0.003;
    oscillator.connect(quiet).connect(destination);
    // Keep the synthetic capture graph producing frames between prerecorded phrases.
    oscillator.start();
    window.__rtc = [];
    const NativeRTC = window.RTCPeerConnection;
    window.RTCPeerConnection = class extends NativeRTC {
      constructor(...args) {
        super(...args);
        window.__rtc.push(this);
      }
    };
    navigator.mediaDevices.getUserMedia = async () => {
      await context.resume();
      return destination.stream;
    };
    window.__testSpeak = async (name) => {
      const response = await fetch("/test-audio/" + name + ".wav");
      const source = context.createBufferSource();
      source.buffer = await context.decodeAudioData(
        await response.arrayBuffer(),
      );
      source.connect(destination);
      await context.resume();
      await new Promise((resolve) => {
        source.onended = resolve;
        source.start();
      });
    };
  });
  const page = await context.newPage();
  await page.route("**/test-audio/*.wav", (route) =>
    route.fulfill({
      contentType: "audio/wav",
      body: readFileSync(
        resolve(
          ".cache/test-speech",
          new URL(route.request().url()).pathname.split("/").at(-1),
        ),
      ),
    }),
  );
  page.on("pageerror", (e) => console.log("BROWSER ERROR:", e.message));
  page.on("console", (msg) => {
    if (msg.type() === "error")
      console.log("BROWSER CONSOLE:", msg.text().slice(0, 400));
  });
  page.on("response", async (r) => {
    if (r.url().startsWith(base + "/api") && r.status() >= 400)
      console.log(
        "HTTP ERROR:",
        r.status(),
        new URL(r.url()).pathname,
        (await r.text()).slice(0, 400),
      );
  });
  await page.goto(base);
  await page
    .getByRole("heading", { name: "Hallo, schön, dass du da bist!" })
    .waitFor();
  await page.screenshot({ path: ".cache/home-desktop.png", fullPage: true });
  const home = await (await fetch(base + "/api/home")).json();
  if (home.pending) {
    await page.getByRole("button", { name: "Stunde öffnen" }).click();
    await page
      .getByRole("button", { name: /Erneut verbinden|Mit Mia sprechen/ })
      .click();
  } else {
    await page
      .getByRole("button", {
        name: repeatTest ? /Eine neue Woche/ : /Die Welt ist bunt/,
      })
      .first()
      .click();
    await page
      .getByRole("button", { name: "Mikrofon an & Stunde starten" })
      .click();
  }
  await page
    .getByText("Verbunden", { exact: true })
    .waitFor({ timeout: 60000 });
  console.log("PASS: Real Live WebRTC connected.");
  await page.locator(".board-element").first().waitFor({ timeout: 90000 });
  console.log("PASS: Real Terra teaching tool updated the board.");
  await page.locator(".speech.teacher").first().waitFor({ timeout: 30000 });
  console.log("PASS: Real teacher transcript received.");
  await page.getByRole("slider", { name: /Sprechtempo/ }).fill("4");
  await page
    .locator(".speech-tempo small")
    .filter({ hasText: "Ab dem nächsten Satz" })
    .waitFor({ timeout: 20000 });
  console.log(
    "PASS: Live acknowledged the speech tempo instruction without reconnecting.",
  );
  await page.screenshot({ path: ".cache/classroom-live.png", fullPage: true });
  const state = await (await fetch(base + "/api/home")).json();
  const active = state.history.find((l) => l.status === "active");
  console.log("Lesson ID:", active?.id);
  console.log(
    "Displayed text:",
    (await page.locator(".board-main").innerText()).slice(0, 250),
  );
  console.log(
    "Teacher transcript:",
    (await page.locator(".transcript").innerText()).slice(0, 350),
  );
  if (repeatTest) {
    await page
      .getByText("Monday", { exact: true })
      .first()
      .waitFor({ timeout: 30000 });
    await page.evaluate(() => window.__testSpeak("monday"));
    await page
      .locator(".speech.child")
      .filter({ hasText: /Monday|Montag/i })
      .first()
      .waitFor({ timeout: 20000 });
    await page
      .getByText("Tuesday", { exact: true })
      .first()
      .waitFor({ timeout: 45000 });
    await page
      .locator(".speech.teacher")
      .filter({ hasText: /Tuesday|Dienstag/i })
      .first()
      .waitFor({ timeout: 20000 });
    const detail = await (
      await fetch(base + "/api/lessons/" + active.id)
    ).json();
    if (
      !detail.results.taught.some(
        (item) => item.text.toLowerCase() === "tuesday",
      )
    )
      throw new Error("The next weekday was not recorded as taught.");
    console.log(
      "PASS: Real spoken Monday led to the next weekday on the board and in teacher speech.",
    );
    await page.screenshot({
      path: ".cache/monday-continuation-live.png",
      fullPage: true,
    });
  }
  if (process.argv.includes("--conversation")) {
    await page.evaluate(() => window.__testSpeak("question"));
    await page
      .locator(".quiz-options button")
      .first()
      .waitFor({ timeout: 90000 });
    console.log("PASS: Synthetic German speech produced a real quiz.");
    const getLesson = async () =>
      (await fetch(base + "/api/lessons/" + active.id)).json();
    let detail = await getLesson();
    const question = detail.results.questions.find(
      (q) => q.id === detail.state.question.id,
    );
    const wrong = question.options.find(
      (o) => o.id !== question.correctOptionId,
    );
    await page
      .getByRole("button", { name: new RegExp(wrong.label, "i") })
      .last()
      .click();
    detail = await getLesson();
    if (
      detail.results.attempts.filter((a) => a.outcome === "incorrect")
        .length !== 1
    )
      throw new Error("Wrong click was not saved once.");
    console.log("PASS: Real quiz click saved one incorrect attempt.");
    const correct = question.options.find(
      (o) => o.id === question.correctOptionId,
    );
    const speech = correct.label.toLowerCase().replace(/[^a-z]/g, "");
    if (!["red", "blue", "yellow", "green"].includes(speech))
      throw new Error(
        "Optional speech test only has the four color audio fixtures.",
      );
    await page.evaluate((name) => window.__testSpeak(name), speech);
    for (let i = 0; i < 60; i++) {
      detail = await getLesson();
      if (
        detail.results.attempts.some(
          (a) =>
            a.question_id === question.id &&
            a.outcome === "correct" &&
            a.mode === "voice",
        )
      )
        break;
      if (i === 59) throw new Error("No correct spoken attempt arrived.");
      await new Promise((r) => setTimeout(r, 1000));
    }
    await page.screenshot({ path: ".cache/quiz-live.png", fullPage: true });
    console.log("PASS: Real spoken answer evaluated and persisted by Terra.");
  }
  await page.getByRole("button", { name: "Beenden", exact: true }).click();
  await page
    .getByRole("heading", { name: "Deine Entdeckungen sind gespeichert." })
    .waitFor({ timeout: 20000 });
  console.log("PASS: Early ending saved and microphone released.");
  await page.screenshot({ path: ".cache/summary-live.png", fullPage: true });
} catch (e) {
  console.error("SMOKE FAILED:", e.message);
  if (browser) {
    const pages = browser.contexts()[0]?.pages();
    if (pages?.[0]) {
      console.log((await pages[0].locator("body").innerText()).slice(-2200));
      await pages[0].screenshot({
        path: ".cache/smoke-failure.png",
        fullPage: true,
      });
    }
  }
  process.exitCode = 1;
} finally {
  try {
    const state = await (await fetch(base + "/api/home")).json();
    for (const l of state.history.filter((l) => l.status === "active"))
      await fetch(base + "/api/lessons/" + l.id + "/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "interrupted" }),
      });
    await new Promise((resolve) => setTimeout(resolve, 3000));
  } catch {}
  await browser?.close();
  service.kill();
}
