import { describe, it, expect, vi } from "vitest";
import type { JSX } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// The three login pages are thin wrappers over kernel/ui/LoginForm. This test
// pins what this surface asks for — the screen it opens on, its labels and its
// post-sign-in redirect — so a change to the shared form cannot quietly alter
// this entity's page. There is no @testing-library/react in this repo, so the
// form is rendered with react-dom/server, which exercises the real component.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace() {}, refresh() {} }),
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("@/kernel/data/supabase/browser", () => ({ createBrowserSupabase: () => ({}) }));
vi.mock("./actions", () => ({
  requestSignInLink: async () => {},
  requestPasswordReset: async () => {},
}));

import { LoginForm } from "./LoginForm";
import { type LoginFormProps } from "@/kernel/ui/LoginForm";

// The props the wrapper hands the shared form, without rendering it.
function propsOf(Wrapper: () => JSX.Element): LoginFormProps {
  return (Wrapper() as unknown as { props: LoginFormProps }).props;
}

describe("/portal/login", () => {
  const html = renderToStaticMarkup(<LoginForm />);
  const props = propsOf(() => LoginForm({}));

  it("opens on the password screen", () => {
    expect(props.defaultMode).toBe("password");
    expect(html).toContain(">Sign in</button>");
    expect(html).toContain('<button type="button" class="admin-auth-link">Use a sign-in link instead</button>');
  });

  it("opens on the link screen when the verify page asks, after a dead link", () => {
    expect(propsOf(() => LoginForm({ defaultMode: "link" })).defaultMode).toBe("link");
  });

  it("labels the fields Email and Password, with the reset link on the label row", () => {
    expect(html).toContain('<label class="admin-label" for="email">Email</label>');
    expect(html).toContain('<label class="admin-label" for="password">Password</label>');
    expect(html).toContain('<button type="button" class="admin-auth-link">Forgot password?</button>');
    expect(html).toContain('autoComplete="current-password"');
  });

  it("lands on the portal after a password sign-in", () => {
    expect(props.redirectTo).toBe("/portal");
  });
});
