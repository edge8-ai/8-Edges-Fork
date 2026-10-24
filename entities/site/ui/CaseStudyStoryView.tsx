import Image from 'next/image'
import Link from 'next/link'
import type { CaseStudyStory } from '@/entities/site/lib/caseStudyStories'

// The story layout of a case study: a headline with a number, three stats, then
// a 2:1 body with the fact rail on the right. The legacy layout (challenge,
// approach, result beside photos) stays in the route for studies without a story.

function Quotes({ story, after }: { story: CaseStudyStory; after: 'situation' | 'changed' }) {
  return (
    <>
      {(story.quotes ?? []).filter((q) => q.after === after).map((q) => (
        <blockquote key={q.text} className="cs-story-quote">
          <p>&ldquo;{q.text}&rdquo;</p>
          <cite>{q.by}</cite>
        </blockquote>
      ))}
    </>
  )
}

export default function CaseStudyStoryView({
  story, title, image, eyebrow, summary, backHref, backLabel,
}: {
  story: CaseStudyStory
  title: string
  image?: string
  eyebrow: string
  summary: string
  backHref: string
  backLabel: string
}) {
  return (
    <>
      <section className="cs-detail-hero cs-detail-hero--dark">
        <div className="container">
          <div className="cs-detail-hero-inner cs-story-hero">
            <div className="cs-eyebrow">{eyebrow}</div>
            <h1 className="cs-story-title">{story.headline}</h1>
            {story.status && <p className="cs-story-status">{story.status}</p>}
          </div>
          <div className="cs-story-stats">
            {story.stats.map((s) => (
              <div key={s.value + s.label} className="cs-story-stat">
                <div className="cs-story-stat-num">{s.value}</div>
                <p className="cs-story-stat-label">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="cs-detail-content">
        <div className="container">
          <div className="cs-story-layout">
            <div>
              <Link href={backHref} className="cs-detail-back">
                ← Back to {backLabel}
              </Link>

              <div className="cs-detail-block">
                <div className="cs-detail-block-label">Summary</div>
                <p className="cs-detail-body">{summary}</p>
              </div>

              {image && (
                <div className="cs-story-photo cs-story-photo--wide">
                  <Image src={image} alt={title} width={1600} height={900} priority />
                </div>
              )}

              <div className="cs-detail-block">
                <div className="cs-detail-block-label">The Situation</div>
                {story.situation.map((p) => <p key={p} className="cs-detail-body cs-story-para">{p}</p>)}
                <Quotes story={story} after="situation" />
              </div>

              {story.education && (
                <div className="cs-detail-block">
                  <div className="cs-detail-block-label">The Education</div>
                  <p className="cs-story-lede">{story.education.title}</p>
                  <p className="cs-detail-body">{story.education.body}</p>
                  <div className="cs-story-edu">
                    {story.education.stats.map((e) => (
                      <div key={e.label} className="cs-story-edu-stat">
                        <span className="cs-story-edu-num">{e.value}</span>
                        <span className="cs-story-edu-label">{e.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="cs-detail-block">
                <div className="cs-detail-block-label">What We Built</div>
                <ol className="cs-story-steps">
                  {story.built.map((b) => (
                    <li key={b.title}>
                      <strong>{b.title}</strong> {b.body}
                    </li>
                  ))}
                </ol>
                {story.photos && (
                  <div className="cs-story-photos">
                    {story.photos.map((p) => (
                      <figure key={p.src} className="cs-story-photo">
                        <Image src={p.src} alt={p.alt} width={800} height={600} />
                        <figcaption>{p.caption}</figcaption>
                      </figure>
                    ))}
                  </div>
                )}
              </div>

              <div className="cs-detail-block">
                <div className="cs-detail-block-label">What Changed</div>
                <ul className="cs-detail-list">
                  {story.changed.map((c) => <li key={c}>{c}</li>)}
                </ul>
                <Quotes story={story} after="changed" />
              </div>

              {story.video && (
                <div className="cs-detail-block">
                  <div className="cs-detail-block-label">In Their Words</div>
                  <div className="cs-story-words">
                  <div className="cs-story-video">
                    <div className="video-frame--short">
                      <iframe
                        src={`https://www.youtube.com/embed/${story.video.youtubeId}?playsinline=1`}
                        title={story.video.title}
                        allow="encrypted-media"
                        allowFullScreen
                        loading="lazy"
                      />
                    </div>
                    <p className="cs-story-video-caption">{story.video.caption}</p>
                  </div>
                  {story.portrait && (
                    <figure className="cs-story-photo cs-story-portrait">
                      <Image src={story.portrait.src} alt={story.portrait.alt} width={600} height={800} />
                      <figcaption>{story.portrait.caption}</figcaption>
                    </figure>
                  )}
                  </div>
                </div>
              )}

              <div className="cs-detail-block">
                <div className="cs-detail-block-label">What You Can Steal</div>
                <div className="cs-story-steal">
                  {story.steal.map((s) => (
                    <div key={s.title} className="cs-story-steal-item">
                      <strong>{s.title}</strong>
                      <p className="cs-detail-body">{s.body}</p>
                    </div>
                  ))}
                </div>
              </div>

              {story.reading && (
                <div className="cs-detail-block">
                  <div className="cs-detail-block-label">Learn the Concepts</div>
                  <ul className="cs-story-reading">
                    {story.reading.map((r) => (
                      <li key={r.href}><Link href={r.href}>{r.title}</Link></li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="cs-detail-block">
                <div className="cs-detail-block-label">Next Step</div>
                <p className="cs-detail-body">{story.next.text}</p>
                <div className="cs-detail-buttons">
                  <Link href={story.next.href} className="btn btn-primary">{story.next.label}</Link>
                </div>
              </div>
            </div>

            <aside className="cs-story-rail" aria-label="Case study facts">
              <dl className="cs-story-facts">
                {story.facts.map((f) => (
                  <div key={f.label} className="cs-story-fact">
                    <dt>{f.label}</dt>
                    <dd>{f.value}</dd>
                  </div>
                ))}
              </dl>
            </aside>
          </div>
        </div>
      </section>
    </>
  )
}
