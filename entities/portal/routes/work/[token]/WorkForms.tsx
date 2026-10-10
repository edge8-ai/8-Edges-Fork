"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./work.module.css";
import { submitEstimate, submitWork } from "./actions";

export function EstimateForm({ token }: { token: string }) {
  const router = useRouter();
  const [hours, setHours] = useState("");
  const [plan, setPlan] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const r = await submitEstimate({ token, estimatedHours: Number(hours), plan, website });
    setSaving(false);
    if (!r.ok) {
      // Stale tab: the request already moved past the estimate step. Pull the
      // current state in rather than leaving the contractor on a dead end.
      if (r.stale) {
        setError("Your estimate was already approved — loading your next step…");
        router.refresh();
        return;
      }
      setError(r.error);
      return;
    }
    router.refresh();
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <label className={styles.field}>
        <span>Estimated hours</span>
        <input
          type="number"
          min="0.25"
          step="0.25"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          required
        />
      </label>
      <label className={styles.field}>
        <span>Your plan to complete it</span>
        <textarea
          rows={6}
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
          placeholder="Steps, tools, anything you need from us, and when you can deliver."
          required
        />
      </label>
      <label className={styles.hp} aria-hidden="true">
        <span>Website</span>
        <input type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </label>
      {error && <div className={styles.error}>{error}</div>}
      <button type="submit" className={styles.submit} disabled={saving}>
        {saving ? "Sending…" : "Submit estimate"}
      </button>
    </form>
  );
}

export function WorkSubmissionForm({ token }: { token: string }) {
  const router = useRouter();
  const [hours, setHours] = useState("");
  const [overtime, setOvertime] = useState("0");
  const [summary, setSummary] = useState("");
  const [link, setLink] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const r = await submitWork({
      token,
      actualHours: Number(hours),
      overtimeHours: Number(overtime || 0),
      summary,
      link,
      website,
    });
    setSaving(false);
    if (!r.ok) {
      // Stale tab: the request already moved past the approved step. Refresh
      // into whatever state it's in now instead of showing a dead end.
      if (r.stale) {
        setError("This request has already moved on — refreshing…");
        router.refresh();
        return;
      }
      setError(r.error);
      return;
    }
    router.refresh();
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <label className={styles.field}>
        <span>Actual hours worked</span>
        <input
          type="number"
          min="0.25"
          step="0.25"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          required
        />
      </label>
      <label className={styles.field}>
        <span>Overtime hours (if any)</span>
        <input type="number" min="0" step="0.25" value={overtime} onChange={(e) => setOvertime(e.target.value)} />
      </label>
      <label className={styles.field}>
        <span>What you did</span>
        <textarea
          rows={6}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="A short explanation of the work done."
          required
        />
      </label>
      <label className={styles.field}>
        <span>Supporting link (Figma, Drive, staging URL…)</span>
        <input
          type="url"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://…"
        />
      </label>
      <label className={styles.hp} aria-hidden="true">
        <span>Website</span>
        <input type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </label>
      {error && <div className={styles.error}>{error}</div>}
      <button type="submit" className={styles.submit} disabled={saving}>
        {saving ? "Sending…" : "Submit work"}
      </button>
    </form>
  );
}
