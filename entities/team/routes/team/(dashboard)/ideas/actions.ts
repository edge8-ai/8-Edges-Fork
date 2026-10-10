"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { getSharedIdea, teamInsertOwn, teamRead, teamUpdateInScope } from "@/entities/team/lib/data";
import { addSparkBuild, answerSparkCheckIn, generateIdeaPlan, readSparkSignals, setSparkReaction, type CheckInAnswer } from "@/entities/ideas";
import { sparkHook } from "./sparks-model";
import { cardsForIdeas, createCard, pickableBoards, setCardSprint } from "@/entities/boards";
import { publish } from "@/kernel/events";
import { externalHref } from "@/kernel/ui/url";
import { getSiteOrigin } from "@/kernel/config/site-origin";

// Own-service idea submission for /team. teamInsertOwn forces
// person_id = actor.personId server-side, so an idea can only ever be
// submitted as yourself. The Claude call runs synchronously in the request —
// the employee is watching a "building your plan" state — but the idea row is
// inserted FIRST, so a generation failure never loses the submission.

type SubmitResult = { ok: true; id: string } | { ok: false; error: string };

const MAX_FIELD = 5000;
const MAX_SOURCE_URLS = 10;
const MAX_URL_LEN = 500;
const MAX_PLAN = 20000;

// Keep only web links — a bad scheme here (e.g. javascript:) would otherwise
// get rendered as a clickable href on the detail page.
function cleanSourceUrls(urls: string[] | undefined): string[] | { error: string } {
  const trimmed = (urls ?? []).map((u) => u.trim()).filter(Boolean);
  if (trimmed.length > MAX_SOURCE_URLS) return { error: `Add at most ${MAX_SOURCE_URLS} source links.` };
  const cleaned: string[] = [];
  for (const u of trimmed) {
    if (u.length > MAX_URL_LEN) return { error: "One of your source links is too long." };
    const href = externalHref(u);
    if (!href) return { error: `"${u}" needs to be a regular http(s) link.` };
    cleaned.push(href);
  }
  return cleaned;
}

const MAX_TITLE = 200;
const MAX_STORY = 2000;

type OwnSpark = { id: string; person_id: string; kind: string; title: string; ai_plan: string | null };

// The actor's own spark, or why not. A failed read is reported as a failure,
// never as "not yours": the two need different answers to the person.
async function ownSpark(
  actor: Awaited<ReturnType<typeof requireTeamMember>>,
  id: string,
): Promise<{ ok: true; spark: OwnSpark } | { ok: false; error: string }> {
  const { data, error } = await teamRead(actor, "ideas", "id, person_id, kind, title, ai_plan").eq("id", id).maybeSingle();
  if (error) return { ok: false, error: "Could not load that spark. Try again in a moment." };
  const spark = data as OwnSpark | null;
  if (!spark || spark.person_id !== actor.personId) return { ok: false, error: "Only the person who shared this spark can change it." };
  return { ok: true, spark };
}

// "Got a spark?" (ID.2.1): one line is a whole spark. Nothing else is asked
// for, because the long form is what stopped people sharing. A one-line spark
// gets no Claude call: there is nothing yet to plan or polish.
export async function quickSpark(input: { kind: string; title: string }): Promise<SubmitResult> {
  await requirePermission("team.ideas");
  const actor = await requireTeamMember();

  const kind = input.kind === "learning" ? "learning" : "build";
  const title = input.title?.replace(/\s+/g, " ").trim();
  if (!title) return { ok: false, error: "Write one line first. That is all a spark needs." };
  if (title.length > MAX_TITLE) return { ok: false, error: "Keep a spark to one line, under 200 characters. Add the story after you post it." };

  const { data, error } = await teamInsertOwn(actor, "ideas", { kind, title });
  if (error || !data) return { ok: false, error: error ?? "Could not save your spark." };

  revalidatePath("/team/ideas");
  // Home's Spark card shows the sky and the newest sparks too (TH.1.5).
  revalidatePath("/team");
  return { ok: true, id: data.id };
}

