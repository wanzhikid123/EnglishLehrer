import React, { useEffect, useRef, useState } from "react";
import {
  Send,
  LoaderCircle,
  CheckCircle2,
  MessageSquare,
  BookOpen,
  Trash2,
  Mic,
  Square,
} from "lucide-react";
import { api, clockText, dateText } from "./api.js";
import { confirmTopicDeletion } from "./topic-actions.js";
import { useDictation } from "./useDictation.js";
import { LessonPlanEditor } from "./LessonPlan.jsx";

export function PreparationPage({ home, onUpdated, initialTopicId = "" }) {
  const [state, setState] = useState({
    turns: [],
    topics: home.topics,
    busy: false,
    generation: 0,
  });
  const [topicId, setTopicId] = useState(initialTopicId);
  const [planBusy, setPlanBusy] = useState(false);
  const [planView, setPlanView] = useState(Boolean(initialTopicId));
  const [lessonId, setLessonId] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState("");
  const [language, setLanguage] = useState("auto");
  const input = useRef(null);
  const dictation = useDictation({
    onTranscript: (text) => {
      setMessage((current) =>
        current.trim() ? `${current.trimEnd()}\n${text}` : text,
      );
      requestAnimationFrame(() => input.current?.focus());
    },
    onError: setError,
  });
  const messages = useRef(null),
    mounted = useRef(true),
    pending = useRef(null);
  const topic = state.topics.find((item) => item.id === topicId);
  async function refresh() {
    const data = await api("/preparation");
    if (mounted.current) {
      setState(data);
      setTopicId((current) =>
        data.topics.some((item) => item.id === current) ? current : "",
      );
      setLoading(false);
    }
    return data;
  }
  useEffect(() => {
    mounted.current = true;
    refresh().catch((e) => {
      setError(e.message);
      setLoading(false);
    });
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!state.busy) return;
    const timer = setInterval(
      () =>
        refresh()
          .then((data) => {
            if (!data.busy) onUpdated();
          })
          .catch((e) => mounted.current && setError(e.message)),
      2000,
    );
    return () => clearInterval(timer);
  }, [state.busy]);
  useEffect(() => {
    if (messages.current)
      messages.current.scrollTop = messages.current.scrollHeight;
  }, [state.turns, sending]);
  async function submit(event) {
    event.preventDefault();
    if (!message.trim() || message.length > 4000 || busy || loading) return;
    const text = message.trim();
    if (
      !pending.current ||
      pending.current.message !== text ||
      pending.current.topicId !== (topicId || null) ||
      pending.current.lessonId !== (lessonId || null) ||
      pending.current.generation !== state.generation
    )
      pending.current = {
        eventId: crypto.randomUUID(),
        message: text,
        topicId: topicId || null,
        lessonId: lessonId || null,
        generation: state.generation,
      };
    setSending(true);
    setError("");
    try {
      const result = await api("/preparation/chat", pending.current);
      pending.current = null;
      if (!mounted.current) return;
      setMessage("");
      if (result.changes.length) setTopicId(result.changes.at(-1).after.id);
      await refresh();
      onUpdated();
    } catch (e) {
      if (!mounted.current) return;
      setError(e.message);
      const data = await refresh().catch(() => null);
      // Keep the request ID on transport uncertainty; failed transactions may be retried anew.
      if (
        (data && data.generation !== pending.current?.generation) ||
        data?.turns.some(
          (turn) =>
            turn.id === pending.current?.eventId && turn.status === "failed",
        )
      )
        pending.current = null;
    } finally {
      if (mounted.current) setSending(false);
    }
  }
  async function clearChat() {
    if (
      busy ||
      loading ||
      !window.confirm(
        "Gespräch wirklich leeren?\nAlle bisherigen Nachrichten werden gelöscht und nicht mehr an die KI gesendet. Themen und Lernergebnisse bleiben erhalten.",
      )
    )
      return;
    setActing(true);
    setError("");
    try {
      const data = await api("/preparation/clear", {
        expectedGeneration: state.generation,
        confirmed: true,
      });
      if (!mounted.current) return;
      pending.current = null;
      setState(data);
      setMessage("");
      setLessonId("");
    } catch (e) {
      if (mounted.current) {
        setError(e.message);
        await refresh().catch(() => {});
      }
    } finally {
      if (mounted.current) setActing(false);
    }
  }
  async function deleteProposedTopic(proposal, turnId) {
    if (busy) return;
    setActing(true);
    setError("");
    try {
      const deleted = await confirmTopicDeletion(
        {
          id: proposal.topicId,
          name: proposal.name,
          revision: proposal.expectedRevision,
        },
        turnId,
      );
      if (deleted && mounted.current) {
        await refresh();
        onUpdated();
      }
    } catch (e) {
      if (mounted.current) {
        setError(e.message);
        await refresh().catch(() => {});
      }
    } finally {
      if (mounted.current) setActing(false);
    }
  }
  const working = sending || state.busy || acting || planBusy;
  const voiceBusy = dictation.status !== "idle";
  const busy = working || voiceBusy;
  return (
    <main className="preparation-page">
      <div className="preparation-heading">
        <div>
          <span className="eyebrow">FÜR ELTERN · 备课与复盘</span>
          <h1>Unterricht vorbereiten</h1>
        </div>
        <button
          className="button secondary prep-clear"
          onClick={clearChat}
          disabled={busy || loading || !state.turns.length}
        >
          <Trash2 size={16} /> Gespräch leeren
        </button>
      </div>
      <div className="prep-context">
        <label>
          Thema
          <select
            value={topicId}
            disabled={busy}
            onChange={(e) => setTopicId(e.target.value)}
          >
            <option value="">Alle Themen / neues Thema</option>
            {state.topics.map((item) => (
              <option value={item.id} key={item.id}>
                {item.icon} {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Stunde besprechen
          <select
            value={lessonId}
            disabled={busy}
            onChange={(e) => setLessonId(e.target.value)}
          >
            <option value="">Letzte Lernergebnisse als Kontext</option>
            {home.history.slice(0, 30).map((item) => (
              <option value={item.id} key={item.id}>
                {dateText(item.started_at)} ·{" "}
                {item.topic_name ||
                  home.topics.find((t) => t.id === item.topic_id)?.name ||
                  item.topic_id}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="prep-tabs" role="group" aria-label="Vorbereitungsansicht">
        <button
          className={`button ${planView ? "secondary" : ""}`}
          disabled={busy}
          onClick={() => setPlanView(false)}
        >
          Gespräch
        </button>
        <button
          className={`button ${planView ? "" : "secondary"}`}
          disabled={busy || !topic}
          onClick={() => setPlanView(true)}
        >
          Unterrichtsplan & Lernbelege
        </button>
      </div>
      {!planView && (
        <div className="prep-layout">
          <section className="prep-chat" aria-label="Vorbereitungschat">
            <div
              className="prep-messages"
              ref={messages}
              role="log"
              aria-label="Gespräch zur Vorbereitung"
              aria-live="polite"
            >
              {loading ? (
                <p>
                  <LoaderCircle size={18} className="spin" /> Gespräch wird
                  geladen …
                </p>
              ) : (
                !state.turns.length && (
                  <div className="prep-empty">
                    <MessageSquare size={30} />
                    <h2>Was soll Mia als Nächstes unterrichten?</h2>
                    <p>
                      Neue Themen erstellen, Wörter ergänzen oder eine Stunde
                      besprechen. Du kannst auch auf Chinesisch schreiben.
                    </p>
                    <div className="prep-suggestions">
                      <button
                        disabled={busy}
                        onClick={() => {
                          setTopicId(
                            state.topics.some((item) => item.id === "days")
                              ? "days"
                              : "",
                          );
                          setMessage(
                            "请完善星期主题：按顺序教完 Monday 到 Sunday 七天，跟读后主动进入下一步。",
                          );
                        }}
                      >
                        七天都学到
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => {
                          setTopicId(
                            state.topics.some((item) => item.id === "colors")
                              ? "colors"
                              : "",
                          );
                          setMessage(
                            "请在颜色主题里补充 orange、purple、pink、brown、black 和 white，保留已有颜色，并更新教学安排。",
                          );
                        }}
                      >
                        补充更多颜色
                      </button>
                      <button
                        disabled={busy}
                        onClick={() =>
                          setMessage(
                            "请根据最近的学习结果做一个课后总结，告诉我下次应该复习什么。",
                          )
                        }
                      >
                        课后总结
                      </button>
                    </div>
                  </div>
                )
              )}
              {state.turns.map((turn) => (
                <React.Fragment key={turn.id}>
                  <article className="prep-message parent">
                    <span>Du</span>
                    <p>{turn.message}</p>
                  </article>
                  <article className="prep-message assistant">
                    <span>Vorbereitungsassistent</span>
                    {turn.status === "completed" ? (
                      <>
                        <p>{turn.response.message}</p>
                        {turn.response.changes.map((change) => (
                          <details
                            className="prep-change"
                            key={change.after.id}
                          >
                            <summary>
                              <CheckCircle2 size={15} />{" "}
                              {change.before
                                ? "Aktualisiert"
                                : "Neu gespeichert"}
                              : {change.after.name}
                            </summary>
                            <p>
                              <b>Wörter:</b> {change.after.words.join(" · ")}
                            </p>
                            {change.before && (
                              <p>
                                <b>Hinzugefügt:</b>{" "}
                                {change.after.words
                                  .filter(
                                    (word) =>
                                      !change.before.words.some(
                                        (old) =>
                                          old.toLowerCase() ===
                                          word.toLowerCase(),
                                      ),
                                  )
                                  .join(" · ") ||
                                  "Keine neuen Wörter; Unterrichtsplan angepasst."}
                              </p>
                            )}
                            <p>
                              <b>Lernziel:</b> {change.after.goal}
                            </p>
                            <p>
                              <b>Unterricht:</b>{" "}
                              {change.after.teachingNotes ||
                                "In kleinen Schritten üben."}
                            </p>
                          </details>
                        ))}
                        {turn.response.deletionRequests?.map((proposal) => {
                          const current = state.topics.find(
                            (item) => item.id === proposal.topicId,
                          );
                          const deleted = !current;
                          const changed =
                            current &&
                            current.revision !== proposal.expectedRevision;
                          return (
                            <div
                              className="prep-deletion"
                              key={proposal.topicId}
                            >
                              <strong>{proposal.name}</strong>
                              {deleted ? (
                                <p>
                                  Aus der Themenliste gelöscht. Lernergebnisse
                                  bleiben erhalten.
                                </p>
                              ) : changed ? (
                                <p>
                                  Das Thema wurde geändert. Bitte die Löschung
                                  erneut anfragen.
                                </p>
                              ) : (
                                <>
                                  <p>
                                    Zum Löschen bitte bestätigen. Bisherige
                                    Stunden bleiben erhalten.
                                  </p>
                                  <button
                                    className="button secondary"
                                    disabled={busy}
                                    onClick={() =>
                                      deleteProposedTopic(proposal, turn.id)
                                    }
                                  >
                                    <Trash2 size={16} /> Löschen bestätigen
                                  </button>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </>
                    ) : (
                      <p>
                        {turn.status === "pending"
                          ? "Die Vorbereitung läuft …"
                          : turn.error}
                      </p>
                    )}
                  </article>
                </React.Fragment>
              ))}
              {sending && (
                <p className="prep-working">
                  <LoaderCircle size={17} className="spin" /> Themen und
                  Lernstand werden geprüft …
                </p>
              )}
            </div>
            <form className="prep-composer" onSubmit={submit}>
              {error && (
                <p className="error-text" role="alert">
                  {error}
                </p>
              )}
              <label htmlFor="preparation-message">
                Deine Nachricht / 你的要求
              </label>
              <div className="prep-input-row">
                <textarea
                  id="preparation-message"
                  ref={input}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  maxLength={4000}
                  disabled={busy || loading}
                  placeholder="Zum Beispiel: Ergänze die restlichen Wochentage …"
                />
                <button
                  className="button"
                  type="submit"
                  disabled={
                    busy || loading || !message.trim() || message.length > 4000
                  }
                >
                  <Send size={18} /> {working ? "Wird vorbereitet …" : "Senden"}
                </button>
              </div>
              <div className="prep-voice-controls">
                <button
                  className={`button secondary prep-record ${dictation.status === "recording" ? "recording" : ""}`}
                  type="button"
                  disabled={
                    working ||
                    loading ||
                    ["requesting", "transcribing"].includes(dictation.status)
                  }
                  aria-pressed={dictation.status === "recording"}
                  onClick={() =>
                    dictation.status === "recording"
                      ? dictation.stop()
                      : dictation.start(language)
                  }
                >
                  {dictation.status === "recording" ? (
                    <Square size={16} />
                  ) : voiceBusy ? (
                    <LoaderCircle size={16} className="spin" />
                  ) : (
                    <Mic size={16} />
                  )}
                  {dictation.status === "recording"
                    ? `Stoppen · ${clockText(dictation.elapsed)}`
                    : "Spracheingabe"}
                </button>
                <label className="prep-voice-language">
                  Sprache
                  <select
                    value={language}
                    onChange={(event) => setLanguage(event.target.value)}
                    disabled={busy || loading}
                  >
                    <option value="auto">Auto · 中 / EN / DE</option>
                    <option value="zh">中文</option>
                    <option value="en">English</option>
                    <option value="de">Deutsch</option>
                  </select>
                </label>
                {voiceBusy && (
                  <button
                    className="prep-voice-cancel"
                    type="button"
                    onClick={dictation.cancel}
                  >
                    Abbrechen
                  </button>
                )}
                <span className="prep-voice-status" role="status">
                  {dictation.status === "requesting"
                    ? "Mikrofon erlauben …"
                    : dictation.status === "transcribing"
                      ? "Sprache wird in Text umgewandelt …"
                      : dictation.status === "recording"
                        ? "Aufnahme läuft · maximal 3 Minuten"
                        : "Aufnehmen → stoppen → Text prüfen"}
                </span>
              </div>
              {message.length > 4000 && (
                <p className="error-text" role="alert">
                  Der Text ist länger als 4.000 Zeichen. Bitte vor dem Senden
                  kürzen; die Aufnahme wurde vollständig eingefügt.
                </p>
              )}
              <small>
                Gewünschte Änderungen werden lokal gespeichert und gelten ab der
                nächsten neuen Stunde.
              </small>
            </form>
          </section>
          <aside className="prep-sidebar">
            <span className="eyebrow">
              <BookOpen size={15} /> GESPEICHERTER THEMENPLAN
            </span>
            {topic ? (
              <>
                <h2>
                  {topic.icon} {topic.name}
                </h2>
                <p>{topic.goal}</p>
                <h3>Wörter · {topic.words.length}</h3>
                <div className="word-tags">
                  {topic.words.map((word) => (
                    <span key={word}>{word}</span>
                  ))}
                </div>
                {!!topic.phrases.length && (
                  <>
                    <h3>Sätze</h3>
                    <ul>
                      {topic.phrases.map((phrase) => (
                        <li key={phrase}>{phrase}</li>
                      ))}
                    </ul>
                  </>
                )}
                <h3>Unterrichtsplan</h3>
                <p>
                  {topic.coverage === "all"
                    ? "Alle Wörter schrittweise anbieten."
                    : "Wenige neue Wörter pro Runde."}
                </p>
                <p className="prep-notes">
                  {topic.teachingNotes ||
                    "Mia passt die Übungen an den Lernstand an."}
                </p>
              </>
            ) : (
              <>
                <h2>Platz für neue Ideen</h2>
                <p>
                  Wähle ein Thema, um die gespeicherten Wörter und den
                  Unterrichtsplan zu sehen. Oder beschreibe ein ganz neues Thema
                  im Chat.
                </p>
                <p>
                  Für die Nachbesprechung stehen gespeicherte Wörter, Übungen
                  und Ergebnisse zur Verfügung.
                </p>
              </>
            )}
            <p className="prep-privacy">
              Dieser Vorbereitungschat wird auf deinem Computer gespeichert. Für
              die KI-Antwort werden die Nachrichten und nötigen Lernergebnisse
              an OpenAI gesendet. Sprachaufnahmen werden zur Texterkennung an
              OpenAI gesendet und lokal nicht gespeichert. Der erkannte Text
              wird erst mit „Senden“ als Nachricht übernommen.
            </p>
          </aside>
        </div>
      )}
      {planView && topic && (
        <LessonPlanEditor
          key={`${topic.id}-${topic.revision}`}
          topic={topic}
          disabled={sending || acting || voiceBusy}
          onBusy={setPlanBusy}
          onUpdated={onUpdated}
        />
      )}
    </main>
  );
}
