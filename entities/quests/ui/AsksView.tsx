"use client";

// The Asks page (AK.2, ADR 0036; spec 2026-11-16 and its approved prototype):
// what teammates asked of you, what you asked of them, the asks open to anyone,
// and the asks that closed in the last two weeks (AK.8). The server read hands
// over the four lists already shaped, with no field for anyone still out; this
// component only draws them and wires the four moves to the quest actions it
// is given. There is no decline: a required ask cannot be declined (AK.9). After
// an answer the page refreshes and the ask leaves its list, so the row is kept
// here with the line saying where the answer went until the person moves on.
import { useMemo, useState, type ReactNode } from "react";
import { PageHead } from "@/kernel/ui/PageHead";
import type { AskOfYou, AsksPage, ClosedAsk } from "../lib/asks-read";
import type { BountyDraft } from "../lib/bounty-draft";
import type { Portrait } from "../lib/party-picker";
import { askMoves, waitingLabel, type AskActions } from "./asks-model";
import { AskOfYouRow, type Landed } from "./AskOfYouRow";
import { AskYouMadeCard } from "./AskYouMadeCard";
import { NewAskDrawer, type NewAskActions } from "./NewAskDrawer";

type List = "waiting" | "open" | "closed";
/** A row the reader just answered, with when it closed for one on the closed list. */
type Kept = { ask: AskOfYou; list: List; outcome: Landed; closedAt: string | null };

const keyOf = (ask: Pick<AskOfYou, "questId" | "headId">) => `${ask.questId}:${ask.headId}`;

function Section({ id, title, aside, children }: { id: string; title: string; aside: string; children: ReactNode }) {
  return (
    <section className="admin-card admin-section-card" aria-labelledby={id}>
      <div className="ak-section-head">
        <h2 id={id} className="ak-section-title">
          {title}
        </h2>
        <span className="ak-quiet">{aside}</span>
      </div>
      <div className="ak-section-body">{children}</div>
    </section>
  );
}

export function AsksView({
  page,
  now,
  actions,
  party,
  me,
  mayChooseRequired,
  draft = null,
}: {
  page: AsksPage;
  now: string;
  actions: AskActions & NewAskActions;
  /** Everyone on the team now, for the New ask drawer's Who. */
  party: Portrait[];
  me: Portrait;
  /** A manager or an admin: the drawer offers "Everyone asked should answer". */
  mayChooseRequired: boolean;
  /** An ask the assistant drafted (?draft=): the drawer opens with it filled in. */
  draft?: BountyDraft | null;
}) {
  const moves = useMemo(() => askMoves(actions), [actions]);
  // The drawer starts fresh each time it opens (its key), and opens at once on a draft.
  const [drawer, setDrawer] = useState<{ open: boolean; session: number }>({ open: draft !== null, session: 0 });
  const [draftLive, setDraftLive] = useState(draft !== null);
  const [kept, setKept] = useState<Record<string, Kept>>({});

  // A list as the server read it, with the asks the person just answered here
  // put back in their place, so the row they acted on does not vanish under them.
  const withKept = (list: List, asks: AskOfYou[]): AskOfYou[] => {
    const present = new Set(asks.map(keyOf));
    const back = Object.values(kept)
      .filter((k) => k.list === list && !present.has(keyOf(k.ask)))
      .map((k) => k.ask);
    return [...asks, ...back].sort((a, b) => a.dueAt.localeCompare(b.dueAt) || keyOf(a).localeCompare(keyOf(b)));
  };
  const waiting = withKept("waiting", page.waiting);
  const open = withKept("open", page.open);
  const stillWaiting = waiting.filter((a) => !kept[keyOf(a)]).length;
  // The closed list the same way: a late answer takes the ask off it on the refresh.
  const presentClosed = new Set(page.closed.map((c) => keyOf(c.ask)));
  const closed: ClosedAsk[] = [
    ...page.closed,
    ...Object.values(kept).flatMap((k): ClosedAsk[] =>
      k.list === "closed" && k.closedAt !== null && !presentClosed.has(keyOf(k.ask)) ? [{ kind: "of_you", closedAt: k.closedAt, ask: k.ask }] : [],
    ),
  ].sort((a, b) => Date.parse(b.closedAt) - Date.parse(a.closedAt) || keyOf(a.ask).localeCompare(keyOf(b.ask)));

  const rowOf = (list: List, ask: AskOfYou, closedAt: string | null = null) => (
    <AskOfYouRow
      key={keyOf(ask)}
      ask={ask}
      list={list}
      closedAt={closedAt}
      now={now}
      moves={moves}
      landed={kept[keyOf(ask)]?.outcome ?? null}
      onLanded={(outcome) => setKept((was) => ({ ...was, [keyOf(ask)]: { ask, list, outcome, closedAt } }))}
    />
  );

  return (
    <div className="ak-page">
      <PageHead
        title="Asks"
        sub="What teammates asked of you, and what you asked of them. Answers carry your name."
        action={
          <button type="button" className="admin-btn admin-btn--primary" onClick={() => setDrawer((was) => ({ open: true, session: was.session + 1 }))}>
            New ask
          </button>
        }
      />

      <Section id="ak-waiting" title="Waiting on you" aside={waitingLabel(stillWaiting)}>
        {waiting.length === 0 ? <p className="ak-empty">When a manager or an admin asks something of you, it shows here.</p> : waiting.map((ask) => rowOf("waiting", ask))}
      </Section>

      <Section id="ak-mine" title="You asked" aside={page.asked.length === 0 ? "None open" : `${page.asked.length} open`}>
        {page.asked.length === 0 ? (
          <p className="ak-empty">Asks you make show here, with every answer.</p>
        ) : (
          page.asked.map((ask) => <AskYouMadeCard key={keyOf(ask)} ask={ask} now={now} moves={moves} />)
        )}
      </Section>

      <Section id="ak-open" title="Open to anyone" aside="Nobody is expected to answer these">
        {open.length === 0 ? <p className="ak-empty">Nothing open to anyone right now.</p> : open.map((ask) => rowOf("open", ask))}
      </Section>

      {closed.length > 0 && (
        <Section id="ak-closed" title="Closed in the last two weeks" aside="You can still answer. It shows as late.">
          {closed.map((c) =>
            c.kind === "of_you" ? rowOf("closed", c.ask, c.closedAt) : <AskYouMadeCard key={keyOf(c.ask)} ask={c.ask} now={now} moves={moves} closedAt={c.closedAt} />,
          )}
        </Section>
      )}

      <NewAskDrawer
        key={drawer.session}
        open={drawer.open}
        onClose={() => setDrawer((was) => ({ ...was, open: false }))}
        party={party}
        me={me}
        now={now}
        actions={actions}
        mayChooseRequired={mayChooseRequired}
        draft={draftLive && drawer.session === 0 ? draft : null}
        onDraftDone={() => setDraftLive(false)}
      />
    </div>
  );
}
