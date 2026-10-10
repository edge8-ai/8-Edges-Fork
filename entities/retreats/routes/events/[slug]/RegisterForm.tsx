"use client";

import { useState } from "react";
import { registerForEventPublic, type PublicRegisterResult } from "./actions";
import styles from "./event.module.css";

export type TierOption = {
  id: string;
  title: string;
  description: string | null;
  priceLabel: string;
  isFree: boolean;
};

type Done = Extract<PublicRegisterResult, { ok: true; status: "registered" | "waitlisted" }>;

// Registration form for open events. Free tiers (or a no-tier event) confirm
// in place; a paid tier hands the browser off to Stripe Checkout and the
// webhook completes the registration.
export function RegisterForm({ slug, tiers }: { slug: string; tiers: TierOption[] }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [guests, setGuests] = useState("0");
  const [tierId, setTierId] = useState(tiers[0]?.id ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  const selectedTier = tiers.find((t) => t.id === tierId) ?? null;
  const isPaid = !!selectedTier && !selectedTier.isFree;

  if (done) {
    return (
      <div className={styles.success}>
        <div className={styles.successTitle}>
          {done.status === "waitlisted"
            ? `You're on the waitlist${done.waitlistPosition ? ` — #${done.waitlistPosition}` : ""}`
            : done.alreadyRegistered
              ? "You're already registered"
              : "You're in!"}
        </div>
        <div className={styles.successBody}>
          {done.status === "waitlisted"
            ? "The event is currently full. We'll email you if a seat opens up."
            : "Check your email for confirmation — and here's your ticket:"}
        </div>
        {done.status === "registered" && done.ticketPath && (
          <a className={styles.ticketLink} href={done.ticketPath}>
            View my ticket
          </a>
        )}
      </div>
    );
  }

  async function submit() {
    setPending(true);
    setError(null);
    const r = await registerForEventPublic(slug, {
      name,
      email,
      phone: phone || undefined,
      productId: tierId || null,
      guestCount: Number(guests) || 0,
    });
    if (!r.ok) {
      setPending(false);
      return setError(r.error);
    }
    if (r.status === "payment") {
      // Keep the button in its pending state through the redirect.
      window.location.href = r.checkoutUrl;
      return;
    }
    setPending(false);
    setDone(r);
  }

  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <h2 className={styles.sectionLabel}>Register</h2>

      {tiers.length > 0 && (
        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>Ticket</span>
          <div className={styles.tiers}>
            {tiers.map((t) => (
              <button
                type="button"
                key={t.id}
                className={`${styles.tier} ${tierId === t.id ? styles.tierActive : ""}`}
                onClick={() => setTierId(t.id)}
                aria-pressed={tierId === t.id}
              >
                <div>
                  <div className={styles.tierName}>{t.title}</div>
                  {t.description && <div className={styles.tierDesc}>{t.description}</div>}
                </div>
                {t.isFree ? <span className={styles.free}>Free</span> : <span className={styles.tierPrice}>{t.priceLabel}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={styles.fieldRow}>
        <label className={styles.fieldLabel} htmlFor="reg-name">
          Name
        </label>
        <input id="reg-name" className={styles.input} value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
      </div>
      <div className={styles.fieldRow}>
        <label className={styles.fieldLabel} htmlFor="reg-email">
          Email
        </label>
        <input
          id="reg-email"
          className={styles.input}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
      </div>
      <div className={styles.fieldRow}>
        <label className={styles.fieldLabel} htmlFor="reg-phone">
          Phone <span>(optional)</span>
        </label>
        <input id="reg-phone" className={styles.input} value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
      </div>
      {!isPaid && (
        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel} htmlFor="reg-guests">
            Guests you&apos;re bringing
          </label>
          <input
            id="reg-guests"
            className={styles.input}
            type="number"
            min={0}
            max={4}
            value={guests}
            onChange={(e) => setGuests(e.target.value)}
          />
        </div>
      )}

      {error && <div className={styles.error}>{error}</div>}

      <button type="submit" className={styles.btnPrimary} disabled={pending}>
        {pending ? (isPaid ? "Heading to payment…" : "Registering…") : isPaid ? `Continue to payment · ${selectedTier.priceLabel}` : "Register"}
      </button>
      <div className={styles.hint}>
        {isPaid
          ? "Your seat is held for 30 minutes while you pay. You'll get your ticket by email once payment completes."
          : "You'll get a confirmation email with your ticket link."}
      </div>
    </form>
  );
}
