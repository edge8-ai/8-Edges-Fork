import type { Metadata } from "next";
import { TEAM_APP_METADATA } from "@/entities/team/lib/installable-app";

// Bare, UN-gated auth shell so /team/login is reachable without a session. The
// (dashboard) group carries the requireTeamMember() gate. The sign-in page is
// installable too, because it is where a signed-out phone lands first.
export const metadata: Metadata = {
  title: "Sign in · Edge8 Team",
  robots: { index: false, follow: false },
  ...TEAM_APP_METADATA,
};

export default function TeamAuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
