"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

// One-time guided welcome shown on /team when the actor hasn't finished it.
// Purely presentational + a dismiss action; each step deep-links to the real
// page so the tour doubles as a checklist. `startOpen` comes from the server
// (metadata.onboarding_completed_at is null); "Replay" re-opens it client-side.
type Step = { ico: string; title: string; body: string; href?: string; cta?: string };

export function OnboardingWalkthrough({
  name,
  startOpen,
  onFinish,
}: {
  // The actor's greeting (S.16.17); null when they have no given name.
  name: string | null;
  startOpen: boolean;
  onFinish: (done: boolean) => Promise<void>;
}) {
  const steps: Step[] = [
    {
      ico: "◈",
      title: name ? `Welcome to 8 Edges, ${name}` : "Welcome to 8 Edges",
      body: "This is your workspace — time off, your profile, the team, and the ideas that shape what we build. Two minutes and you're set up.",
    },
    {
      ico: "☺",
      title: "Add your photo",
      body: "Put a face to your name for the directory and org chart. Click your avatar on the profile page to upload one.",
      href: "/team/profile",
      cta: "Open my profile",
    },
    {
      ico: "✎",
      title: "Confirm your details",
      body: "Check your preferred name, phone, and emergency contact. Everything employment-related is managed by your admin.",
      href: "/team/profile",
      cta: "Review details",
    },
    {
      ico: "☼",
      title: "How time off works",
      body: "Request leave here and your manager approves it in the same place. Your balance is always up to date.",
      href: "/team/time-off",
      cta: "See time off",
    },
    {
      ico: "⌥",
      title: "Meet the team",
      body: "The org chart shows who's who and who reports to whom. The directory has everyone's role.",
      href: "/team/org",
      cta: "View org chart",
    },
    {
      ico: "✦",
      title: "Share an idea",
      body: "What should we build? What have I learned? Answer either — build ideas come back as product plans, learnings go straight to the team feed.",
      href: "/team/ideas?compose=build",
      cta: "Share an idea",
    },
  ];

  const [open, setOpen] = useState(startOpen);
  const [i, setI] = useState(0);
  const [pending, startTransition] = useTransition();

  function finish() {
    setOpen(false);
    startTransition(async () => {
      await onFinish(true);
    });
  }

  if (!open) {
    return (
      <button className="admin-team-tour-replay" onClick={() => { setI(0); setOpen(true); }}>
        ↺ Replay the welcome tour
      </button>
    );
  }

  const step = steps[i];
  const last = i === steps.length - 1;

  return (
    <div className="admin-team-tour-scrim" role="dialog" aria-modal="true" aria-label="Welcome tour">
      <div className="admin-team-tour-card">
        <div className="admin-team-tour-ico" aria-hidden>{step.ico}</div>
        <h2 className="admin-team-tour-title">{step.title}</h2>
        <p className="admin-team-tour-body">{step.body}</p>

        {step.href && (
          <Link href={step.href} className="admin-btn admin-btn--primary admin-team-tour-cta">
            {step.cta}
          </Link>
        )}

        <div className="admin-team-tour-dots" aria-hidden>
          {steps.map((_, n) => (
            <span key={n} className={`admin-team-tour-dot${n === i ? " is-on" : ""}`} />
          ))}
        </div>

        <div className="admin-team-tour-nav">
          <button className="admin-team-tour-skip" onClick={finish} disabled={pending}>
            {last ? "" : "Skip"}
          </button>
          <div className="u-row">
            {i > 0 && (
              <button className="admin-btn admin-btn--sm" onClick={() => setI((n) => n - 1)}>Back</button>
            )}
            {last ? (
              <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={finish} disabled={pending}>
                Finish
              </button>
            ) : (
              <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={() => setI((n) => n + 1)}>
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
