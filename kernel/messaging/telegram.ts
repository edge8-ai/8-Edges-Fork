// Telegram notifications. Reuses the same bot + chat as aio-website
// (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID). No-ops silently when env unset.

import { heldInShadow } from "@/kernel/audit/run-context";

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

export async function sendTelegramMessage(text: string): Promise<void> {
  // A routine in shadow mode sends nothing (Z.17); the run's log says what it held back.
  if (heldInShadow("telegram", "a message to the Telegram chat")) return;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token || !chatId) {
    console.warn("[telegram] env vars not configured; skipping");
    return;
  }

  try {
    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
      }),
    });
  } catch (err) {
    console.error("[telegram] send failed", err);
  }
}
