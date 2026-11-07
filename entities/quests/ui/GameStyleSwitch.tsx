"use client";

// The game style switch in the Quests page head (QS.11; Khoa, 2026-10-21).
// Each person turns the game style on or off for themselves; nobody else's
// page changes. It flips at once and saves behind; if the save fails it flips
// back and says so, because a switch that shows a state it did not keep would
// be a quiet lie.
import { useState, useTransition } from "react";
import type { Result } from "@/kernel/data/result";

export function GameStyleSwitch({ on, onChange, setGameStyle }: { on: boolean; onChange: (on: boolean) => void; setGameStyle: (on: boolean) => Promise<Result> }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const flip = () => {
    const next = !on;
    setError(null);
    onChange(next);
    start(async () => {
      const saved = await setGameStyle(next);
      if (!saved.ok) {
        onChange(!next);
        setError(saved.error);
      }
    });
  };
  return (
    <div className="qs-style">
      <span className="qs-style-note" id="qs-style-note">
        {error ?? "Only changes your view"}
      </span>
      <button type="button" className="qs-style-switch" role="switch" aria-checked={on} aria-describedby="qs-style-note" aria-busy={pending} onClick={flip}>
        <span className="qs-style-track" aria-hidden="true" />
        Game style <span className="qs-style-state">{on ? "On" : "Off"}</span>
      </button>
    </div>
  );
}
