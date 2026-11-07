// Every file the two assistants can run a tool through (LD.9).
//
// A tool is registered where a chat route hands it to the model and runs it,
// so the registries are the two chat routes, not a folder: the team chat
// (entities/team/api/team/chat/route.ts) and the admin chat
// (entities/company-os/api/admin/chat/route.ts). This follows each route's
// imports through its own entity and through the assistant entity, which owns
// the chat back end, and stops at any other entity's door and at the kernel:
// those are shared services a tool calls, not the tool. So a tool body that
// lives outside entities/assistant (the team data tools in
// entities/team/lib/chat/) is found by what the route runs, wherever it sits.
// A tool body behind another entity's door is the one case the walk cannot see,
// so each is named in TOOL_BODIES_BEHIND_A_DOOR with the export the route runs.
//
// Read by entities/ladders/fence.test.ts (the assistant is a fenced surface)
// and entities/assistant/lib/no-ladders-read.test.ts (no tool names a ladders
// table). Node built-ins only, like the other gates.

import fs from "node:fs";
import path from "node:path";
import { importSpecifiers, resolveSpecifier } from "./check-entity-imports.mjs";

const CHAT_ROUTES = ["entities/team/api/team/chat/route.ts", "entities/company-os/api/admin/chat/route.ts"];

// The review link tool moved to org with performance_reviews (ADR 0025), and the
// team chat route reaches it through org's door. The walk starts from it as if
// the route imported it by path, and follows its own entity from there. An entry
// whose route no longer imports its export throws, so the list cannot go stale
// and a moved tool cannot drop out of the fence unnoticed.
const TOOL_BODIES_BEHIND_A_DOOR = [
  { route: "entities/team/api/team/chat/route.ts", name: "requestReviewLinks", file: "entities/org/lib/reviews/chat-tool.ts" },
];

const entityOf = (rel) => /^entities\/([^/]+)\//.exec(rel)?.[1] ?? null;

/** The repo file a resolved import target names, or null. */
function fileOf(root, target) {
  for (const suffix of ["", ".ts", ".tsx", ".mjs", ".js", "/index.ts", "/index.tsx"]) {
    const rel = `${target}${suffix}`;
    const abs = path.join(root, rel);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return rel;
  }
  return null;
}

/** The chat routes and every file they reach within their own entity and the assistant entity, sorted. */
export function assistantToolFiles(root) {
  const seen = new Set();
  const queue = CHAT_ROUTES.filter((f) => fs.existsSync(path.join(root, f)));
  while (queue.length > 0) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    const home = entityOf(file);
    const source = fs.readFileSync(path.join(root, file), "utf8");
    for (const body of TOOL_BODIES_BEHIND_A_DOOR.filter((b) => b.route === file)) {
      if (!new RegExp(`\\b${body.name}\\b`).test(source)) throw new Error(`assistant-tool-files: ${file} no longer runs ${body.name}; remove it from TOOL_BODIES_BEHIND_A_DOOR`);
      if (!fs.existsSync(path.join(root, body.file))) throw new Error(`assistant-tool-files: ${body.file} is gone; update TOOL_BODIES_BEHIND_A_DOOR`);
      queue.push(body.file);
    }
    for (const spec of importSpecifiers(source)) {
      const target = resolveSpecifier(spec, file);
      if (!target) continue;
      const next = fileOf(root, target);
      if (!next || /\.test\.tsx?$/.test(next)) continue;
      const owner = entityOf(next);
      if (owner === home || owner === "assistant") queue.push(next);
    }
  }
  return [...seen].sort();
}
