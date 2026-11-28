import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getEventBySlug, getEventTiers } from "@/entities/retreats/events-server";
import { eventPriceSummary, formatEventDates, parseVideoEmbed, tierPriceLabel, type EventMedia } from "@/entities/retreats/events";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { RegisterForm, type TierOption } from "./RegisterForm";
import styles from "./event.module.css";
import { ExternalLink } from "@/kernel/ui/ExternalLink";

// The canonical signup page every event gets (design §5): ticket options with
// prices or "Free", and the register form. Bespoke marketing pages (e.g.
// /saigon-private) remain the hand-crafted layer on top; this page is the URL
// behind every event's QR code. Server components only — no browser Supabase
// clients (Preview builds lack the public env vars).

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const params = await props.params;
  const event = await getEventBySlug(params.slug);
  if (!event || event.status === "draft") return { title: "Event — Edge8", robots: { index: false } };
  const indexable = event.visibility === "public" && (event.status === "open" || event.status === "published");
  return {
    title: `${event.title} — Edge8`,
    description: event.blurb ?? event.description?.slice(0, 160) ?? undefined,
    robots: indexable ? undefined : { index: false },
    openGraph: {
      title: event.title,
      description: event.blurb ?? undefined,
      ...(event.cover_image_url ? { images: [{ url: event.cover_image_url }] } : {}),
    },
  };
}

const CLOSED_COPY: Record<string, string> = {
  published: "Registration isn't open yet. Check back soon, or watch this page.",
  closed: "Registration for this event has closed.",
  completed: "This event has wrapped. Thanks to everyone who joined.",
  cancelled: "This event was cancelled.",
};

export default async function PublicEventPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const event = await getEventBySlug(params.slug);
  if (!event || event.status === "draft") notFound();

  const tiers = await getEventTiers(event.id); // active only
  const tierOptions: TierOption[] = tiers.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    priceLabel: tierPriceLabel(t),
    isFree: t.amount_cents === 0,
  }));
  const dateLabel = formatEventDates(event.starts_at, event.ends_at, event.timezone);
  const isOpen = event.status === "open";

  const jsonLd =
    event.visibility === "public"
      ? {
          "@context": "https://schema.org",
          "@type": "Event",
          name: event.title,
          ...(event.blurb ? { description: event.blurb } : {}),
          ...(event.starts_at ? { startDate: event.starts_at } : {}),
          ...(event.ends_at ? { endDate: event.ends_at } : {}),
          ...(event.location ? { location: { "@type": "Place", name: event.location } } : {}),
          ...(event.cover_image_url ? { image: [event.cover_image_url] } : {}),
          eventStatus:
            event.status === "cancelled"
              ? "https://schema.org/EventCancelled"
              : "https://schema.org/EventScheduled",
          url: `${await getSiteOrigin()}/events/${event.slug}`,
          offers: {
            "@type": "Offer",
            price:
              tiers.length === 0 ? 0 : Math.min(...tiers.map((t) => t.amount_cents)) / 100,
            priceCurrency: (tiers[0]?.currency ?? "usd").toUpperCase(),
            availability:
              event.status === "open"
                ? "https://schema.org/InStock"
                : "https://schema.org/SoldOut",
          },
        }
      : null;

  return (
    <main className={styles.page}>
      {jsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      )}
      <div className={styles.card}>
        <div className={`${styles.eyebrow} brand-label`}>Edge8 event</div>
        <h1 className={styles.title}>{event.title}</h1>
        <p className={styles.meta}>
          {dateLabel}
          {event.location ? ` · ${event.location}` : ""}
        </p>
        <p className={styles.meta}>{tiers.length === 0 ? <span className={styles.free}>Free</span> : eventPriceSummary(tiers)}</p>

        {event.cover_image_url && (
          // eslint-disable-next-line @next/next/no-img-element -- uploaded file of unknown size; next/image needs fixed dimensions
          <img src={event.cover_image_url} alt={event.title} className={styles.cover} />
        )}

        {event.blurb && !event.description && <p className={styles.blurb}>{event.blurb}</p>}
        {event.description && (
          <div>
            {event.description
              .split(/\n{2,}/)
              .map((para) => para.trim())
              .filter(Boolean)
              .map((para, i) => (
                <p key={i} className={styles.blurb}>
                  {para}
                </p>
              ))}
          </div>
        )}

        <MediaGallery media={event.media} title={event.title} />

        {!isOpen && tierOptions.length > 0 && (
          <>
            <h2 className={styles.sectionLabel}>Tickets</h2>
            <div className={styles.tiers}>
              {tierOptions.map((t) => (
                <div key={t.id} className={`${styles.tier} ${styles.tierStatic}`}>
                  <div>
                    <div className={styles.tierName}>{t.title}</div>
                    {t.description && <div className={styles.tierDesc}>{t.description}</div>}
                  </div>
                  {t.isFree ? <span className={styles.free}>Free</span> : <div className={styles.tierPrice}>{t.priceLabel}</div>}
                </div>
              ))}
            </div>
          </>
        )}

        {isOpen ? (
          <RegisterForm slug={event.slug} tiers={tierOptions} />
        ) : (
          <div className={styles.notice}>{CLOSED_COPY[event.status] ?? "Registration isn't available right now."}</div>
        )}
      </div>
    </main>
  );
}

// Ordered media gallery: images as figures with captions, videos as
// privacy-friendly embeds (YouTube nocookie / Vimeo player), direct files as
// <video>, anything unrecognized as an outbound link.
function MediaGallery({ media, title }: { media: EventMedia[]; title: string }) {
  const items = Array.isArray(media) ? media.filter((m) => m && m.url) : [];
  if (items.length === 0) return null;
  return (
    <div className={styles.gallery}>
      {items.map((m, i) => {
        if (m.kind === "image") {
          return (
            <figure key={i} className={styles.galleryItem}>
              {/* eslint-disable-next-line @next/next/no-img-element -- uploaded file of unknown size; next/image needs fixed dimensions */}
              <img src={m.url} alt={m.caption || title} className={styles.galleryImg} loading="lazy" />
              {m.caption && <figcaption className={styles.galleryCaption}>{m.caption}</figcaption>}
            </figure>
          );
        }
        const embed = parseVideoEmbed(m.url);
        return (
          <figure key={i} className={styles.galleryItem}>
            {"embedSrc" in embed ? (
              <div className={styles.videoFrame}>
                <iframe
                  src={embed.embedSrc}
                  title={m.caption || `${title} video`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  loading="lazy"
                />
              </div>
            ) : embed.type === "file" ? (
              // These clips are admin-uploaded event footage with no caption
              // track to attach; the <figcaption> below carries the media's
              // description instead.
              <video className={styles.galleryImg} src={embed.url} controls preload="metadata" />
            ) : (
              <ExternalLink href={embed.url} className={styles.videoLink}>
                Watch video ↗
              </ExternalLink>
            )}
            {m.caption && <figcaption className={styles.galleryCaption}>{m.caption}</figcaption>}
          </figure>
        );
      })}
    </div>
  );
}
