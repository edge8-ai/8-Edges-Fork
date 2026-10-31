// Server-only. Which of an assistant's tools a person is handed (ADR 0013).
//
// A tool has no page of its own to ask, so each one names its permission as
// data beside its definition: an atom this entity declares, or a kernel atom.
// The assistant entity declares none of its own yet, so every tool today names
// the kernel atom that enters its surface (`surface.team`, `surface.admin`),
// which is who reaches the assistant now; narrower tools get an assistant atom
// when one is declared. The model is handed only the tools the person holds,
// and the route refuses a call to any tool it was not handed, so a tool is
// never a side door around the page that shows the same data.
import type Anthropic from "@anthropic-ai/sdk";

/** A tool and the permission a person must hold to be handed it. */
export type PermittedTool = { readonly tool: Anthropic.Tool; readonly permission: string };

/**
 * The tools a person who holds what `may` says is handed, in order. Closed by
 * default: a tool whose permission is blank is never handed to anyone.
 */
export function toolsFor(may: (permission: string) => boolean, tools: readonly PermittedTool[]): Anthropic.Tool[] {
  return tools.filter((t) => t.permission.trim() !== "" && may(t.permission)).map((t) => t.tool);
}
