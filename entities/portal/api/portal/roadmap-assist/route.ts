// Roadmap propose assist (PR 4): a small, non-streaming Q&A that drafts one
// roadmap item. Deliberately simpler than the program-plan chat: replies are a
// sentence or two, so a single JSON response beats SSE plumbing. Stateless like
// its siblings: the client echoes the full messages array each turn. The final
// model turn carries a fenced json block; we parse it server-side and hand the
// client a ready-to-fill draft. Nothing is submitted here; the client reviews
// and sends through the normal propose action (role-gated, PR 2).

import { aiSite } from "@/kernel/ai/gateway";
import { fillPrompt } from "@/kernel/ai/prompts";
import type { AiDataClass } from "@/kernel/ai/routing";
import { NextRequest, NextResponse } from "next/server";
import { getPortalActor } from "@/kernel/identity/portal-auth";
import { contributorCompanyScope } from "@/entities/portal/lib/roles";
import { getGroupsForActor } from "@/entities/portal/lib/backlog";
import { buildRoadmapAssistPrompt } from "@/entities/portal/lib/roadmap-assist-prompt";
import { ROADMAP_ASSIST_PROMPT } from "@/entities/portal/lib/roadmap-assist.prompt";
import { isBacklogPriority } from "@/entities/client-programs";
import { readTextOutput } from "@/kernel/ai/response";

export const ROADMAP_ASSIST_CLASS: AiDataClass = "C";
// The model, its host and its fallback are the site's SITE_MODELS entry in
// kernel/ai/models.ts (Y.67.3): Qwen on the host its eval ran on, with Sonnet 5
// answering when Qwen has not answered in 12 s. routeSeconds is this route's
// maxDuration (entities/portal/mounts.ts), so the fallback's timeout fits in
// what the first call leaves of it.
const AI = aiSite({ site: "roadmap-assist", dataClass: ROADMAP_ASSIST_CLASS, tier: "fast", routeSeconds: 60 });
const MODEL = AI.model;
const MAX_MESSAGES = 20;

export type RoadmapDraft = {
  title: string;
  note: string;
  groupKey: string;
  priority: string;
};

type ChatMessage = { role: "user" | "assistant"; content: string };

function parseDraft(text: string, validKeys: string[]): RoadmapDraft | null {
  const m = text.match(/```json\s*([\s\S]*?)```/);
  if (!m) return null;
  try {
    const raw = JSON.parse(m[1]) as Partial<RoadmapDraft>;
    const title = typeof raw.title === "string" ? raw.title.trim().slice(0, 120) : "";
    const note = typeof raw.note === "string" ? raw.note.trim().slice(0, 1000) : "";
    if (!title) return null;
    const groupKey = validKeys.includes(raw.groupKey ?? "")
      ? (raw.groupKey as string)
      : validKeys[0] ?? "";
    const priority = isBacklogPriority(raw.priority ?? "") ? (raw.priority as string) : "next";
    return { title, note, groupKey, priority };
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const { actor } = await getPortalActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Same gate as proposing itself: viewers don't get the assist either.
  if (contributorCompanyScope(actor).length === 0) {
    return NextResponse.json({ error: "Your portal role does not allow proposing items." }, { status: 403 });
  }
  const client = AI.clientIfConfigured();
  if (!client) {
    return NextResponse.json({ error: "The assistant is not configured (missing API key)" }, { status: 503 });
  }

  let body: { messages?: ChatMessage[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const incoming = Array.isArray(body.messages) ? body.messages : [];
  const messages = incoming
    .filter(
      (m): m is ChatMessage =>
        !!m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.length > 0,
    )
    .slice(-MAX_MESSAGES);
  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "messages must end with a user turn" }, { status: 400 });
  }

  const groups = await getGroupsForActor(actor);
  if (groups.length === 0) {
    return NextResponse.json({ error: "Your roadmap has no sections yet, so there is nowhere to propose an item." }, { status: 409 });
  }
  // The given name, never the actor's email fallback: the prompt goes to the
  // model (S.16.26).
  const system = `${buildRoadmapAssistPrompt(groups)}${actor.greeting ? fillPrompt(ROADMAP_ASSIST_PROMPT.parts.clientName, { greeting: actor.greeting }) : ""}`;
  try {
    const msg = await client.messages.create({
      prompt: ROADMAP_ASSIST_PROMPT,
      model: MODEL,
      max_tokens: 1024,
      system,
      messages,
    });
    // The model that answered: the fallback's, when the first did not.
    const out = readTextOutput("roadmap-assist", msg.model || MODEL, msg);
    if (!out.ok) {
      console.error("portal roadmap-assist:", out.error);
      return NextResponse.json({ error: "The assistant hit a problem. Please try again." }, { status: 502 });
    }
    const text = out.text;
    const draft = parseDraft(text, groups.map((g) => g.key));
    const reply = draft ? text.replace(/```json[\s\S]*?```/, "").trim() : text.trim();
    return NextResponse.json({
      reply,
      draft,
      messages: [...messages, { role: "assistant", content: text }].slice(-MAX_MESSAGES),
    });
  } catch (err) {
    console.error("portal roadmap-assist route:", err);
    return NextResponse.json({ error: "The assistant hit a problem. Please try again." }, { status: 502 });
  }
}
