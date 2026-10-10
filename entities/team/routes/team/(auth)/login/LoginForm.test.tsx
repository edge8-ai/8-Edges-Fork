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

describe("/team/login", () => {
  const html = renderToStaticMarkup(<LoginForm />);
  const props = propsOf(LoginForm);

  it("opens on the sign-in-link screen", () => {
    expect(props.defaultMode).toBe("link");
    expect(html).toContain(">Send sign-in link</button>");
    expect(html).toContain(">Sign in with a password</button>");
    expect(html).not.toContain('type="password"');
  });

  it("labels the email field Work email", () => {
    expect(html).toContain('<label class="admin-label" for="email">Work email</label>');
    expect(html).toContain(
      "Enter your work email and we will send you a sign-in link. No password needed.",
    );
  });

  it("lands on the team workspace after a password sign-in", () => {
    expect(props.redirectTo).toBe("/team");
  });
});
