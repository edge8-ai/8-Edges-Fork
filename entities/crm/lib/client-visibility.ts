// Who may see every client's money and contact people (ADR 0013): whoever may
// work the pipeline, the permission the Revenue client pages declare. It lives
// here, beside those pages' declaration, so a screen in another entity that
// shows the same facts (the team assistant's client tools) asks crm instead of
// naming crm's atom itself, and the two can never disagree.
import type { Access } from "@/kernel/identity/access-model";

export function seesEveryClient(access: Pick<Access, "may">): boolean {
  return access.may("crm.pipeline");
}
