import { notifyEo, notifyMarketing, notifyProduct } from "@/kernel/messaging/lark";

// A survey whose answers a team needs to read as they arrive, not only the
// one-line notice every response sends to Operations. The survey names the
// chat in its own row (surveys.metadata.notify_chat), so turning this on for
// another survey is a data change, never a code change: the 8 Edges setup
// picker posts each client's module choices to the Infinite Leverage chat.

const CHATS = { product: notifyProduct, eo: notifyEo, revenue: notifyMarketing } as const;
type Chat = keyof typeof CHATS;

function chatOf(metadata: unknown): Chat | null {
  const chat = (metadata as { notify_chat?: unknown } | null)?.notify_chat;
  return typeof chat === "string" && chat in CHATS ? (chat as Chat) : null;
}

/** The message: the survey, who answered, then each question and its answer. */
export function surveyResultsMessage(
  surveyName: string,
  who: string,
  fields: { id: string; label: string }[],
  answers: { field_id: string; value: string }[],
): string {
  const label = new Map(fields.map((f) => [f.id, f.label]));
  const lines = answers.map((a) => `${label.get(a.field_id) ?? "Answer"}: ${a.value}`);
  return [`📋 ${surveyName}`, who, "", ...lines].join("\n");
}

/**
 * Posts the full answers to the survey's chat, when it names one. The response
 * is already saved, so a failure is logged and never reaches the respondent.
 */
export async function notifySurveyChat(
  survey: { name: string; metadata: unknown },
  who: string,
  fields: { id: string; label: string }[],
  answers: { field_id: string; value: string }[],
): Promise<void> {
  const chat = chatOf(survey.metadata);
  if (!chat) return;
  try {
    await CHATS[chat](surveyResultsMessage(survey.name, who, fields, answers));
  } catch (err) {
    console.error(`[survey] ${chat} chat notice failed:`, err);
  }
}
