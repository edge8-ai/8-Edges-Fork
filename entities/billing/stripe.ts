import Stripe from "stripe";
import { optionalEnv, requireEnv } from "@/kernel/config/env";

// Server-only Stripe client. NEVER import this from a client component.
// Live key in production, test key in dev. Matches the aio-website pattern.
//
// The client is built on first use rather than at import time. The previous
// version fell back to a placeholder key, which turned "the key is missing" into
// an opaque 401 from Stripe at checkout. Now a missing key throws
// `STRIPE_SECRET_KEY is not set` at the first call — and importing this module
// (which every checkout route does) stays free of side effects for pages that
// never reach Stripe in a given request.

function secretKey(): string {
  if (process.env.NODE_ENV === "production") return requireEnv("STRIPE_SECRET_KEY");
  return optionalEnv("STRIPE_SECRET_TEST_KEY") ?? requireEnv("STRIPE_SECRET_KEY");
}

let client: Stripe | undefined;

function getStripe(): Stripe {
  if (!client) client = new Stripe(secretKey(), { typescript: true });
  return client;
}

// Same call shape as before (`stripe.checkout.sessions.create(...)`), so the
// five call sites did not change; the proxy resolves the real client lazily.
export const stripe: Stripe = new Proxy({} as Stripe, {
  get(_target, prop, _receiver) {
    const real = getStripe();
    return Reflect.get(real, prop, real);
  },
});

export const STRIPE_WEBHOOK_SECRET =
  process.env.NODE_ENV === "production"
    ? process.env.STRIPE_WEBHOOK_SECRET
    : process.env.STRIPE_WEBHOOK_TEST_SECRET ?? process.env.STRIPE_WEBHOOK_SECRET;
