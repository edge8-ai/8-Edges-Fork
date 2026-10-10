import { requirePermission } from "@/kernel/identity/access-request";
import Link from "next/link";
import { notFound } from "next/navigation";
import { remark } from "remark";
import remarkHtml from "remark-html";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { getSharedIdea, type SharedIdea } from "@/entities/team/lib/data";
import { Icon } from "@/kernel/ui/Icon";
import { EditablePlan } from "./EditablePlan";
import { ExternalLink } from "@/kernel/ui/ExternalLink";
import { avatarTone, planWithoutPitch, sparkHook, sparkKind } from "../sparks-model";
import { admireFaces } from "../spark-faces";
import { SparkHead } from "./SparkHead";
import { SparkTalk } from "./SparkTalk";
import { joinNames, readSparkSignals, socialByIdea, socialFor, sparkStage, stagesReached } from "@/entities/ideas";
import { cardsForIdeas, pickableBoards } from "@/entities/boards";
import { PickUp } from "./PickUp";
import { formatDate, initials } from "@/kernel/ui/format";
import { Tabs } from "@/kernel/ui/Tabs";

export const metadata = { title: "Spark" };

const D_SECTIONS: { key: keyof SharedIdea; d: string; label: string }[] = [
  { key: "problem", d: "Define", label: "The problem" },
  { key: "data_needed", d: "Discover", label: "Data it needs" },
  { key: "workflow", d: "Design", label: "The workflow" },
  { key: "roi", d: "Determine", label: "Expected ROI" },
];

// One spark (ID.2.4). Ideas and learnings are company-visible (Learn and
// Share); getSharedIdea hides archived rows from everyone but their submitter.
// A spark may be one line and nothing else, so every section below the head
// appears only when there is something in it.