// The optional second line after a spark is posted: what happened. A learning
// keeps it as its story, with the spark line as its takeaway, and gets the
// usual Claude polish; an idea to build keeps it as the problem it defines.
export async function addSparkStory(id: string, story: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await requirePermission("team.ideas");
  const actor = await requireTeamMember();

  const text = story?.trim();
  if (!text) return { ok: false, error: "Write a line or two about what happened first." };
  if (text.length > MAX_STORY) return { ok: false, error: "Keep it to a few lines, under 2,000 characters." };

  const own = await ownSpark(actor, id);
  if (!own.ok) return own;
  const isLearning = own.spark.kind === "learning";
  const patch = isLearning ? { story: text, takeaway: own.spark.title } : { problem: text };
  const r = await teamUpdateInScope(actor, "ideas", id, patch);
  if (!r.ok) return { ok: false, error: r.error ?? "Could not save that." };

  if (isLearning) await generateIdeaPlan(id);

  revalidatePath("/team/ideas");
  revalidatePath(`/team/ideas/${id}`);
  return { ok: true };
}

// The 5D form. Given a sparkId it grows that spark (the person's own idea to
// build, not yet planned) instead of filing a second copy of it.
export async function submitIdea(
  input: {
    title: string;
    problem: string;
    data_needed: string;
    workflow: string;
    roi: string;
  },
  sparkId?: string,
): Promise<SubmitResult> {
  await requirePermission("team.ideas");
  const actor = await requireTeamMember();

  const title = input.title?.trim();
  const problem = input.problem?.trim();
  const dataNeeded = input.data_needed?.trim();
  const workflow = input.workflow?.trim();
  const roi = input.roi?.trim();

  if (!title) return { ok: false, error: "Give your idea a short title." };
  if (!problem) return { ok: false, error: "Define the problem first — that's the most important D." };
  if (!dataNeeded) return { ok: false, error: "Describe the data your idea would need." };
  if (!workflow) return { ok: false, error: "Sketch the workflow at a high level." };
  if (!roi) return { ok: false, error: "Estimate the ROI — a rough number beats no number." };
  for (const v of [title, problem, dataNeeded, workflow, roi]) {
    if (v.length > MAX_FIELD) return { ok: false, error: "One of your answers is too long — keep each under 5,000 characters." };
  }

  const row = { title: title.slice(0, MAX_TITLE), problem, data_needed: dataNeeded, workflow, roi };
  let id: string;
  if (sparkId) {
    const own = await ownSpark(actor, sparkId);
    if (!own.ok) return own;
    if (own.spark.kind === "learning") return { ok: false, error: "A learning doesn't take a 5D plan. Share it as an idea to build instead." };
    if (own.spark.ai_plan) return { ok: false, error: "This spark already has a plan. Edit it on the spark's page." };
    const r = await teamUpdateInScope(actor, "ideas", sparkId, row);
    if (!r.ok) return { ok: false, error: r.error ?? "Could not save your idea." };
    id = sparkId;
  } else {
    const { data, error } = await teamInsertOwn(actor, "ideas", row);
    if (error || !data) return { ok: false, error: error ?? "Could not save your idea." };
    id = data.id;
  }

  // Best effort: the idea is already safe in the backlog. If generation fails,
  // the detail page explains and an admin can retry.
  await generateIdeaPlan(id);

  revalidatePath("/team/ideas");
  revalidatePath(`/team/ideas/${id}`);
  return { ok: true, id };
}

