// Every file the two assistants can run a tool through (LD.9).
//
// A tool is registered where a chat route hands it to the model and runs it,
// so the registries are the two chat routes, not a folder: the team chat
// (entities/team/api/team/chat/route.ts) and the admin chat
// (entities/company-os/api/admin/chat/route.ts). This follows each route's
// imports through its own entity and through the assistant entity, which owns
// the chat back end, and stops at any other entity's door and at the kernel:
// those are shared services a tool calls, not the tool. So a tool body that
// lives outside entities/assistant (the review link tool in
// entities/team/lib/reviews/chat-tool.ts, the team data tools in
// entities/team/lib/chat/) is found by what the route runs, wherever it sits.
//
// Read by entities/ladders/fence.test.ts (the assistant is a fenced surface)
// and entities/assistant/lib/no-ladders-read.test.ts (no tool names a ladders
// table). Node built-ins only, like the other gates.

import fs from "node:fs";
import path from "node:path";
import { importSpecifiers, resolveSpecifier } from "./check-entity-imports.mjs";

const CHAT_ROUTES = ["entities/team/api/team/chat/route.ts", "entities/company-os/api/admin/chat/route.ts"];

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
    for (const spec of importSpecifiers(fs.readFileSync(path.join(root, file), "utf8"))) {
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
