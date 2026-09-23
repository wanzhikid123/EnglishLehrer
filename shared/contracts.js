import { z } from "zod";
const id = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[\w-]+$/);
const text = z.string().max(500);
export const elementSchema = z.object({
  id,
  type: z.enum(["text", "shape", "emoji"]),
  text,
  translation: text,
  shape: z.enum(["circle", "square", "triangle", "star", "none"]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  x: z.number().min(0).max(90),
  y: z.number().min(0).max(90),
  width: z.number().min(5).max(100),
  height: z.number().min(5).max(100),
  fontSize: z.number().min(16).max(88),
  highlight: z.boolean(),
});
export const questionSchema = z.object({
  id,
  mode: z
    .enum([
      "choice",
      "repeat",
      "german_choice",
      "picture_speak",
      "german_speak",
    ])
    .default("choice"),
  prompt: text,
  knowledge: z.string().min(1).max(100),
  options: z
    .array(
      z.object({
        id,
        label: z.string().min(1).max(80),
        color: z.string().regex(/^(#[0-9a-fA-F]{6})?$/),
        emoji: z.string().max(12),
        aliases: z.array(z.string().max(80)).max(10),
      }),
    )
    .min(1)
    .max(4),
  correctOptionId: id,
  hint: text,
});
export const boardToolSchema = z.object({
  expectedRevision: z.number().int().min(0),
  stepId: id,
  title: text,
  operations: z
    .array(
      z.object({
        action: z.enum(["upsert", "remove", "clear"]),
        id: id.nullable(),
        element: elementSchema.nullable(),
      }),
    )
    .max(25),
  question: questionSchema.nullable(),
  taught: z
    .array(
      z.object({
        text: z.string().min(1).max(100),
        kind: z.enum(["word", "phrase"]),
      }),
    )
    .max(12),
});
export const answerSchema = z.object({
  eventId: id,
  questionId: id,
  optionId: id.nullable(),
  mode: z.enum(["click", "voice"]),
  uncertain: z.boolean(),
  hinted: z.boolean(),
});
export const voiceAnswerSchema = answerSchema.omit({
  eventId: true,
  mode: true,
});
export const hintToolSchema = z.object({ questionId: id });
export const endToolSchema = z.object({
  reason: z.enum(["completed", "ended_early"]),
});
export const eventIdSchema = id;

export const practiceToolSchema = z.object({
  expectedRevision: z.number().int().min(0),
  mode: z.enum(["repeat", "german_choice", "picture_speak", "german_speak"]),
  word: z.string().trim().min(1).max(80),
  german: z.string().trim().min(1).max(80),
  distractors: z.array(z.string().trim().min(1).max(80)).max(3),
});
export const speechTempoSchema = z.object({
  tempo: z.number().int().min(1).max(5),
});

export const topicSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
  name: z.string().trim().min(1).max(100).describe("Themenname auf Deutsch"),
  english: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .describe("Thementitel auf Englisch"),
  icon: z.string().min(1).max(12),
  color: z.enum(["peach", "lavender", "mint", "sand"]),
  goal: z.string().trim().min(1).max(500).describe("Lernziel auf Deutsch"),
  words: z
    .array(z.string().trim().min(1).max(80))
    .min(1)
    .max(80)
    .describe("Lernwörter auf Englisch"),
  phrases: z
    .array(z.string().trim().min(1).max(150))
    .max(40)
    .describe("Beispielsätze auf Englisch"),
  level: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .describe("Niveau der Themenkarte auf Deutsch"),
  teachingNotes: z
    .string()
    .max(2000)
    .describe("Unterrichtshinweise auf Deutsch"),
  coverage: z.enum(["small_steps", "all"]),
});
export const topicToolSchema = z.object({
  expectedRevision: z.number().int().min(0),
  topic: topicSchema,
});
export const preparationSchema = z.object({
  generation: z.number().int().min(0).default(0),
  eventId: id,
  message: z.string().trim().min(1).max(4000),
  topicId: z.string().max(64).nullable(),
  lessonId: id.nullable(),
});
export const topicDeletionToolSchema = z.object({
  topicId: topicSchema.shape.id,
  expectedRevision: z.number().int().min(1),
});
export const topicDeletionSchema = z.object({
  expectedRevision: z.number().int().min(1),
  confirmed: z.literal(true),
  turnId: id.nullable().default(null),
});
export const clearPreparationSchema = z.object({
  expectedGeneration: z.number().int().min(0),
  confirmed: z.literal(true),
});
