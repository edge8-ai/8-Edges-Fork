"use client";

// The manager report's quest picker (QS.3; ADR 0020): choosing a Bounty opens
// its report, as the approved prototype draws it, with no Show button. It is a
// GET form, so the choice is an address like any other (?quest=) and Enter
// still submits it; the one thing the browser adds is opening on change. There
// is no person picker anywhere on the page: a quest is the only way in.
import { useRouter } from "next/navigation";

export type QuestChoice = { id: string; label: string };

export function QuestPicker({ basePath, choices, pickedId }: { basePath: string; choices: QuestChoice[]; pickedId: string | null }) {
  const router = useRouter();
  return (
    <form method="get" action={basePath} className="qr-pick">
      <label className="qr-pick-label" htmlFor="quest-report-quest">
        Bounty
      </label>
      <select
        id="quest-report-quest"
        name="quest"
        className="admin-select qr-pick-select"
        defaultValue={pickedId ?? undefined}
        onChange={(e) => router.push(`${basePath}?quest=${encodeURIComponent(e.target.value)}`)}
      >
        {choices.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
    </form>
  );
}
