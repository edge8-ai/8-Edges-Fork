import { contentVersion } from "@/kernel/approvals/version";

// The version an approval of a follow-up is for (spec section 6): a hash of
// exactly what would go out. The recipients are in it as their sorted
// addresses, so a recipient added, removed, or whose address changed in the
// CRM is a different email and needs a new approval, as an edited word does.

export function followupVersion(parts: { from: string | null; to: string[]; subject: string; bodyMd: string }): string {
  return contentVersion({ from: parts.from ?? "default", to: [...parts.to].map((e) => e.trim().toLowerCase()).sort(), subject: parts.subject, bodyMd: parts.bodyMd });
}
