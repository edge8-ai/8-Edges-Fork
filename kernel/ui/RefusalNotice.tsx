import Link from "next/link";
import { notFound } from "next/navigation";
import { getAccess } from "@/kernel/identity/access-request";
import { accessGrantorNames } from "@/kernel/identity/access-grantors";
import { permissionRegistry } from "@/kernel/identity/permission-registry";
import { PageHead } from "@/kernel/ui/PageHead";

/** "Anna", "Anna and Ben", "Anna, Ben and Cai". */
function nameList(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The registry's sentence for a permission, or null when the key is not one this deployment declares. */
function sentenceFor(permission: string | null): string | null {
  if (!permission) return null;
  try {
    return permissionRegistry().atoms[permission]?.sentence ?? null;
  } catch (e) {
    // A page that only informs must not fail for want of the registry.
    console.error("[access]", e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * The kernel's refusal page (AC.16): a signed-in person lacked a permission, and
 * requirePermission sent them here. It names what the permission lets a person
 * do and who can grant it. Whoever lacks access.explain, the Contractor
 * baseline's flag, is told the page does not exist, here as in the redirect, so
 * opening this address by hand shows them no more than the redirect would.
 * The entity routes call it after their own requirePermission on the surface.
 */
export async function RefusalNotice({ permission, base }: { permission: string | null; base: "/admin" | "/team" }) {
  const access = await getAccess();
  if (!access?.may("access.explain")) notFound();
  const sentence = sentenceFor(permission);
  const grantors = nameList(await accessGrantorNames());
  return (
    <>
      <PageHead eyebrow="Access" title="You don't have access to this page" />
      <div className="admin-card u-p-4">
        {sentence ? (
          <p>
            That page needs a permission you do not hold: <strong>{sentence}</strong>.
          </p>
        ) : (
          <p>That page needs a permission you do not hold.</p>
        )}
        <p className="admin-page-sub">Ask {grantors} to grant it in Settings, Access.</p>
        <Link href={base} className="admin-btn">
          Back to {base === "/team" ? "your team home" : "the Admin home"}
        </Link>
      </div>
    </>
  );
}
