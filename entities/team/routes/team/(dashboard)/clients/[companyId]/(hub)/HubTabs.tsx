"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Client hub tab nav. Active state from the pathname: exact match for
// Overview, prefix match for the subroutes. With AI Programs present, the
// Work Board and Roadmap tabs are labeled company-wide (program boards and
// roadmaps live in their program view), and dropCompanyWide removes them
// under the same guarded rule as the admin hub home; the routes themselves
// keep working for deep links either way.

export function HubTabs({
  base,
  hasPrograms,
  dropCompanyWide,
  showStatus = false,
}: {
  base: string;
  hasPrograms: boolean;
  dropCompanyWide: boolean;
  // The Weekly status page (Z.12) sits beside the hub, for whoever may open it
  // for this client (client-programs.status, scoped to the company); the tab
  // is offered only to them.
  showStatus?: boolean;
}) {
  const pathname = (usePathname() ?? "").replace(/\/$/, "");
  const companyWideTabs = dropCompanyWide
    ? []
    : [
        { href: "/board", label: hasPrograms ? "Work Board (company-wide)" : "Work Board" },
        { href: "/roadmap", label: hasPrograms ? "Roadmap (company-wide)" : "Roadmap" },
      ];
  const tabs = [
    { href: "", label: "Overview" },
    ...companyWideTabs,
    { href: "/documents", label: "Documents" },
    { href: "/meetings", label: "Meetings" },
    { href: "/invoices", label: "Invoices" },
    ...(showStatus ? [{ href: "/status", label: "Weekly status" }] : []),
    { href: "/team", label: "Team" },
  ];
  return (
    <nav className="admin-tabs u-mb-4">
      {tabs.map((t) => {
        const href = `${base}${t.href}`;
        const active = t.href === "" ? pathname === base : pathname.startsWith(href);
        return (
          <Link key={t.label} href={href} className={`admin-tab${active ? " is-active" : ""}`}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
