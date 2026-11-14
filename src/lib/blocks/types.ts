import { z } from "zod";

/** Limits an agent's interactive block must respect, so a card stays readable in a thread. */
export const BLOCK_LIMITS = {
  confirmActions: 4,
  choiceOptions: 20,
  formFields: 20,
  quickReplies: 8,
  label: 120,
  title: 200,
  preview: 20_000,
} as const;

const id = z.string().min(1).max(80);
const label = z.string().trim().min(1).max(BLOCK_LIMITS.label);
const title = z.string().trim().min(1).max(BLOCK_LIMITS.title);

export const confirmActionSchema = z.object({
  id,
  label,
  style: z.enum(["primary", "neutral", "danger"]).default("neutral"),
});

export const confirmBlockSchema = z.object({
  kind: z.literal("confirm"),
  id,
  title,
  preview: z.string().max(BLOCK_LIMITS.preview).optional(),
  actions: z.array(confirmActionSchema).min(1).max(BLOCK_LIMITS.confirmActions),
});

export const choiceOptionSchema = z.object({
  id,
  label,
  meta: z.string().max(BLOCK_LIMITS.label).optional(),
});

export const choiceBlockSchema = z.object({
  kind: z.literal("choice"),
  id,
  title,
  multiple: z.boolean().default(false),
  options: z.array(choiceOptionSchema).min(1).max(BLOCK_LIMITS.choiceOptions),
  submitLabel: label.optional(),
});

const fieldBase = {
  id,
  label,
  required: z.boolean().default(false),
  hint: z.string().max(BLOCK_LIMITS.label).optional(),
};

const textual = {
  ...fieldBase,
  placeholder: z.string().max(BLOCK_LIMITS.label).optional(),
  /** A JavaScript regular expression the whole value must match. */
  pattern: z.string().max(200).optional(),
  patternMessage: z.string().max(BLOCK_LIMITS.label).optional(),
  maxLength: z.number().int().min(1).max(10_000).optional(),
};

export const formFieldSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), ...textual }),
  z.object({ type: z.literal("textarea"), ...textual }),
  z.object({ type: z.literal("select"), ...fieldBase, options: z.array(label).min(1).max(50) }),
  z.object({ type: z.literal("segmented"), ...fieldBase, options: z.array(label).min(2).max(6) }),
  z.object({ type: z.literal("date"), ...fieldBase }),
]);

export const formBlockSchema = z.object({
  kind: z.literal("form"),
  id,
  title,
  fields: z.array(formFieldSchema).min(1).max(BLOCK_LIMITS.formFields),
  submitLabel: label.optional(),
});

export const quickRepliesBlockSchema = z.object({
  kind: z.literal("quick_replies"),
  id,
  replies: z.array(label).min(1).max(BLOCK_LIMITS.quickReplies),
});

/** What a tool call carries when an agent asks the person something. */
export const interactiveBlockSchema = z.discriminatedUnion("kind", [
  confirmBlockSchema,
  choiceBlockSchema,
  formBlockSchema,
  quickRepliesBlockSchema,
]);

export type ConfirmAction = z.infer<typeof confirmActionSchema>;
export type ConfirmBlock = z.infer<typeof confirmBlockSchema>;
export type ChoiceOption = z.infer<typeof choiceOptionSchema>;
export type ChoiceBlock = z.infer<typeof choiceBlockSchema>;
export type FormField = z.infer<typeof formFieldSchema>;
export type FormBlock = z.infer<typeof formBlockSchema>;
export type QuickRepliesBlock = z.infer<typeof quickRepliesBlockSchema>;
export type InteractiveBlock = z.infer<typeof interactiveBlockSchema>;

export interface MarkdownBlock {
  kind: "markdown";
  text: string;
}

export interface CodeBlock {
  kind: "code";
  /** Lowercased fence language, or "" when the fence named none. */
  lang: string;
  code: string;
}

export interface DiffBlock {
  kind: "diff";
  patch: string;
}

export type TableAlign = "left" | "center" | "right" | null;

export interface TableBlock {
  kind: "table";
  header: string[];
  align: TableAlign[];
  /** Every row has exactly `header.length` cells, each still inline markdown. */
  rows: string[][];
}

export interface VisualBlock {
  kind: "visual";
  title: string;
  html: string;
}

export type ContentBlock = MarkdownBlock | CodeBlock | DiffBlock | TableBlock | VisualBlock;

export type Block = ContentBlock | InteractiveBlock;

export type BlockStatus = "pending" | "answered" | "expired";

/** The value each interactive block hands to `onAnswer`, keyed by block kind. */
export interface AnswerByKind {
  confirm: { actionId: string };
  choice: { selected: string[] };
  form: { values: Record<string, string> };
  quick_replies: { reply: string };
}

export type BlockAnswer = AnswerByKind[keyof AnswerByKind];

/** Props every interactive block takes. The host owns status and the stored answer. */
export interface InteractiveProps<K extends keyof AnswerByKind> {
  status: BlockStatus;
  /** The stored answer, so a restored "answered" block still shows what was chosen. */
  answer?: AnswerByKind[K];
  onAnswer: (value: AnswerByKind[K]) => void;
}

/** A stored answer, tagged with its block kind so a host can keep answers of every kind in one map. */
export type AnsweredBlock = {
  [K in keyof AnswerByKind]: { blockId: string; kind: K; value: AnswerByKind[K] };
}[keyof AnswerByKind];

/** What a thread hands the renderer so interactive blocks can read and report their state. */
export interface BlockHost {
  statusOf: (blockId: string) => BlockStatus;
  answerOf: (blockId: string) => AnsweredBlock | undefined;
  onAnswer: (answer: AnsweredBlock) => void;
}