// Owner edit of a generated plan (title + markdown body). Strictly self: the
// person scope can include reports, so ownership is re-checked against
// actor.personId, never trusted from the client or widened to the scope.
export async function updateIdeaPlan(
  id: string,
  input: { title: string; plan: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requirePermission("team.ideas");
  const actor = await requireTeamMember();

  const title = input.title?.trim();
  const plan = input.plan?.trim();
  if (!title) return { ok: false, error: "Keep a short title on the idea." };
  if (title.length > 200) return { ok: false, error: "Keep the title under 200 characters." };
  if (!plan) return { ok: false, error: "The plan can't be empty. Edit it instead of clearing it." };
  if (plan.length > MAX_PLAN) return { ok: false, error: "Keep the plan under 20,000 characters." };

  const { data, error: ideaError } = await teamRead(actor, "ideas", "id, person_id").eq("id", id).maybeSingle();
  if (ideaError) console.error("[team/ideas] ideas", ideaError);
  const owner = (data as { person_id: string } | null)?.person_id;
  if (!owner || owner !== actor.personId) return { ok: false, error: "Only the submitter can edit this plan." };

  const r = await teamUpdateInScope(actor, "ideas", id, { title: title.slice(0, 200), ai_plan: plan });
  if (!r.ok) return { ok: false, error: r.error ?? "Could not save your changes." };

  revalidatePath(`/team/ideas/${id}`);
  revalidatePath("/team/ideas");
  return { ok: true };
}

// "What have I learned?" — the light half of Ideas that Spark Solutions.
// Same ownership model as submitIdea; the Claude call is a quick editorial
// polish for the team feed, not a product plan.
export async function submitLearning(input: {
  title: string;
  story: string;
  takeaway: string;
  sourceUrls?: string[];
}): Promise<SubmitResult> {
  await requirePermission("team.ideas");
  const actor = await requireTeamMember();

  const title = input.title?.trim();
  const story = input.story?.trim();
  const takeaway = input.takeaway?.trim();

  if (!title) return { ok: false, error: "Give your learning a short title." };
  if (!story) return { ok: false, error: "Tell what happened — two honest sentences is enough." };
  if (!takeaway) return { ok: false, error: "Name the takeaway — what should a teammate do differently?" };
  for (const v of [title, story, takeaway]) {
    if (v.length > MAX_FIELD) return { ok: false, error: "One of your answers is too long — keep each under 5,000 characters." };
  }

  const sourceUrls = cleanSourceUrls(input.sourceUrls);
  if (!Array.isArray(sourceUrls)) return { ok: false, error: sourceUrls.error };

  const { data, error } = await teamInsertOwn(actor, "ideas", {
    kind: "learning",
    title: title.slice(0, 200),
    story,
    takeaway,
    source_urls: sourceUrls.length ? sourceUrls : null,
  });
  if (error || !data) return { ok: false, error: error ?? "Could not save your learning." };

  await generateIdeaPlan(data.id);

  revalidatePath("/team/ideas");
  return { ok: true, id: data.id };
}

// One-tap answers on someone else's spark (ID.2.6): admire, me too (I have hit
// this too / I will try this), or skip, which only keeps it out of your own
// deck. Your own spark takes none of them; an archived one is not answerable.
const REACTIONS = ["admire", "me_too", "skip"] as const;
type SparkReaction = (typeof REACTIONS)[number];

export async function reactToSpark(ideaId: string, kind: string, on = true): Promise<{ ok: true } | { ok: false; error: string }> {
  await requirePermission("team.ideas");
  const actor = await requireTeamMember();
  if (!(REACTIONS as readonly string[]).includes(kind)) return { ok: false, error: "That isn't an answer a spark takes." };

  const idea = await getSharedIdea(actor, ideaId);
  if (!idea || idea.status === "archived") return { ok: false, error: "That spark isn't here any more." };
  if (idea.person_id === actor.personId) return { ok: false, error: "That's your own spark." };

  const r = await setSparkReaction(actor.personId, ideaId, kind as SparkReaction, on);
  if (!r.ok) return r;
  revalidatePath("/team/ideas");
  revalidatePath(`/team/ideas/${ideaId}`);
  revalidatePath("/team");
  return { ok: true };
}

// "Build on it" (ID.2.7): a line of your own on a spark, yours included. The
// author hears about it in their inbox, by your name, with your words.
export async function buildOnSpark(ideaId: string, body: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await requirePermission("team.ideas");
  const actor = await requireTeamMember();

  const idea = await getSharedIdea(actor, ideaId);
  if (!idea || idea.status === "archived") return { ok: false, error: "That spark isn't here any more." };

  const r = await addSparkBuild({ personId: actor.personId, name: actor.name }, idea, body ?? "");
  if (!r.ok) return r;
  revalidatePath("/team/ideas");
  revalidatePath(`/team/ideas/${ideaId}`);
  return { ok: true, id: r.id };
}

// "Pick it up" (ID.2.8): someone takes an idea to build on as a Workboard card,
// on a board they may already add cards to. The card is made by the boards
// entity's own createCard, so its guard, audit and assignee rules all apply,
// and it carries the spark in metadata.idea_id. A spark is picked up once: a
// second live card for it is refused, so two people do not quietly build it twice.
export async function pickUpSpark(ideaId: string, boardId: string): Promise<{ ok: true; taskId: string } | { ok: false; error: string }> {
  await requirePermission("team.ideas");
  const actor = await requireTeamMember();

  const idea = await getSharedIdea(actor, ideaId);
  if (!idea || idea.status === "archived") return { ok: false, error: "That spark isn't here any more." };
  if (idea.kind === "learning") return { ok: false, error: "A learning is tried, not picked up. Use I'll try this instead." };
  if ((await cardsForIdeas([ideaId])).some((c) => c.status !== "not_doing")) {
    return { ok: false, error: "Someone has already picked this spark up. Open its card from the spark page." };
  }
  const board = (await pickableBoards(actor)).find((b) => b.id === boardId);
  if (!board) return { ok: false, error: "Pick a board you can add cards to." };

  const hook = sparkHook(idea);
  // The full address, so it opens wherever the text is copied or shown as a
  // link (the drawer edits it in a textarea, which links nothing). With no
  // known origin it stays a path, never a guessed host.
  const sparkUrl = `${await getSiteOrigin()}/team/ideas/${ideaId}`;
  const made = await createCard({
    boardId: board.id,
    columnId: board.columnId,
    title: idea.title,
    description: [`Picked up from ${idea.submitterName}'s spark: ${sparkUrl}`, hook].filter(Boolean).join("\n\n"),
    assigneeId: actor.personId,
    // P2 and the current sprint (W.184): someone chose to take this on now, so
    // it is this week's work, not a P3 parked outside every sprint where the
    // board's This sprint group never shows it.
    priority: "p2",
    ideaId,
  });
  // createCard hands back the id with an error when the card was written but a
  // later step was not; the card exists then, so the pick-up still counts.
  if (!made.id) return { ok: false, error: made.ok ? "Could not make the card." : made.error };
  // The board's own form sets the sprint the same way, after the card exists.
  // A refusal (a sprint locked for planning) leaves the card in the backlog:
  // it is still picked up, so the author is still told, and the person sees why.
  const sprint = board.sprintId ? await setCardSprint(made.id, board.sprintId, board.slug) : { ok: true as const };
  const shortfall = !made.ok ? made.error : !sprint.ok ? `It could not join the sprint: ${sprint.error}` : null;

  await publish("idea.picked_up", {
    ideaId,
    taskId: made.id,
    boardSlug: board.slug,
    actorName: actor.name,
    title: idea.title,
    assigneeId: idea.person_id,
    actorPersonId: actor.personId,
  });
  revalidatePath("/team/ideas");
  revalidatePath(`/team/ideas/${ideaId}`);
  if (shortfall) return { ok: false, error: `Picked up, and the card is on the board. ${shortfall}` };
  return { ok: true, taskId: made.id };
}

// "Did it hold?" (ID.2.9): the person's own answer on a learning they said
// they would try. Self-reported, and only ever asked, never filled in for them.
const CHECK_IN_ANSWERS = ["held", "trying", "unstuck"] as const;

export async function answerCheckIn(ideaId: string, answer: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await requirePermission("team.ideas");
  const actor = await requireTeamMember();
  if (!(CHECK_IN_ANSWERS as readonly string[]).includes(answer)) return { ok: false, error: "That isn't a check-in answer." };

  const idea = await getSharedIdea(actor, ideaId);
  if (!idea || idea.status === "archived" || idea.kind !== "learning") return { ok: false, error: "That learning isn't here any more." };
  const { reactions } = await readSparkSignals();
  if (!reactions.some((r) => r.ideaId === ideaId && r.personId === actor.personId && r.kind === "me_too")) {
    return { ok: false, error: "You can only check in on a learning you said you'd try." };
  }
  const r = await answerSparkCheckIn(actor.personId, ideaId, answer as CheckInAnswer);
  if (!r.ok) return r;
  revalidatePath("/team/ideas");
  revalidatePath(`/team/ideas/${ideaId}`);
  return { ok: true };
}
