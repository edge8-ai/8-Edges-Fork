"use client";
// Push a week on a stuck card (AH.7): Work Analytics' one button, which moves
// the card's date a week on through the board's own updateCard, so the guard,
// the audit row and the refresh are the board's. Undo puts the date back.
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MayProp } from "@/kernel/identity/may-prop";
import { updateCard } from "../lib/actions";

function plusWeek(from: string): string {
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 7);
  return d.toISOString().slice(0, 10);
}

export function StuckCardPush({ taskId, boardSlug, due, today, may }: { taskId: string; boardSlug: string; due: string | null; today: string; may: MayProp }) {
  const router = useRouter();
  const [state, setState] = useState<{ t: "idle" | "busy" } | { t: "done"; to: string } | { t: "err"; msg: string }>({ t: "idle" });
  const was = due ? due.slice(0, 10) : null;

  async function move(to: string | null, next: typeof state) {
    setState({ t: "busy" });
    const res = await updateCard(taskId, { dueDate: to }, boardSlug).catch(() => ({ ok: false as const, error: "That didn't go through." }));
    setState(res.ok ? next : { t: "err", msg: res.error });
    router.refresh();
  }

  // The may prop (ADR 0014). boards.open is the page's own atom, so today this
  // hides nothing: whether the reader may move this card is the board gate's
  // call, inside updateCard, which refuses a non-member and writes nothing.
  if (!may["boards.open"]) return null;
  if (state.t === "done")
    return (
      <span className="wb-stuck-acts">
        <span className="admin-home-msg">Due {state.to}</span>
        <button type="button" className="admin-btn admin-btn--sm" onClick={() => move(was, { t: "idle" })}>
          Undo
        </button>
      </span>
    );
  const to = plusWeek(was && was > today ? was : today);
  return (
    <span className="wb-stuck-acts">
      {state.t === "err" && <span className="u-err u-sm">{state.msg}</span>}
      <button type="button" className="admin-btn admin-btn--sm" disabled={state.t === "busy"} onClick={() => move(to, { t: "done", to })}>
        Push a week
      </button>
    </span>
  );
}
