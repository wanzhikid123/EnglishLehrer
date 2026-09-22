import { randomUUID } from "node:crypto";
import { practiceToolSchema } from "../shared/contracts.js";
import { AppError } from "./store.js";
import { findEmoji } from "./emoji.js";

export const isSpokenPractice = (question) =>
  ["repeat", "picture_speak", "german_speak"].includes(question?.mode);
const colors = {
  red: "#ed5c54",
  blue: "#5599dd",
  yellow: "#f4cd3d",
  green: "#63a45c",
  orange: "#f19538",
  purple: "#9466bf",
  pink: "#ee9fc5",
  black: "#252525",
  white: "#ffffff",
  brown: "#986238",
  gray: "#999999",
  grey: "#999999",
};

export function practiceBoard(raw, topic) {
  const args = practiceToolSchema.parse(raw);
  const { word, german } = args;
  const color =
    topic.id === "colors" ||
    topic.words.every((item) => colors[item.toLowerCase()])
      ? colors[word.toLowerCase()]
      : null;
  const mode =
    args.mode === "picture_speak" &&
    !color &&
    !findEmoji(word) &&
    !findEmoji(german)
      ? "german_speak"
      : args.mode;
  if (
    ![...topic.words, ...topic.phrases].some(
      (item) => item.toLowerCase() === word.toLowerCase(),
    )
  )
    throw new AppError(
      "Bitte ein Wort oder einen Satz aus dem aktuellen Thema verwenden.",
    );
  const labels = [...new Set([word, ...args.distractors])];
  if (mode === "german_choice" && labels.length < 2)
    throw new AppError(
      "Bitte mindestens ein anderes gelerntes Wort als Auswahl ergänzen.",
    );
  // Rotate the correct answer; never make position one the answer to every exercise.
  if (mode === "german_choice") {
    const shift = args.expectedRevision % labels.length;
    labels.push(...labels.splice(0, shift));
  }
  const prompt = {
    repeat: "Hör zu und sprich nach.",
    german_choice: `Welches englische Wort bedeutet „${german}“?`,
    picture_speak: color
      ? "Welche Farbe siehst du? Sag das englische Wort."
      : "Was siehst du? Sag das englische Wort.",
    german_speak: `Wie heißt „${german}“ auf Englisch?`,
  }[mode];
  const element = (id, type, text, x, y, width, height) => ({
    id,
    type,
    text,
    translation: "",
    shape: "none",
    color: "#354f3c",
    x,
    y,
    width,
    height,
    fontSize: 70,
    highlight: false,
  });
  const picture = (x, y, width, height) => ({
    ...element(
      "practice-picture",
      color ? "shape" : "emoji",
      color ? `${word} ball` : word,
      x,
      y,
      width,
      height,
    ),
    ...(color ? { color, shape: "circle" } : {}),
    translation: german,
  });
  const elements =
    mode === "picture_speak"
      ? [picture(20, 3, 60, 90)]
      : mode === "repeat"
        ? color || findEmoji(word) || findEmoji(german)
          ? [
              picture(25, 0, 50, 58),
              {
                ...element("practice-word", "text", word, 5, 61, 90, 23),
                fontSize: 52,
              },
              {
                ...element("practice-meaning", "text", german, 5, 85, 90, 14),
                fontSize: 24,
              },
            ]
          : [
              element("practice-word", "text", word, 5, 10, 90, 55),
              {
                ...element("practice-meaning", "text", german, 5, 68, 90, 25),
                fontSize: 30,
              },
            ]
        : [element("practice-meaning", "text", german, 5, 20, 90, 60)];
  const qid = `practice-${randomUUID()}`;
  return {
    expectedRevision: args.expectedRevision,
    stepId: qid,
    title: {
      repeat: "Sprich mir nach",
      german_choice: "Hören & wählen",
      picture_speak: "Schauen & sprechen",
      german_speak: "Deutsch → Englisch",
    }[mode],
    operations: [
      { action: "clear", id: null, element: null },
      ...elements.map((element) => ({
        action: "upsert",
        id: element.id,
        element,
      })),
    ],
    question: {
      id: qid,
      mode,
      prompt,
      knowledge: word,
      options: (mode === "german_choice" ? labels : [word]).map(
        (label, index) => ({
          id: `answer-${index}`,
          label,
          aliases: [],
          color: "",
          emoji: "",
        }),
      ),
      correctOptionId: `answer-${mode === "german_choice" ? labels.indexOf(word) : 0}`,
      hint: `Hör zu: ${word}. Sprich es jetzt nach.`,
    },
    taught: [{ text: word, kind: word.includes(" ") ? "phrase" : "word" }],
  };
}
