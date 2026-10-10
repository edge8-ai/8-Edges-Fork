import type { ReactNode } from "react";
import { requirePermission } from "@/kernel/identity/access-request";
import { PageHead } from "@/kernel/ui/PageHead";
import { Tabs, type TabDef } from "@/kernel/ui/Tabs";
import { accessOf } from "@/kernel/identity/access-of-person";
import { allowlistBootstrapWarning } from "@/kernel/identity/admin-bootstrap";
import { permissionRegistry } from "@/kernel/identity/permission-registry";
import { mayProp } from "@/kernel/identity/may-prop";
import { declaredPermissions, loadAccessPeople, loadAccessRoles } from "@/entities/company-os/lib/access-screen";
import { atomSides, bundleOptions, mergeBundleOptions, shapeGroups } from "@/entities/company-os/lib/access-invite-plan";
import { linkLifetimeHours } from "@/entities/company-os/lib/access-invitations";
import { loadInvitations } from "@/entities/company-os/lib/access-invite-pending";
import { RoleCard } from "./RoleCard";
import { NewRoleForm } from "./NewRoleForm";
import { PermissionView, PersonView } from "./AccessViews";
import { InvitationsTab } from "./InvitationsTab";
import { InviteButton } from "./InviteDrawer";

// Settings → Access (ADR 0013, AC.17): one register for who may do what. Roles
// are bundles of permissions; a person holds the roles granted to them here and
// the ones a fact about them implies. Three ways in: the roles themselves, one
// person ("what can Anna see, and why"), and one permission ("who can see X").
// Admin and Super Admin are granted here too, and since AC.20 these grants are
// the only register the admin gate reads; the page warns, as the boot log does,
// while the ADMIN_ALLOWLIST bootstrap is still set after the first Admin grant.
//
// Since AE.4 the page opens with access.explain for its Invitations tab, so an
// Admin can see who is invited and not yet in. Inviting, Resend and Cancel, and
// the Roles, People and Permissions tabs, stay with access.manage.

type Params = { tab?: string; person?: string; permission?: string };

export default async function AccessPage({ searchParams }: { searchParams: Promise<Params> }) {
  // The page's declared permission (ADR 0013).
  const viewer = await requirePermission("access.explain");
  const manages = viewer.may("access.manage");
  const params = await searchParams;
  const invitations = await loadInvitations();
  const invitationsTab: TabDef = {
    key: "invitations",
    label: "Invitations",
    count: invitations.length,
    content: <InvitationsTab key="invitations" invitations={invitations} may={mayProp(viewer, ["access.manage"])} lifetimeHours={linkLifetimeHours()} />,
  };
  const head = (action?: ReactNode) => (
    <PageHead
      eyebrow="Settings"
      title="Access"
      sub="Who may open what. A role bundles permissions; people hold the roles granted to them and the ones their work implies."
      action={action}
    />
  );
  if (!manages) {
    return (
      <>
        {head()}
        <Tabs tabs={[invitationsTab]} initialKey="invitations" syncParam="tab" />
      </>
    );
  }

  const [roles, people, leftover] = await Promise.all([loadAccessRoles(), loadAccessPeople(), allowlistBootstrapWarning()]);
  const permissions = declaredPermissions();
  const person = params.person ? people.find((p) => p.personId === params.person) ?? null : null;
  const personAccess = person ? await accessOf(person.personId) : null;
  const grantable = roles.filter((r) => r.kind === "granted" && !r.archived);
  const registry = permissionRegistry();
  // The declared bundles, then every live granted role that exists only as a row (Revenue, a one-person role).
  const inviteBundles = mergeBundleOptions(
    bundleOptions(registry),
    grantable.map((r) => ({ key: r.key, name: r.name, description: r.description, permissions: r.permissions.map((p) => p.permission) })),
    atomSides(registry).adminSide,
  );

  const tabs: TabDef[] = [
    invitationsTab,
    {
      key: "roles",
      label: "Roles",
      count: roles.length,
      content: (
        <div key="roles">
          <NewRoleForm />
          {roles.map((role) => (
            <RoleCard key={role.id} role={role} people={people} permissions={permissions} />
          ))}
        </div>
      ),
    },
    {
      key: "people",
      label: "People",
      content: <PersonView key="people" people={people} person={person} access={personAccess} roles={roles} grantable={grantable} />,
    },
    {
      key: "permissions",
      label: "Permissions",
      count: permissions.length,
      content: <PermissionView key="permissions" permissions={permissions} roles={roles} selected={params.permission ?? null} />,
    },
  ];

  return (
    <>
      {head(<InviteButton bundles={inviteBundles} groups={shapeGroups(registry)} may={mayProp(viewer, ["access.manage"])} />)}
      {leftover && <div className="admin-alert admin-alert--info">{leftover}</div>}
      <Tabs tabs={tabs} initialKey={params.tab ?? (params.person ? "people" : params.permission ? "permissions" : "roles")} syncParam="tab" />
    </>
  );
}