export default async function SparkPage(props: { params: Promise<{ id: string }> }) {
  // The page's declared permission (entities/team/permissions.ts, ADR 0013).
  await requirePermission("team.ideas");
  const params = await props.params;
  const actor = await requireTeamMember();
  const idea = await getSharedIdea(actor, params.id);
  if (!idea) notFound();

  const isOwner = idea.person_id === actor.personId;
  const isLearning = sparkKind(idea) === "learning";
  const hasFiveD = D_SECTIONS.some((s) => String(idea[s.key] ?? "").trim());

  // What came back on this spark (ID.2.7): faces for admires and me-toos, the
  // builds in order, and whether the viewer has answered.
  const signals = await readSparkSignals();
  const reactions = signals.reactions.filter((r) => r.ideaId === idea.id);
  const builds = signals.builds.filter((b) => b.ideaId === idea.id);
  const social = socialFor(idea.id, socialByIdea(reactions, builds));
  // Picked up and Shipped (ID.2.8): the card the spark became, if any, and
  // where a teammate could put one if not. A learning is tried, never picked up.
  const cards = await cardsForIdeas([idea.id]);
  const live = cards.find((c) => c.status !== "not_doing") ?? null;
  const stage = sparkStage(social.builds, cards);
  const reached = [...stagesReached(social.builds, cards)];
  const boards = !isLearning && !live ? (await pickableBoards(actor)).map((b) => ({ id: b.id, name: b.name })) : [];
  const meTooNames = social.meToo.map((f) => f.name);
  const meTooLine = meTooNames.length
    ? `${joinNames(meTooNames)} ${isLearning ? "will try this" : meTooNames.length === 1 ? "has hit this too" : "have hit this too"}`
    : null;

  // AI-generated markdown: sanitize on render — the model's output is not a
  // trusted HTML source. The plan's opening pitch is left out when it is the
  // hook the head already shows (W.187); the author still edits it as written.
  const aiHtml = idea.ai_plan
    ? String(await remark().use(remarkHtml, { sanitize: true }).process(planWithoutPitch(idea.ai_plan, sparkHook(idea))))
    : null;

  // The plan line and the 5D answers, shared by the tabbed and stacked layouts.
  // Once someone has picked the spark up it is on a board, not waiting in the
  // backlog; the Picked up section says where.
  const ownerPlanSub = live
    ? "Written from your 5D answers. This is the document to bring when someone asks \"what would we actually build?\""
    : "Written from your 5D answers. It's in the company backlog now — this is the document to bring when someone asks \"what would we actually build?\"";
  const othersPlanSub = live ? `Written from ${idea.submitterName}'s 5D answers.` : `Written from ${idea.submitterName}'s 5D answers. It's in the company backlog.`;
  const answersList = (
    <dl className="admin-kv">
      {D_SECTIONS.filter((s) => String(idea[s.key] ?? "").trim()).map((s) => (
        <div key={s.key as string} className="u-span-all u-mb-3">
          <dt className="u-mb-1">
            {s.d} · {s.label}
          </dt>
          <dd className="u-prewrap">{String(idea[s.key] ?? "")}</dd>
        </div>
      ))}
    </dl>
  );

  return (
    <div className="sparks-page">
      <Link className="sparks-back" href="/team/ideas">
        <Icon name="back" />
        All sparks
      </Link>

      <SparkHead idea={idea} isOwner={isOwner} hasFiveD={hasFiveD} stage={stage} reached={reached} />
      <SparkTalk
        ideaId={idea.id}
        author={idea.submitterName}
        isOwner={isOwner}
        kind={isLearning ? "learning" : "build"}
        admired={reactions.some((r) => r.personId === actor.personId && r.kind === "admire")}
        meToo={reactions.some((r) => r.personId === actor.personId && r.kind === "me_too")}
        admireLine={admireFaces(social).line}
        meTooLine={meTooLine}
        builds={builds.map((b) => ({
          id: b.id,
          who: b.name,
          initials: initials(b.name),
          tone: avatarTone(b.personId),
          date: formatDate(b.createdAt),
          body: b.body,
          mine: b.personId === actor.personId,
        }))}
      />

      {!isLearning && (
        <PickUp
          ideaId={idea.id}
          author={isOwner ? "you" : idea.submitterName}
          card={
            live
              ? {
                  title: live.title,
                  href: `/team/boards/${live.boardSlug}?card=${live.taskId}`,
                  shipped: live.status === "done",
                  // Who has it and where it sits (W.186), so the author can see
                  // the work moving without opening the board.
                  who: live.assigneeId === actor.personId ? "You" : live.assigneeName,
                  initials: live.assigneeName ? initials(live.assigneeName) : "?",
                  tone: avatarTone(live.assigneeId ?? live.taskId),
                  column: live.columnName,
                  board: live.boardName,
                  landed: live.completedAt ? formatDate(live.completedAt) : null,
                }
              : null
          }
          boards={boards}
        />
      )}

      <div className="admin-content">
        {isLearning ? (
          <>
            {aiHtml && isOwner ? (
              <EditablePlan
                ideaId={idea.id}
                title={idea.title}
                markdown={idea.ai_plan ?? ""}
                html={aiHtml}
                noun="write-up"
                sub="Claude tidied what you shared into this. It's yours: change anything that isn't how you'd say it."
              />
            ) : aiHtml ? (
              <div className="admin-card u-p-5 u-mb-5">
                <h2 className="admin-card-title">The learning</h2>
                <div className="admin-idea-plan" dangerouslySetInnerHTML={{ __html: aiHtml }} />
              </div>
            ) : null}
            {(Boolean(idea.story) || (idea.source_urls?.length ?? 0) > 0) && (
              <div className="admin-card u-p-5">
                <h2 className="admin-card-title">{aiHtml ? (isOwner ? "What you shared" : "As shared") : "The learning"}</h2>
                <dl className="admin-kv">
                  {idea.story && (
                    <div className="u-span-all u-mb-3">
                      <dt className="u-mb-1">What happened</dt>
                      <dd className="u-prewrap">{idea.story}</dd>
                    </div>
                  )}
                  {idea.takeaway && (
                    <div className={`u-span-all ${idea.source_urls?.length ? "u-mb-3" : "u-mb-0"}`}>
                      <dt className="u-mb-1">The takeaway</dt>
                      <dd className="u-prewrap">{idea.takeaway}</dd>
                    </div>
                  )}
                  {idea.source_urls && idea.source_urls.length > 0 && (
                    <div className="u-span-all">
                      <dt className="u-mb-1">Source</dt>
                      <dd>
                        <ul className="u-list">
                          {idea.source_urls.map((url) => (
                            <li key={url}>
                              <ExternalLink href={url} fallback={url}>
                                {url}
                              </ExternalLink>
                            </li>
                          ))}
                        </ul>
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            )}
          </>
        ) : (
          <>
            {aiHtml && hasFiveD ? (
              // The plan and the answers it was written from, one tab each (W.187):
              // one read at a time instead of the same problem stated twice down
              // the page. Each panel is keyed, because kernel/ui/Tabs reuses one
              // panel element and would otherwise carry state across.
              <div className="admin-card u-p-5">
                <Tabs
                  tabs={[
                    {
                      key: "plan",
                      label: isOwner ? "Your product plan" : "The product plan",
                      content: isOwner ? (
                        <EditablePlan key="plan" bare ideaId={idea.id} title={idea.title} markdown={idea.ai_plan ?? ""} html={aiHtml} sub={ownerPlanSub} />
                      ) : (
                        <div key="plan">
                          <p className="admin-page-sub u-mt-0">{othersPlanSub}</p>
                          <div className="admin-idea-plan" dangerouslySetInnerHTML={{ __html: aiHtml }} />
                        </div>
                      ),
                    },
                    {
                      key: "answers",
                      label: isOwner ? "What you submitted" : `${idea.submitterName}'s 5D answers`,
                      content: <div key="answers">{answersList}</div>,
                    },
                  ]}
                />
              </div>
            ) : (
              <>
                {aiHtml && isOwner ? (
                  <EditablePlan ideaId={idea.id} title={idea.title} markdown={idea.ai_plan ?? ""} html={aiHtml} sub={ownerPlanSub} />
                ) : aiHtml ? (
                  <div className="admin-card u-p-5 u-mb-5">
                    <h2 className="admin-card-title">The product plan</h2>
                    <p className="admin-page-sub u-mt-0">{othersPlanSub}</p>
                    <div className="admin-idea-plan" dangerouslySetInnerHTML={{ __html: aiHtml }} />
                  </div>
                ) : idea.ai_error ? (
                  <div className="admin-card u-p-5 u-mb-5">
                    <h2 className="admin-card-title">Plan not ready yet</h2>
                    <p className="admin-page-sub u-mt-0">
                      The idea is safely in the backlog, but the product plan didn&apos;t generate. It
                      will be retried — check back here soon.
                    </p>
                  </div>
                ) : null}

                {hasFiveD && (
                  <div className="admin-card u-p-5">
                    <h2 className="admin-card-title">{isOwner ? "What you submitted" : "The 5D answers"}</h2>
                    {answersList}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
