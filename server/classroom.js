import { randomUUID, createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { AppError } from "./store.js";
import { searchEmoji } from "./emoji.js";
import { practiceBoard, isSpokenPractice } from "./practice.js";
import {
  DEFAULT_SPEECH_TEMPO,
  speechTempoInstruction,
} from "../shared/speech.js";
import {
  voiceInstructions,
  runTeacher,
  context,
  generateSummary,
} from "./teacher.js";
import {
  voiceAnswerSchema,
  imageToolSchema,
  hintToolSchema,
  endToolSchema,
  speechTempoSchema,
} from "../shared/contracts.js";

export class Classroom {
  constructor(store, ai, config) {
    this.store = store;
    this.ai = ai;
    this.config = config;
    this.rooms = new Map();
    this.clients = new Map();
  }
  room(id) {
    if (!this.rooms.has(id))
      this.rooms.set(id, {
        id,
        queue: Promise.resolve(),
        controller: new AbortController(),
        transcripts: [],
        seen: new Set(),
        pending: new Map(),
        renderWaiters: [],
        rendered: -1,
        ready: false,
        connecting: false,
        closing: false,
        wrapSent: false,
        busy: 0,
      });
    return this.rooms.get(id);
  }
  subscribe(id, response) {
    this.store.lesson(id);
    if (!this.clients.has(id)) this.clients.set(id, new Set());
    this.clients.get(id).add(response);
    this.emit(id, "lesson", this.store.publicLesson(id), response);
    response.on("close", () => {
      this.clients.get(id)?.delete(response);
    });
  }
  emit(id, type, data, target) {
    const message = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of target ? [target] : this.clients.get(id) || [])
      if (!client.destroyed) client.write(message);
  }
  publish(id) {
    this.emit(id, "lesson", this.store.publicLesson(id));
  }
  async connect(id, sdp, tempo = DEFAULT_SPEECH_TEMPO) {
    speechTempoSchema.parse({ tempo });
    const lesson = this.store.lesson(id);
    const room = this.room(id);
    if (!["active", "interrupted"].includes(lesson.status))
      throw new AppError("Diese Stunde ist schon beendet.", 409);
    if (room.connecting || room.ready)
      throw new AppError(
        "Diese Stunde ist bereits verbunden. Bitte nutze das geöffnete Unterrichtsfenster.",
        409,
      );
    room.connecting = true;
    try {
      // A replacement connection must wait for the previous session's cleanup.
      if (room.ending) await room.ending;
      if (!["active", "interrupted"].includes(this.store.lesson(id).status))
        throw new AppError("Diese Stunde ist schon beendet.", 409);
      room.closing = false;
      room.controller.abort();
      room.controller = new AbortController();
      room.seen.clear();
      room.transcripts = [];
      room.inputSpan = null;
      room.plannedInput = null;
      clearTimeout(room.answerCheckTimer);
      room.rendered = -1;
      if (room.remoteId) await this.ai.closeLive(room.remoteId, room.socket);
      const result = await this.ai.live(
        sdp,
        voiceInstructions + "\n" + speechTempoInstruction(tempo),
        JSON.stringify(context(this.store, id)),
        room.controller.signal,
      );
      room.remoteId = result.session.id;
      room.socket = await this.ai.attach(
        room.remoteId,
        (e) => this.onEvent(id, e),
        () => {
          if (!room.closing && room.ready) this.disconnect(id).catch(() => {});
        },
      );
      this.store.connect(id, room.remoteId);
      const current = this.store.lesson(id);
      current.state.speechTempo = tempo;
      this.store.saveState(id, current.state);
      this.publish(id);
      return { sdp: result.transport.sdp };
    } catch (e) {
      room.closing = true;
      this.store.finish(id, "interrupted");
      this.publish(id);
      await this.ai.closeLive(room.remoteId, room.socket);
      room.remoteId = null;
      room.socket = null;
      throw e;
    } finally {
      room.connecting = false;
    }
  }
  async ready(id) {
    const room = this.room(id);
    this.store.active(id);
    if (room.ready) return;
    room.ready = true;
    const resume = this.store.lesson(id).state.revision > 0;
    this.send(
      id,
      "session.instructions.append",
      resume
        ? "Sprich Deutsch. Begrüße das Kind kurz zurück. Fahre beim gespeicherten Tafelstand fort, ohne erledigte Antworten erneut zu zählen."
        : "Sprich Deutsch. Begrüße das Kind sofort freundlich als Mia, seine KI-Englischlehrerin. Erkläre kurz, dass wir gemeinsam Englisch entdecken. Warte dann auf den Unterrichtsplaner.",
      null,
    )
      .then(() =>
        this.send(
          id,
          "session.commentary.append",
          "Beginne jetzt das Gespräch gemäß den Anweisungen.",
          null,
        ),
      )
      .catch(() => {});
    this.enqueue(
      id,
      resume
        ? "Verbindung wiederhergestellt: beim gespeicherten Stand fortsetzen."
        : "Stundenbeginn: zeige den ersten altersgerechten Lernschritt und begrüße das Kind.",
    );
  }
  setSpeechTempo(id, tempo) {
    speechTempoSchema.parse({ tempo });
    const room = this.room(id);
    const signal = room.controller.signal;
    room.tempoQueue = (room.tempoQueue || Promise.resolve())
      .catch(() => {})
      .then(async () => {
        this.store.active(id);
        if (!room.ready || signal.aborted)
          throw new AppError(
            "Bitte zuerst die Sprachverbindung herstellen.",
            409,
          );
        if (this.store.lesson(id).state.speechTempo !== tempo) {
          await this.send(
            id,
            "session.instructions.append",
            speechTempoInstruction(tempo),
          );
          if (signal.aborted)
            throw new AppError("Sprachverbindung unterbrochen.", 409);
          const current = this.store.active(id);
          current.state.speechTempo = tempo;
          this.store.saveState(id, current.state);
          this.publish(id);
        }
        return { ok: true, tempo };
      });
    return room.tempoQueue;
  }
  send(id, type, content, delegationId = null) {
    const room = this.room(id);
    if (room.closing || room.socket?.readyState !== 1)
      return Promise.reject(
        new AppError("Sprachverbindung unterbrochen.", 409),
      );
    const eventId = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        room.pending.delete(eventId);
        reject(
          new AppError(
            "Die Sprachsteuerung hat nicht rechtzeitig bestätigt.",
            502,
          ),
        );
      }, 14000);
      room.pending.set(eventId, {
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      room.socket.send(
        JSON.stringify({
          type,
          event_id: eventId,
          delegation_id: delegationId,
          content: content.slice(0, 1200),
        }),
      );
    });
  }
  onEvent(id, event) {
    const room = this.room(id);
    if (
      event.type !== "error" &&
      event.client_event_id &&
      room.pending.has(event.client_event_id)
    ) {
      room.pending.get(event.client_event_id).resolve();
      room.pending.delete(event.client_event_id);
    }
    if (event.type === "error") {
      const ref = event.error?.event_id || event.client_event_id;
      room.pending
        .get(ref)
        ?.reject(
          new AppError(
            "Die Sprachsteuerung hat eine Anweisung abgelehnt.",
            502,
          ),
        );
      room.pending.delete(ref);
      this.emit(id, "notice", {
        message:
          "Eine Sprachanweisung konnte nicht verarbeitet werden. Bitte versuche es erneut.",
      });
      return;
    }
    if (room.closing) return;
    if (
      event.type === "session.input_transcript.delta" ||
      event.type === "session.output_transcript.delta"
    ) {
      if (event.event_id && room.seen.has(event.event_id)) return;
      if (event.event_id) room.seen.add(event.event_id);
      const isChild = event.type === "session.input_transcript.delta";
      const q = this.store.lesson(id).state.question;
      if (isChild) {
        if (!room.inputSpan || event.start_ms - room.inputSpan.end > 1500) {
          room.inputSpan = {
            start: event.start_ms,
            end: event.end_ms,
            questionId: q?.status === "open" ? q.id : null,
            text: "",
          };
        }
        room.inputSpan.end = event.end_ms;
        room.inputSpan.text += String(event.delta || "");
      }
      room.transcripts.push({
        role: isChild ? "child" : "teacher",
        text: String(event.delta || "").slice(0, 2000),
        start_ms: event.start_ms,
        end_ms: event.end_ms,
        receivedAt: Date.now(),
        questionId: isChild
          ? room.inputSpan.questionId
          : q?.status === "open"
            ? q.id
            : null,
      });
      if (isChild) this.checkAnswerCandidate(id, q);
      if (room.transcripts.length > 180) room.transcripts.splice(0, 60);
      if (room.seen.size > 4000) room.seen.clear();
    }
    if (
      event.type === "session.delegation.created" &&
      event.delegation?.target === "client"
    ) {
      const delegationId = event.delegation.id;
      if (room.seen.has(delegationId)) return;
      room.seen.add(delegationId);
      this.enqueue(
        id,
        "Die Sprachlehrerin bittet um Unterrichtsplanung oder Antwortbewertung. Nutze Gespräch, Zeit und Tafelzustand.",
        delegationId,
      );
    }
    if (event.type === "session.closed" && room.ready)
      this.disconnect(id).catch(() => {});
  }
  checkAnswerCandidate(id, question) {
    const room = this.room(id);
    clearTimeout(room.answerCheckTimer);
    if (!room.ready) return;
    const normalize = (text) =>
      text
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, "")
        .trim();
    const heard = normalize(room.inputSpan.text);
    const candidates =
      question?.status === "open" && room.inputSpan.questionId === question.id
        ? question.options
            .flatMap((o, index) =>
              isSpokenPractice(question)
                ? [o.label]
                : [o.label, ...o.aliases, String(index + 1)],
            )
            .map(normalize)
        : [];
    const isAnswer = candidates.includes(heard);
    const repeatedWord =
      !question &&
      this.store
        .results(id)
        .taught.some((item) => normalize(item.text) === heard);
    const isRequest =
      /frage|spiel|tipp|hilfe|wiederhol|versteh|zeig|bild|aufhören|aufhoeren|beenden|tschüss|tschuess/.test(
        heard,
      );
    if (!heard) return;
    const questionId = isAnswer ? question.id : null;
    const input = { start: room.inputSpan.start, end: room.inputSpan.end };
    // This is only a model review trigger, never a transcript-to-score shortcut.
    // Live may be busy with an earlier delegation when a child answers quickly.
    room.answerCheckTimer = setTimeout(
      () => {
        const current = this.store.lesson(id);
        if (room.closing || current.status !== "active") return;
        if (
          room.plannedInput?.start === input.start &&
          room.plannedInput.end >= input.end
        )
          return;
        if (
          isAnswer &&
          (current.state.question?.id !== questionId ||
            current.state.question.status !== "open")
        )
          return;
        this.enqueue(
          id,
          isAnswer
            ? "Ein neues Sprachfragment passt möglicherweise zu einer Option der sichtbaren Frage. Prüfe den vollständigen Gesprächskontext und die zugeordnete Frage-ID. Bewerte nur eine eindeutige neue Antwort; bei Unsicherheit klären. Keine Klickantwort erneut zählen."
            : isRequest
              ? "Das Kind hat einen Unterrichtswunsch geäußert. Lies die neuesten Sprachfragmente und reagiere auf diesen Wunsch, statt nur den alten Plan fortzusetzen. Wenn eine Auswahlfrage gewünscht und noch keine offen ist, stelle jetzt eine passende Auswahlfrage. Eine bereits offene passende Frage nicht neu erstellen."
              : "Das Kind hat gesprochen oder ein Lernwort nachgesprochen. Die Stimme hat möglicherweise nur kurz gelobt (z.B. Klasse). Prüfe die neue Äußerung, bestätige kurz und liefere jetzt genau einen konkreten nächsten Lernschritt oder eine passende Rückfrage. Nach einer gelungenen Wiederholung sinnvoll weiterführen, nicht nur loben und verstummen. Ohne offene Auswahlfrage kein Quiz-Ergebnis erfinden.",
        );
      },
      isAnswer || isRequest ? 1700 : repeatedWord ? 2200 : 3500,
    );
  }
  enqueue(id, trigger, delegationId = null) {
    const room = this.room(id);
    const signal = room.controller.signal;
    if (room.busy >= 6 || room.closing) return;
    if (room.inputSpan)
      room.plannedInput = {
        start: room.inputSpan.start,
        end: room.inputSpan.end,
      };
    const taskVersion = (room.taskVersion = (room.taskVersion || 0) + 1);
    // Freeze question attribution at delegation time; queued work must not reinterpret old speech against a new question.
    const captured = structuredClone(room.transcripts);
    const childParts = captured.filter((t) => t.role === "child");
    const latestChild = childParts.at(-1);
    if (latestChild) {
      let start = latestChild.start_ms;
      for (let i = childParts.length - 2; i >= 0; i--) {
        if (
          childParts[i].questionId !== latestChild.questionId ||
          start - childParts[i].end_ms > 1500
        )
          break;
        start = childParts[i].start_ms;
      }
      latestChild.answerToken = createHash("sha256")
        .update(`${room.remoteId}:${latestChild.questionId}:${start}`)
        .digest("hex");
    }
    room.busy++;
    room.queue = room.queue
      .catch(() => {})
      .then(async () => {
        if (signal.aborted || !room.ready) return;
        this.emit(id, "thinking", { busy: true });
        try {
          const text = await runTeacher({
            store: this.store,
            ai: this.ai,
            id,
            trigger,
            transcripts: captured,
            signal,
            execute: (name, args, callId) =>
              this.execute(id, name, args, callId, latestChild, signal),
          });
          if (signal.aborted || !room.ready || taskVersion !== room.taskVersion)
            return;
          if (text) {
            await this.send(
              id,
              "session.commentary.append",
              text,
              delegationId,
            );
            const l = this.store.lesson(id);
            if (l.state.readyToFinish && !signal.aborted) {
              l.state.finishDelivered = true;
              this.store.saveState(id, l.state);
              this.publish(id);
            }
          }
        } catch (e) {
          if (!signal.aborted) {
            this.emit(id, "notice", {
              message: e.status
                ? e.message
                : "Die Planung hat gerade nicht geklappt. Bitte versuche es erneut.",
            });
            this.send(
              id,
              "session.thinking.append",
              "Die letzte Planung ist fehlgeschlagen. Behaupte keine Änderung. Bitte beim aktuellen bestätigten Tafelstand bleiben.",
              delegationId,
            ).catch(() => {});
          }
        } finally {
          this.publish(id);
          this.emit(id, "thinking", { busy: false });
        }
      })
      .finally(() => {
        room.busy--;
      });
  }
  async execute(id, name, args, eventId, latestChild, signal) {
    if (signal.aborted) throw new AppError("Stunde unterbrochen.", 409);
    let result;
    if (name === "search_emoji") {
      if (
        typeof args.query !== "string" ||
        !args.query.trim() ||
        args.query.length > 100
      )
        throw new AppError(
          "Bitte ein kurzes englisches oder deutsches Suchwort verwenden.",
        );
      return { ok: true, matches: searchEmoji(args.query) };
    }
    if (name === "show_practice") {
      const lesson = this.store.active(id);
      if (lesson.state.question?.status === "open")
        throw new AppError(
          "Bitte zuerst die aktuelle Aufgabe beantworten oder ausdrücklich mit patch_board schließen.",
          409,
        );
      args = practiceBoard(args, lesson.topic);
    }
    if (name === "patch_board" || name === "show_practice") {
      result = this.store.updateBoard(id, eventId, args);
      this.publish(id);
      await this.waitRendered(id, result.revision, signal);
      const state = this.store.lesson(id).state;
      const images = [];
      for (const element of state.elements.filter(
        (e) => e.missingEmoji && e.imageStatus === "pending",
      )) {
        images.push(
          await this.generateImage(
            id,
            {
              expectedRevision: state.revision,
              stepId: state.stepId,
              elementId: element.id,
              prompt: `One clear child-friendly illustration of ${element.text || element.translation}. Plain white background. Large recognizable object. No text, letters, labels or symbols.`,
            },
            signal,
          ),
        );
      }
      return { ...result, visible: true, question: state.question, images };
    }
    if (name === "record_answer") {
      const answer = voiceAnswerSchema.parse(args);
      if (!latestChild || latestChild.questionId !== answer.questionId)
        return {
          ok: false,
          ignored: true,
          reason:
            "Die Sprachantwort gehört nicht sicher zu dieser Frage. Bitte klären.",
        };
      // Different delegated calls about the same spoken answer share a durable event ID.
      const stableId = answer.uncertain
        ? eventId
        : `voice-${latestChild.answerToken}`;
      result = this.store.answer(
        id,
        {
          ...answer,
          eventId: stableId,
          mode: "voice",
        },
        { occurredAt: latestChild.receivedAt },
      );
    } else if (name === "show_hint")
      result = this.store.hint(id, hintToolSchema.parse(args).questionId);
    else if (name === "finish_lesson")
      result = this.store.requestFinish(id, endToolSchema.parse(args).reason);
    else if (name === "generate_image")
      return this.generateImage(id, imageToolSchema.parse(args), signal);
    else throw new AppError("Unbekanntes Unterrichtswerkzeug.");
    this.publish(id);
    return result;
  }
  rendered(id, revision) {
    const room = this.room(id);
    if (revision !== this.store.lesson(id).state.revision) return;
    room.rendered = revision;
    for (const waiter of room.renderWaiters)
      if (waiter.revision <= revision) waiter.resolve();
    room.renderWaiters = room.renderWaiters.filter(
      (w) => w.revision > revision,
    );
  }
  waitRendered(id, revision, signal) {
    const room = this.room(id);
    if (room.rendered >= revision) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const waiter = {
        revision,
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
      };
      const timer = setTimeout(() => {
        room.renderWaiters = room.renderWaiters.filter((w) => w !== waiter);
        reject(
          new AppError(
            "Die Tafel ist gespeichert, aber die Anzeige wurde noch nicht bestätigt. Bitte den Browser prüfen.",
            409,
          ),
        );
      }, 6000);
      room.renderWaiters.push(waiter);
      if (signal.aborted) {
        clearTimeout(timer);
        reject(new AppError("Unterbrochen.", 409));
      }
    });
  }
  async generateImage(id, args, signal) {
    const lesson = this.store.active(id);
    const element = lesson.state.elements.find(
      (e) => e.id === args.elementId && e.type === "image",
    );
    if (
      lesson.state.revision !== args.expectedRevision ||
      lesson.state.stepId !== args.stepId ||
      !element
    )
      throw new AppError("Dieser Bildplatzhalter ist nicht mehr aktuell.", 409);
    if (element.imageStatus === "loading" || element.src)
      return { ok: true, status: element.imageStatus || "ready" };
    const hash = createHash("sha256")
      .update(this.config.imageModel + "\n" + args.prompt)
      .digest("hex");
    const cached = this.store.db
      .prepare("SELECT * FROM images WHERE hash=?")
      .get(hash);
    if (
      cached &&
      existsSync(join(this.config.dataDir, "images", hash + ".png"))
    ) {
      element.src = cached.path;
      element.imageStatus = "ready";
      this.store.saveState(id, lesson.state);
      this.publish(id);
      return { ok: true, status: "ready" };
    }
    element.imageStatus = "loading";
    this.store.saveState(id, lesson.state);
    this.publish(id);
    this.ai
      .image(args.prompt, signal)
      .then((result) => {
        this.store.db
          .prepare("INSERT OR IGNORE INTO images VALUES(?,?,?,?,?)")
          .run(
            result.hash,
            result.path,
            lesson.topic_id,
            element.text,
            Date.now(),
          );
        if (signal.aborted) return;
        const current = this.store.lesson(id);
        if (
          current.status !== "active" ||
          current.state.stepId !== args.stepId ||
          current.state.revision !== args.expectedRevision
        )
          return;
        const target = current.state.elements.find(
          (e) => e.id === args.elementId,
        );
        if (!target) return;
        target.src = result.path;
        target.imageStatus = "ready";
        this.store.saveState(id, current.state);
        this.publish(id);
        if (this.room(id).ready)
          this.send(
            id,
            "session.commentary.append",
            `Das Bild ist jetzt auf der aktuellen Tafel bereit. ${current.state.question?.mode === "picture_speak" ? "Frage jetzt: Was siehst du? Sag das englische Wort. Verrate die Lösung nicht." : "Fahre kurz mit der aktuellen Aufgabe fort, ohne eine neue Aufgabe zu erfinden."}`,
          ).catch(() => {});
      })
      .catch(() => {
        if (signal.aborted) return;
        const current = this.store.lesson(id);
        if (current.state.revision !== args.expectedRevision) return;
        const target = current.state.elements.find(
          (e) => e.id === args.elementId,
        );
        if (target) {
          target.imageStatus = "failed";
          this.store.saveState(id, current.state);
          this.publish(id);
        }
        this.emit(id, "notice", {
          message:
            "Das Bild konnte nicht geladen werden. Wir können mündlich weiterüben.",
        });
        if (this.room(id).ready)
          this.send(
            id,
            "session.commentary.append",
            "Das aktuelle Bild konnte nicht erstellt werden. Keine Frage zu einem unsichtbaren Bild stellen. Erkläre es kurz und lass den Planer eine mündliche Ersatzübung anbieten.",
          ).catch(() => {});
      });
    return {
      ok: true,
      status: "loading",
      message:
        "Kein passendes Emoji: GPT Image zeichnet das Bild. Bitte dem Kind kurz sagen, dass es einen Moment dauert. Eine Bildfrage erst stellen, wenn das Bild bereit ist; bis dahin kurz mündlich wiederholen.",
    };
  }
  click(id, data) {
    const result = this.store.answer(id, data);
    this.publish(id);
    if (result.ok && !result.duplicate)
      this.enqueue(
        id,
        `Klickantwort bereits gespeichert: ${JSON.stringify(result)}. NICHT erneut bewerten oder speichern. Bestätige das Ergebnis. Bei Fehler Tipp und erneuten Versuch, bei Erfolg nächsten passenden Schritt vorbereiten.`,
      );
    return result;
  }
  heartbeat(id) {
    const lesson = this.store.heartbeat(id);
    const room = this.room(id);
    if (lesson.duration_ms >= 9 * 60000 && !room.wrapSent && room.ready) {
      room.wrapSent = true;
      this.enqueue(
        id,
        "Die Stunde nähert sich zehn Minuten. Beende die aktuelle Übung, fasse tatsächlich gelernte Inhalte kurz zusammen und leite den freundlichen Abschluss mit finish_lesson ein.",
      );
    }
    return { duration_ms: lesson.duration_ms, status: lesson.status };
  }
  async disconnect(id) {
    return this.end(id, "interrupted");
  }
  async end(id, status) {
    const room = this.room(id);
    if (room.ending) {
      if (status === "interrupted") return this.store.lesson(id);
      await room.ending;
    }
    if (["completed", "ended_early"].includes(this.store.lesson(id).status))
      return this.store.publicLesson(id);
    // Save first. Remote cleanup and summary failure cannot lose confirmed learning results.
    const lesson = this.store.finish(id, status);
    room.closing = true;
    room.ready = false;
    clearTimeout(room.answerCheckTimer);
    room.controller.abort();
    for (const p of room.pending.values())
      p.reject(new AppError("Stunde beendet.", 409));
    room.pending.clear();
    this.publish(id);
    room.ending = (async () => {
      await this.ai.closeLive(room.remoteId, room.socket);
      room.remoteId = null;
      room.socket = null;
      room.transcripts = [];
      room.seen.clear();
      room.inputSpan = null;
      clearTimeout(room.answerCheckTimer);
      if (status !== "interrupted") {
        await generateSummary(this.ai, this.store, id);
        this.publish(id);
      }
      return this.store.publicLesson(id);
    })().finally(() => {
      room.ending = null;
    });
    return lesson;
  }
  async sweep() {
    for (const row of this.store.db
      .prepare("SELECT id,last_seen FROM lessons WHERE status='active'")
      .all()) {
      if (Date.now() - row.last_seen > 35000) await this.disconnect(row.id);
    }
  }
  async shutdown() {
    for (const row of this.store.db
      .prepare("SELECT id FROM lessons WHERE status='active'")
      .all())
      await this.disconnect(row.id);
    await Promise.allSettled(
      [...this.rooms.values()].map((r) => r.ending).filter(Boolean),
    );
    await Promise.allSettled([...this.rooms.values()].map((r) => r.queue));
  }
}
