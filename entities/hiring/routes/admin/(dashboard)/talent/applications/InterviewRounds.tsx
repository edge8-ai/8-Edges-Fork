"use client";

import { useEffect, useState } from "react";
import { formatDate } from "@/kernel/ui/format";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import { Badge } from "@/kernel/ui/Badge";
import { ROUND_MODES } from "@/entities/hiring/lib/interview-panel";
import {
  deleteInterviewRound,
  getInterviewRounds,
  listTeamMembers,
  type InterviewRound,
  type TeamOption,
} from "./interview-actions";
import { TranscriptPanel } from "./InterviewTranscript";
import { PanelSeatRow } from "./InterviewPanelSeat";
import { AddSeatControl, AddRoundForm } from "./InterviewRoundForms";

const MODE_LABEL = new Map<string, string>(ROUND_MODES.map((m) => [m.value, m.label]));

// Interview journey for one application: rounds (each with its panel, transcript,
// and scorecards) plus an add-round form. Loads its own data on open, mirroring
// the lazy loads elsewhere in the manage drawer.
export function InterviewRounds({ applicationId }: { applicationId: string }) {
  const [rounds, setRounds] = useState<InterviewRound[] | null>(null);
  const [team, setTeam] = useState<TeamOption[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  async function reload() {
    const r = await getInterviewRounds(applicationId);
    if (r.ok) setRounds(r.rounds);
    else setErr(r.error);
  }

  useEffect(() => {
    let live = true;
    setRounds(null);
    setErr(null);
    getInterviewRounds(applicationId).then((r) => {
      if (!live) return;
      if (r.ok) setRounds(r.rounds);
      else setErr(r.error);
    });
    listTeamMembers().then((r) => {
      if (live && r.ok) setTeam(r.members);
    });
    return () => {
      live = false;
    };
  }, [applicationId]);

  const teamById = new Map(team.map((t) => [t.id, t.name]));

  return (
    <div className="u-mt-4">
      <div className="admin-label u-row u-between u-mb-2">
        <span>Interview journey</span>
        {rounds && rounds.length > 0 && (
          <span className="admin-cell-muted">
            {rounds.length} round{rounds.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {err && <div className="admin-alert admin-alert--err">{err}</div>}
      {rounds === null && !err && <div className="admin-hint">Loading…</div>}
      {rounds && rounds.length === 0 && <div className="admin-empty">No interview rounds yet.</div>}

      {rounds && rounds.length > 0 && (
        <ol className="u-stack u-gap-3 u-m-0 u-p-0 u-list-plain">
          {rounds.map((round, i) => (
            <RoundCard key={round.id} index={i} round={round} teamById={teamById} onChange={reload} />
          ))}
        </ol>
      )}

      {adding ? (
        <AddRoundForm
          applicationId={applicationId}
          team={team}
          onDone={async () => {
            setAdding(false);
            await reload();
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <div className="u-mt-3">
          <button type="button" className="admin-btn admin-btn--sm" onClick={() => setAdding(true)}>
            + Add round
          </button>
        </div>
      )}
    </div>
  );
}

function RoundCard({
  index,
  round,
  teamById,
  onChange,
}: {
  index: number;
  round: InterviewRound;
  teamById: Map<string, string>;
  onChange: () => Promise<void>;
}) {
  const humans = round.seats.filter((s) => !s.isAi);
  const submitted = humans.filter((s) => s.scorecard?.submittedAt).length;
  // Blind-first: the AI seat is revealed only once every human on this round has
  // submitted. A round with no humans never reveals (there is nobody to anchor).
  const humansAllIn = humans.length > 0 && humans.every((s) => s.scorecard?.submittedAt);
  const humanScorecards = humans.map((s) => s.scorecard).filter((s): s is NonNullable<typeof s> => Boolean(s));

  return (
    <li className="u-p-4 admin-box">
      <div className="u-row u-wrap u-mb-2">
        <span
          className="admin-badge-inverse"
        >
          {index + 1}
        </span>
        <span className="admin-cell-strong">{round.title || "Interview"}</span>
        {round.status !== "scheduled" && <Badge tone={round.status === "cancelled" ? "warn" : "ok"}>{round.status}</Badge>}
        <span className="admin-cell-muted">
          {MODE_LABEL.get(round.mode) || round.mode}
          {round.scheduledAt ? ` · ${formatDate(round.scheduledAt)}` : ""}
        </span>
        <span className="admin-cell-muted u-ml-auto u-sm">
          {submitted}/{humans.length} scorecard{humans.length === 1 ? "" : "s"} in
        </span>
        <ConfirmButton
          label="Delete"
          className="admin-btn admin-btn--sm"
          title="Delete this interview round?"
          body="Its panel seats and scorecards are deleted with it. This cannot be undone."
          confirmLabel="Delete round"
          onConfirm={() => deleteInterviewRound(round.id)}
          onDone={() => void onChange()}
        />
      </div>

      <TranscriptPanel round={round} onChange={onChange} />

      <div className="u-stack u-mt-3">
        {round.seats.map((seat) => (
          <PanelSeatRow
            key={seat.interviewerId}
            round={round}
            seat={seat}
            humansAllIn={humansAllIn}
            humanScorecards={humanScorecards}
            hasTranscript={Boolean(round.transcriptDocId)}
            onChange={onChange}
          />
        ))}
      </div>

      <AddSeatControl round={round} teamById={teamById} onChange={onChange} />
    </li>
  );
}
