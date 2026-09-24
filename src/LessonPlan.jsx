import React, { useEffect, useState } from "react";
import {
  ArrowUp,
  ArrowDown,
  LoaderCircle,
  Save,
  RefreshCw,
  Eye,
  Mic,
} from "lucide-react";
import { api, dateText } from "./api.js";
import { BoardElement } from "./BoardElement.jsx";
import { practiceLabels, stageLabels } from "../shared/practice-labels.js";

const skillLabel = (skill) =>
  !skill?.attemptCount
    ? "Noch nicht geprüft"
    : skill.status === "review"
      ? "Mit Hilfe / noch unsicher"
      : skill.status === "developing"
        ? "Schon sicherer"
        : "Erste Erfolge";
export function WordProgress({ items = [] }) {
  if (!items.length)
    return (
      <p className="muted">
        Nach der ersten Übung erscheinen hier die Lernbelege.
      </p>
    );
  return (
    <div className="word-progress">
      <table>
        <thead>
          <tr>
            <th>Wort</th>
            <th>Auswählen</th>
            <th>Selbst sprechen</th>
            <th>Wiederholen</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.knowledge}>
              <th>{item.knowledge}</th>
              <td title={item.skills?.recognition.reason}>
                {skillLabel(item.skills?.recognition)}
              </td>
              <td title={item.skills?.speaking.reason}>
                {skillLabel(item.skills?.speaking)}
              </td>
              <td>{item.due ? "Jetzt bereit" : dateText(item.dueAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <small>
        Nachsprechen zählt als Übung. Auswahl belegt kein eigenständiges
        Sprechen und keinen separaten Englisch-Hörtest.
      </small>
    </div>
  );
}

export function LessonPlanEditor({
  topic,
  disabled = false,
  onBusy = () => {},
  onUpdated = () => {},
  onStart,
  starting = false,
  startError = "",
  keyConfigured = false,
}) {
  const [state, setState] = useState(null);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState("");
  const [previews, setPreviews] = useState([]);
  const base = `/topics/${topic.id}/plan`;
  function accept(data) {
    setState(data);
    setDraft(
      data.plan ? { goal: data.plan.goal, steps: data.plan.steps } : null,
    );
    setPreviews(data.previews || []);
    setDirty(false);
    setIndex(0);
  }
  useEffect(() => {
    const controller = new AbortController();
    api(base, undefined, { signal: controller.signal })
      .then(accept)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [base]);
  useEffect(() => {
    if (!busy && !state?.job?.busy) return;
    let mounted = true;
    const timer = setInterval(
      () =>
        api(base)
          .then((data) => {
            if (!mounted) return;
            setState(data);
            if (!data.job?.busy && !busy && data.job?.phase === "ready")
              accept(data);
          })
          .catch(() => {}),
      1200,
    );
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [base, busy, state?.job?.busy]);
  const locked = disabled || busy || state?.job?.busy;
  const request = () => ({
    expectedTopicRevision: topic.revision,
    expectedRevision: state?.plan?.revision || 0,
  });
  async function build(editing) {
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      const data = await api(`${base}/${editing ? "save" : "generate"}`, {
        ...request(),
        ...(editing ? { plan: draft } : {}),
      });
      accept(data);
      onUpdated();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  function edit(next) {
    setDraft(next);
    setDirty(true);
    setPreviews([]);
  }
  function move(from, to) {
    const steps = [...draft.steps];
    [steps[from], steps[to]] = [steps[to], steps[from]];
    edit({ ...draft, steps });
    setIndex(to);
  }
  function changeStep(field, value) {
    edit({
      ...draft,
      steps: draft.steps.map((s, i) =>
        i === index ? { ...s, [field]: value } : s,
      ),
    });
  }
  async function preview() {
    setError("");
    try {
      setPreviews(
        (await api(`${base}/preview`, { ...request(), plan: draft })).previews,
      );
    } catch (e) {
      setError(e.message);
    }
  }
  const step = draft?.steps[index];
  const board = previews[index];
  return (
    <section
      className="lesson-plan-editor"
      aria-label="Ausführbarer Unterrichtsplan"
    >
      <div className="section-heading">
        <div>
          <span className="eyebrow">FÜR DIE NÄCHSTE STUNDE</span>
          <h2>Unterricht vorbereiten · {topic.name}</h2>
        </div>
        <div className="plan-header-actions">
          <button
            className="button secondary"
            disabled={locked || !state}
            onClick={() => build(false)}
          >
            <RefreshCw size={17} />
            {state?.plan ? "Plan neu erstellen" : "Plan erstellen"}
          </button>
          <button
            className="button"
            disabled={locked || !state || dirty || !keyConfigured}
            onClick={onStart}
          >
            {starting ? (
              <LoaderCircle className="spin" size={18} />
            ) : (
              <Mic size={18} />
            )}
            {starting
              ? "Mikrofon wird vorbereitet …"
              : "Mikrofon an & Stunde starten"}
          </button>
        </div>
      </div>
      {dirty && (
        <p className="hint">
          Bitte den Plan speichern, bevor du die Stunde startest.
        </p>
      )}
      {!keyConfigured && (
        <p className="error-text">
          Bitte zuerst die Windows-Umgebungsvariable OPENAI_API_KEY einrichten.
        </p>
      )}
      {startError && (
        <p role="alert" className="error-text">
          {startError}
        </p>
      )}
      <small className="plan-start-note">
        Mia ist eine KI-Lehrerin. Deine Stimme wird für das Gespräch an OpenAI
        übertragen. Auf diesem Computer werden keine Aufnahmen gespeichert.
      </small>
      <p>
        Übungen mit Emoji oder deutschen Begriffen vorbereiten. Mia wartet bei
        jeder Aufgabe auf die Antwort und passt sich Wünschen an. Änderungen
        gelten für neue Stunden.
      </p>
      {(busy || state?.job?.busy) && (
        <p className="plan-status" role="status">
          <LoaderCircle className="spin" size={18} />
          Unterrichtsplan wird erstellt …
        </p>
      )}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      {state?.job?.error && !error && (
        <p role="alert" className="error-text">
          {state.job.error}
        </p>
      )}
      {state?.plan?.stale && (
        <p className="hint">
          Das Thema wurde geändert. Bitte den Plan neu erstellen; neue Stunden
          nutzen den alten Plan nicht.
        </p>
      )}
      {state?.reviews.length > 0 && (
        <div className="plan-reviews">
          <h3>Zum Aufwärmen bereit</h3>
          <ul>
            {state.reviews.map((r) => (
              <li key={r.word}>
                <b>{r.word}</b> — {r.reason}
              </li>
            ))}
          </ul>
          <small>
            Zu Stundenbeginn werden bis zu drei aktuell fällige Wörter
            eingesetzt. Die Reihenfolge der übrigen Schritte bleibt erhalten.
          </small>
        </div>
      )}
      {draft && (
        <>
          <label className="plan-goal">
            Lernziel
            <input
              value={draft.goal}
              disabled={locked}
              maxLength={500}
              onChange={(e) => edit({ ...draft, goal: e.target.value })}
            />
          </label>
          <p>
            <b>
              {Math.round(
                (draft.steps.reduce((sum, s) => sum + s.seconds, 0) / 60) * 10,
              ) / 10}{" "}
              Minuten Übungen
            </b>{" "}
            + etwa eine Minute Abschluss. Zeiten sind Orientierung, kein
            Antwort-Countdown.
          </p>
          <div className="plan-workspace">
            <ol className="plan-steps">
              {draft.steps.map((s, i) => (
                <li key={s.id} className={index === i ? "selected" : ""}>
                  <button
                    className="plan-step-select"
                    onClick={() => setIndex(i)}
                    aria-pressed={index === i}
                  >
                    <small>
                      {stageLabels[s.stage]} · {s.seconds} s
                    </small>
                    <strong>{s.word}</strong>
                    <span>{practiceLabels[s.mode]}</span>
                  </button>
                  <div className="plan-move">
                    <button
                      aria-label={`Schritt ${i + 1} nach oben`}
                      disabled={locked || i === 0}
                      onClick={() => move(i, i - 1)}
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      aria-label={`Schritt ${i + 1} nach unten`}
                      disabled={locked || i === draft.steps.length - 1}
                      onClick={() => move(i, i + 1)}
                    >
                      <ArrowDown size={16} />
                    </button>
                  </div>
                </li>
              ))}
            </ol>
            <div className="plan-detail">
              {step && (
                <>
                  <h3>
                    Schritt {index + 1} · {step.word}
                  </h3>
                  <div className="plan-fields">
                    <label>
                      Übungsform
                      <select
                        value={step.mode}
                        disabled={locked}
                        onChange={(e) => changeStep("mode", e.target.value)}
                      >
                        {Object.entries(practiceLabels).map(([mode, label]) => (
                          <option value={mode} key={mode}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Deutsche Bedeutung
                      <input
                        value={step.german}
                        maxLength={80}
                        disabled={locked}
                        onChange={(e) => changeStep("german", e.target.value)}
                      />
                    </label>
                    <label>
                      Sekunden
                      <input
                        type="number"
                        min="15"
                        max="120"
                        value={step.seconds}
                        disabled={locked}
                        onChange={(e) =>
                          changeStep("seconds", Number(e.target.value))
                        }
                      />
                    </label>
                    {step.mode === "german_choice" && (
                      <label>
                        Andere bekannte Wörter (Komma)
                        <input
                          value={step.distractors.join(", ")}
                          disabled={locked}
                          onChange={(e) =>
                            changeStep(
                              "distractors",
                              e.target.value === ""
                                ? []
                                : e.target.value
                                    .split(",")
                                    .map((v) => v.trim()),
                            )
                          }
                        />
                      </label>
                    )}
                  </div>
                  <button
                    className="button secondary"
                    disabled={locked}
                    onClick={preview}
                  >
                    <Eye size={17} />
                    Tafelvorschau aktualisieren
                  </button>
                  {board ? (
                    <div className="plan-preview" aria-label="Tafelvorschau">
                      <p>
                        <b>{board.title}</b> · {board.prompt}
                      </p>
                      <div className="plan-board">
                        {board.elements.map((element) => (
                          <BoardElement key={element.id} element={element} />
                        ))}
                      </div>
                      {board.options.length > 0 && (
                        <div className="word-tags">
                          {board.options.map((o) => (
                            <span key={o.id}>{o.label}</span>
                          ))}
                        </div>
                      )}
                      {board.mode !== step.mode && (
                        <p className="hint">
                          Kein passendes Emoji: mit dem deutschen Begriff üben.
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="muted">
                      Vorschau nach Änderungen aktualisieren. Dabei werden keine
                      Lernbelege gespeichert.
                    </p>
                  )}
                  <p className="plan-branches">
                    <b>Nach der Antwort:</b> Richtig → nächster vorbereiteter
                    Schritt. Unsicher gehört → erneut nachfragen. Falsch / Hilfe
                    → Hinweis und dieselbe Aufgabe erneut versuchen. Andere
                    Wünsche → Mia passt den Ablauf an.
                  </p>
                </>
              )}
            </div>
          </div>
          <div className="plan-actions">
            <button
              className="button"
              disabled={locked || state?.plan?.stale}
              onClick={() => build(true)}
            >
              <Save size={17} />
              Plan speichern
            </button>
            <span>
              {dirty
                ? "Ungespeicherte Änderungen"
                : `Gespeicherter Plan · Version ${state?.plan?.revision}`}
            </span>
          </div>
        </>
      )}
      <details className="plan-evidence">
        <summary>Lernbelege pro Wort</summary>
        <WordProgress items={state?.mastery} />
      </details>
    </section>
  );
}
