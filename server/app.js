import express from "express";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { z } from "zod";
import { AppError } from "./store.js";
import { answerSchema, eventIdSchema } from "../shared/contracts.js";
import { root } from "./config.js";
import { transcriptionRouter } from "./transcription.js";

export function createApp({ store, classroom, config, preparation, ai }) {
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    const hostname = req.hostname;
    if (!["localhost", "127.0.0.1", "[::1]"].includes(hostname))
      return res
        .status(403)
        .json({ error: "Nur auf diesem Computer verfügbar." });
    const origin = req.headers.origin;
    if (
      origin &&
      ![
        `http://127.0.0.1:${config.port}`,
        `http://localhost:${config.port}`,
      ].includes(origin)
    )
      return res
        .status(403)
        .json({ error: "Diese Anfrage ist nicht erlaubt." });
    if (req.headers["sec-fetch-site"] === "cross-site")
      return res
        .status(403)
        .json({ error: "Diese Anfrage ist nicht erlaubt." });
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Permissions-Policy": "microphone=(self), camera=()",
      "X-Frame-Options": "DENY",
    });
    res.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; media-src 'self' blob:; frame-ancestors 'none'",
    );
    if (req.path.startsWith("/api")) res.set("Cache-Control", "no-store");
    next();
  });
  app.use(
    express.json({ limit: "96kb", type: ["application/json", "text/plain"] }),
  );
  app.get("/api/health", (_req, res) =>
    res.json({
      ok: true,
      app: "EnglishLehrer",
      keyConfigured: Boolean(config.apiKey),
      models: {
        live: config.liveModel,
        teacher: config.teacherModel,
        image: config.imageModel,
        transcription: config.transcriptionModel,
      },
      voice: config.voice,
    }),
  );
  app.get("/api/home", (_req, res) => res.json(store.home()));
  app.get("/api/preparation", (_req, res) => res.json(preparation.state()));
  app.use("/api/preparation/transcribe", transcriptionRouter(ai));
  app.post("/api/preparation/chat", async (req, res) =>
    res.json(await preparation.chat(req.body)),
  );
  app.post("/api/preparation/clear", (req, res) =>
    res.json(preparation.clear(req.body)),
  );
  app.post("/api/topics/:id/delete", (req, res) =>
    res.json(preparation.deleteTopic(req.params.id, req.body)),
  );
  app.post("/api/lessons", (req, res) => {
    const data = z
      .object({ topicId: z.string(), eventId: eventIdSchema })
      .parse(req.body);
    const lesson = store.create(data.topicId, data.eventId);
    res.status(201).json(store.publicLesson(lesson.id));
  });
  app.get("/api/lessons/:id", (req, res) =>
    res.json(store.publicLesson(req.params.id)),
  );
  app.get("/api/lessons/:id/events", (req, res) => {
    store.lesson(req.params.id);
    res.set({ "Content-Type": "text/event-stream", Connection: "keep-alive" });
    res.flushHeaders();
    classroom.subscribe(req.params.id, res);
    const keepalive = setInterval(() => res.write(": keepalive\n\n"), 15000);
    req.on("close", () => clearInterval(keepalive));
  });
  app.post("/api/lessons/:id/connect", async (req, res) => {
    const { sdp } = z
      .object({ sdp: z.string().min(20).max(80000) })
      .parse(req.body);
    res.json(await classroom.connect(req.params.id, sdp));
  });
  app.post("/api/lessons/:id/ready", async (req, res) => {
    await classroom.ready(req.params.id);
    res.json({ ok: true });
  });
  app.post("/api/lessons/:id/rendered", (req, res) => {
    const { revision } = z
      .object({ revision: z.number().int().min(0) })
      .parse(req.body);
    classroom.rendered(req.params.id, revision);
    res.json({ ok: true });
  });
  app.post("/api/lessons/:id/heartbeat", (req, res) =>
    res.json(classroom.heartbeat(req.params.id)),
  );
  app.post("/api/lessons/:id/answer", (req, res) => {
    const answer = answerSchema.parse(req.body);
    if (answer.mode !== "click" || answer.uncertain || answer.hinted)
      throw new AppError("Ungültige Klickantwort.");
    res.json(classroom.click(req.params.id, answer));
  });
  app.post("/api/lessons/:id/hint", (req, res) => {
    const { questionId } = z
      .object({ questionId: z.string().max(100) })
      .parse(req.body);
    const result = store.hint(req.params.id, questionId);
    classroom.publish(req.params.id);
    classroom
      .send(
        req.params.id,
        "session.commentary.append",
        `Gib dem Kind diesen Hinweis zur aktuellen Frage: ${result.hint}`,
        null,
      )
      .catch(() => {});
    res.json(result);
  });
  app.post("/api/lessons/:id/retry", (req, res) => {
    store.active(req.params.id);
    classroom.enqueue(
      req.params.id,
      "Das Kind bittet um Fortsetzung. Prüfe aktuellen Stand, wiederhole bei Bedarf, zähle keine alten Antworten erneut.",
    );
    res.json({ ok: true });
  });
  app.post("/api/lessons/:id/end", async (req, res) => {
    const { status } = z
      .object({ status: z.enum(["completed", "ended_early", "interrupted"]) })
      .parse(req.body);
    await classroom.end(req.params.id, status);
    res.json(store.publicLesson(req.params.id));
  });
  app.use(
    "/assets/teaching",
    express.static(join(config.dataDir, "images"), {
      index: false,
      immutable: true,
      maxAge: "1y",
    }),
  );
  if (existsSync(join(root, "dist")))
    app.use(express.static(join(root, "dist")));
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Diese Funktion wurde nicht gefunden." }),
  );
  app.get("/{*path}", (_req, res) => {
    if (existsSync(join(root, "dist/index.html")))
      res.sendFile(join(root, "dist/index.html"));
    else
      res
        .status(503)
        .type("text")
        .send("Bitte zuerst npm run build ausführen.");
  });
  app.use((err, _req, res, _next) => {
    const status = err instanceof z.ZodError ? 400 : err.status || 500;
    res.status(status).json({
      error:
        err instanceof z.ZodError
          ? "Die Eingabe ist unvollständig oder ungültig."
          : err instanceof AppError
            ? err.message
            : "Etwas hat nicht geklappt. Deine gespeicherten Ergebnisse bleiben erhalten.",
    });
  });
  return app;
}
