import type { Metadata } from "next";
import Link from "next/link";
import { stripe } from "@/entities/billing/stripe";
import { SUPPORT_EMAIL } from "@/kernel/config/organisation";

export const metadata: Metadata = {
  title: "You're in · Edge8",
  description: "Your retreat is reserved.",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ event?: string; session_id?: string }>;

const STEPS = [
  { n: "1", head: "Check your inbox", sub: "A receipt and a confirmation are on their way to your email." },
  { n: "2", head: "Pre-retreat consultation", sub: "We'll reach out to lock your scope before you fly, so day one is build day." },
  { n: "3", head: "You arrive and build", sub: "Quan hosts, the team builds it with you. Fly home with working software." },
];

export default async function CheckoutSuccess({ searchParams }: { searchParams: SearchParams }) {
  const { session_id } = await searchParams;

  // Best-effort: pull the paid amount + email to personalise the page. Never
  // block the confirmation if Stripe errors.
  let amount: string | null = null;
  let email: string | null = null;
  if (session_id) {
    try {
      const session = await stripe.checkout.sessions.retrieve(session_id);
      if (session.amount_total) {
        amount = new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: (session.currency ?? "usd").toUpperCase(),
          maximumFractionDigits: 0,
        }).format(session.amount_total / 100);
      }
      email = session.customer_details?.email ?? session.customer_email ?? null;
    } catch {
      // non-essential — confirmation still renders
    }
  }

  return (
    <main>
      <section className="hero u-pb-0">
        <div className="hero-bg" />
        <div className="hero-grid" />
        <div className="container">
          <div className="hero-content">
            <div className="hero-eyebrow">✓ Reservation confirmed</div>
            <h1 className="hero-headline">
              You&rsquo;re <span className="accent">in.</span>
            </h1>
            <p className="hero-sub">
              Your Saigon private retreat is reserved{amount ? ` — ${amount} paid` : ""}. We&rsquo;ve
              sent a receipt{email ? ` to ${email}` : ""}, and the team will follow up shortly with
              what to expect.
            </p>
            <div className="hero-actions u-mt-6">
              <Link href="/" className="btn btn-primary">Back to home</Link>
              <Link href="/saigon-private" className="btn btn-ghost-light">Retreat details</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="form-card site-max-600 u-mx-auto">
            <span className="site-reserve-recap-label">What happens next</span>
            <ol className="site-reserve-steps">
              {STEPS.map((s) => (
                <li key={s.n}>
                  <span className="site-reserve-step-num">{s.n}</span>
                  <span>
                    <span className="site-reserve-incl-head">{s.head}</span>
                    <span className="site-reserve-incl-sub">{s.sub}</span>
                  </span>
                </li>
              ))}
            </ol>
            <p className="site-note u-mt-5">
              Questions? Email{" "}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="site-reserve-inline-link">{SUPPORT_EMAIL}</a>.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
