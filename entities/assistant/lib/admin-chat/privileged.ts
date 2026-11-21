// Which admins may run WRITE tools through the database assistant.
//
// This file is an overlay stub for 8-Edges-Fork. It only neutralises upstream
// while it sits at the SAME repo-relative path as the real module — today
// entities/assistant/lib/admin-chat/privileged.ts. Move that module and this
// copy moves with it, or the fork gets the upstream address and this stub
// lands somewhere nothing imports.
//
// Fork note: upstream ships a hardcoded fallback address here. This copy has
// none — publishing "this exact account can write to the database via the
// assistant" hands an attacker a target for no benefit. Set
// CHATBOT_PRIVILEGED_EMAILS to enable writes; leave it unset and nobody can,
// which is the right default for a fresh install.
//
// Being an admin is deliberately not enough. Reaching a write also needs an
// explicit human approval click in the UI, and the write itself runs as the
// chatbot_writer Postgres role — the boundary is the database, not this list.
const DEFAULT_PRIVILEGED = "";

export function isPrivilegedChatUser(email: string | null | undefined): boolean {
  if (!email) return false;
  const allow = (process.env.CHATBOT_PRIVILEGED_EMAILS ?? DEFAULT_PRIVILEGED)
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allow.includes(email.trim().toLowerCase());
}
