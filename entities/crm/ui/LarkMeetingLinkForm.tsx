"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SurfaceLink as Link } from "@/kernel/shell/SurfaceLink";
import { useSurfaceBase } from "@/kernel/shell/surface-client";
import { addLarkMeeting } from "@/entities/crm/lib/lark-meeting-actions";
import type { CompanyOption } from "@/entities/crm/lib/meetings";
import type { MayProp } from "@/kernel/identity/may-prop";

// Z.5: paste a Lark Minutes link and the call becomes a client meeting with
// its transcript. Sits on the Client Meetings list in the house form classes.
// A loaded transcript goes straight to the new meeting, as the upload form
// does; a recording Lark will not let us read stays here with the message
// saying whom to share it with, and a link to the meeting that kept the link.
// Shown only to a viewer who holds crm.calls, the atom the action asks for.
export function LarkMeetingLinkForm({ companies, may }: { companies: CompanyOption[]; may: MayProp }) {
  const router = useRouter();
  const surface = useSurfaceBase();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "ok" | "warn" | "err"; text: string; meetingId?: string } | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const form = formRef.current;
    if (!form) return;
    setMsg(null);
    const fd = new FormData(form);
    start(async () => {
      let res: Awaited<ReturnType<typeof addLarkMeeting>>;
      try {
        res = await addLarkMeeting(fd);
      } catch (err) {
        // Next's own redirect (a signed-out viewer) must still reach the router.
        if (String((err as { digest?: unknown } | null)?.digest ?? "").startsWith("NEXT_")) throw err;
        setMsg({ tone: "err", text: "The meeting could not be added: the server did not answer. Try again." });
        return;
      }
      if (!res.ok) {
        setMsg({ tone: "err", text: res.error });
        return;
      }
      if (res.state === "loaded" || res.state === "already-loaded") {
        setMsg({ tone: "ok", text: res.message, meetingId: res.meetingId });
        router.push(`${surface}/revenue/meetings/${res.meetingId}`);
        return;
      }
      setMsg({ tone: "warn", text: res.message, meetingId: res.meetingId });
      router.refresh();
    });
  }

  if (!may["crm.calls"]) return null;
  return (
    <div className="admin-card admin-section-card u-mb-4">
      <h2 className="admin-card-title admin-card-title--compact">Add a meeting from Lark</h2>
      <form ref={formRef} className="admin-form" onSubmit={handleSubmit}>
        {msg && (
          <div className={`admin-alert admin-alert--${msg.tone}`} role={msg.tone === "err" ? "alert" : "status"}>
            {msg.text}
            {msg.meetingId && msg.tone === "warn" ? (
              <>
                {" "}
                <Link href={`/admin/revenue/meetings/${msg.meetingId}`}>Open the meeting</Link>
              </>
            ) : null}
          </div>
        )}
        <div className="u-row u-wrap u-gap-3 u-items-end">
          <div className="admin-field u-flex-2">
            <label className="admin-label" htmlFor="lm-url">Lark Minutes link</label>
            <input
              id="lm-url"
              name="url"
              type="url"
              inputMode="url"
              className="admin-input"
              placeholder="https://…larksuite.com/minutes/…"
              required
              autoComplete="off"
            />
          </div>
          <div className="admin-field u-flex-1">
            <label className="admin-label" htmlFor="lm-company">Client</label>
            <select id="lm-company" name="companyId" className="admin-input" required defaultValue="">
              <option value="" disabled>Choose a client…</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="admin-field u-flex-1">
            <label className="admin-label" htmlFor="lm-type">Type</label>
            <select id="lm-type" name="meetingType" className="admin-input" defaultValue="Sales">
              <option value="Sales">Sales call</option>
              <option value="General">General</option>
            </select>
          </div>
          <button type="submit" className="admin-btn admin-btn--primary" disabled={pending}>
            {pending ? "Reading from Lark…" : "Add from Lark"}
          </button>
        </div>
        <p className="admin-hint u-mb-0">
          The transcript is read from Lark and summarized. A sales call then gets a drafted proposal and follow-up.
        </p>
      </form>
    </div>
  );
}
