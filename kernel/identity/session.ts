import { redirect } from "next/navigation";
import { createSessionClient } from "@/kernel/data/supabase/server";
import { supabase } from "@/kernel/data/supabase";
import { getSiteOrigin } from "@/kernel/config/site-origin";

// The three authenticated surfaces (/admin, /team, /portal) all sign out the
// same way — drop the Supabase session cookie, then send the person back to
// their own login page. Only the login path differs, so it is the parameter.
export type LoginPath = "/admin/login" | "/team/login" | "/portal/login";

export async function signOutTo(loginPath: LoginPath): Promise<never> {
  const client = await createSessionClient();
  await client.auth.signOut();
  redirect(loginPath);
}

// Every self-serve sign-in / password-reset sender mints its link the same way:
// ask Supabase for a link of the given type, keep only the hashed token, and
// wrap it in the surface's own /verify interstitial so corporate mail scanners
// cannot consume the token by prefetching it. The senders differ in who they
// let through and what they say; this is the step that does not differ, so it
// lives here. Callers get the failure reason because the portal sender logs it.
//
// An `invite` creates the auth user without Supabase sending its own email (the
// caller sends a branded one), and may carry user metadata (`data`); the new
// user's id comes back with the link.
export async function mintVerifyLink(params: {
  type: "magiclink" | "recovery" | "invite";
  email: string;
  redirectTo: string;
  verifyPath: string;
  data?: Record<string, unknown>;
}): Promise<{ verifyUrl: string; userId: string | null } | { error: string }> {
  const origin = await getSiteOrigin();
  const redirectTo = `${origin}${params.redirectTo}`;
  const { data, error } =
    params.type === "invite"
      ? await supabase.auth.admin.generateLink({ type: "invite", email: params.email, options: { redirectTo, data: params.data } })
      : await supabase.auth.admin.generateLink({ type: params.type, email: params.email, options: { redirectTo } });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) return { error: error?.message ?? "no token_hash" };
  return {
    verifyUrl: `${origin}${params.verifyPath}?token_hash=${encodeURIComponent(tokenHash)}&type=${params.type}`,
    userId: data.user?.id ?? null,
  };
}
