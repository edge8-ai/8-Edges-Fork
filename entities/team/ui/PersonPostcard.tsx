import Link from "next/link";
import type { ReactNode } from "react";
import type { MemberProfile } from "@/entities/team/lib/data";
import { hobbyIcon, missingSentence, orgMark, postmarkDate } from "@/entities/team/lib/postcard";
import { formatDate, humanize, initials } from "@/kernel/ui/format";
import { PhotoDoodles, PostcardSky, PostmarkWaves } from "./PostcardDecor";

// A colleague's profile drawn as a postcard (OV.5, approved on the canvas on
// 18 Oct 2026). The front is the person: photo, name, and what they shared to
// be known by. The back is the role, written like an address, with the
// hometown as the stamp and the start date as the postmark. It shows exactly
// the fields the page showed before; only empty ones are folded into one
// "not added yet" line instead of a column of dashes.
//
// On the person's own profile the same postcard is the editor (TH.9): `edit`
// puts an in-place editor where the photo's button, the hometown, the
// education and the hobbies are drawn, and shows those rows even while empty,
// so what someone edits is exactly what teammates will see.
export type PostcardEdit = { photo: ReactNode; hometown: ReactNode; education: ReactNode; hobbies: ReactNode };

/** One hobby sticker: its tone and tilt by position, its icon by keyword. `children` adds a control (the editor's remove button). */
export function PostcardSticker({ hobby, index, children }: { hobby: string; index: number; children?: ReactNode }) {
  return (
    <li className={`tp-sticker tp-tone-${index % 6} tp-tilt-${index % 4}`}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={hobbyIcon(hobby)} />
      </svg>
      {hobby}
      {children}
    </li>
  );
}

/**
 * `nameLevel` 2 when the postcard sits under a page that already names the
 * person in its h1 (the dressed profile's plaque, LD.6), so a page has one h1.
 * `badges` is the badge stickers the person wears beside their hobbies
 * (LD.7b), drawn by the ladders through the postcardStickers page slot; none,
 * and there is no Badges row.
 */
export function PersonPostcard({ profile, orgName, edit, nameLevel = 1, badges }: { profile: MemberProfile; orgName: string | null; edit?: PostcardEdit; nameLevel?: 1 | 2; badges?: ReactNode }) {
  const Name = nameLevel === 2 ? "h2" : "h1";
  const mark = orgMark(orgName);
  const legal = profile.fullName && profile.fullName !== profile.name ? profile.fullName : null;
  const roleLine = [profile.positionTitle, profile.departmentName].filter(Boolean).join(" · ");
  const hasKnow = Boolean(profile.education || profile.hobbies.length || profile.hometown);
  const since = postmarkDate(profile.startDate);
  const rows: { label: string; value: string | null; href?: string }[] = [
    { label: "Position", value: profile.positionTitle },
    { label: "Department", value: profile.departmentName },
    { label: "Location", value: profile.workLocation },
    {
      label: "Manager",
      value: profile.managerName,
      href: profile.managerId && profile.managerName ? `/team/directory/${profile.managerId}` : undefined,
    },
    { label: "Employment type", value: profile.employmentType ? humanize(profile.employmentType) : null },
  ];
  const missing = missingSentence(rows.filter((r) => !r.value).map((r) => r.label));
  const startText = profile.startDate ? formatDate(profile.startDate) : null;

  return (
    <div className="tp-scene">
      <PostcardSky />
      <div className="tp-air">
        <article className="tp-card" aria-label={`Profile of ${profile.name}`}>
          <div className="tp-front">
            <div className="tp-photo-col">
              <figure className="tp-photo">
                {profile.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- uploaded file of unknown size; next/image needs fixed dimensions
                  <img src={profile.avatarUrl} alt={profile.name} />
                ) : (
                  <div className="tp-initials" aria-hidden="true">{initials(profile.name)}</div>
                )}
                <span className="tp-tape tp-tape-l" aria-hidden="true" />
                <span className="tp-tape tp-tape-r" aria-hidden="true" />
                {edit?.photo}
                {(edit || profile.hometown) && (
                  <figcaption className="tp-greet">
                    <span className="tp-greet-k">Greetings from</span>
                    <span className="tp-greet-v">{edit ? edit.hometown : profile.hometown}</span>
                  </figcaption>
                )}
              </figure>
              <PhotoDoodles mark={mark} />
            </div>
            <div className="tp-who">
              {orgName && <p className="tp-eyebrow">{orgName} Team</p>}
              <Name className="tp-name">{profile.name}</Name>
              {legal && <p className="tp-legal">{legal}</p>}
              {roleLine && <p className="tp-role">{roleLine}</p>}
              <div className="tp-know">
                {/* The whole shown name, as before: a first word is a family name
                    for Vietnamese-order names (kernel/config/people-name.ts). */}
                <h2 className="tp-eyebrow">Get to know {profile.name}</h2>
                {(edit || profile.education) && (
                  <div className="tp-fact">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M2 9l10-5 10 5-10 5z M6 11v5c3 2.5 9 2.5 12 0v-5" />
                    </svg>
                    <span className="tp-fact-label">Education</span>
                    {edit ? edit.education : <span>{profile.education}</span>}
                  </div>
                )}
                {(edit || profile.hobbies.length > 0) && (
                  <>
                    <div className="tp-fact">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 20s-7-4.4-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.6-9 9-9 9z" />
                      </svg>
                      <span className="tp-fact-label" id="tp-hobbies-label">Hobbies</span>
                    </div>
                    {edit ? (
                      edit.hobbies
                    ) : (
                      <ul className="tp-stickers" aria-labelledby="tp-hobbies-label">
                        {profile.hobbies.map((h, i) => (
                          <PostcardSticker key={`${h}-${i}`} hobby={h} index={i} />
                        ))}
                      </ul>
                    )}
                  </>
                )}
                {badges ? (
                  <>
                    <div className="tp-fact">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="12" cy="14" r="6" />
                        <path d="M8 3l4 5 4-5" />
                      </svg>
                      <span className="tp-fact-label">Badges</span>
                    </div>
                    {badges}
                  </>
                ) : null}
                {!hasKnow && !edit && !badges && <p className="tp-empty">No hometown, education or hobbies added yet.</p>}
              </div>
            </div>
          </div>
          <div className="tp-rule" aria-hidden="true" />
          <div className="tp-back">
            <div className="tp-marks">
              <div className="tp-avion" aria-hidden="true">
                <span>Par avion</span>
                <span>By air mail</span>
              </div>
              <PostmarkWaves />
              <div className="tp-stampwrap">
                <div className="tp-stamp" role="img" aria-label={profile.hometown ? `Hometown: ${profile.hometown}` : "Hometown not added"}>
                  <div className="tp-stamp-in">
                    <div className="tp-stamp-top" aria-hidden="true">
                      <span>Hometown</span>
                      {mark && <span className="tp-stamp-mark">{mark}</span>}
                    </div>
                    <svg width="54" height="40" viewBox="0 0 54 40" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="38" cy="11" r="6" />
                      <path d="M2 36l14-16 9 9 7-6 20 13z" />
                      <path d="M2 36h50" />
                    </svg>
                    <div className="tp-stamp-v" aria-hidden="true">{profile.hometown || "Not added yet"}</div>
                  </div>
                </div>
              </div>
              <div
                className="tp-post"
                role="img"
                aria-label={startText ? `Started on ${startText}` : "Start date not added"}
              >
                <span className="tp-post-k" aria-hidden="true">{since ? "Since" : orgName ?? ""}</span>
                <span className="tp-post-d" aria-hidden="true">{since ? since.day : "Team"}</span>
                {since && <span className="tp-post-y" aria-hidden="true">{since.year}</span>}
              </div>
            </div>
            <dl className="tp-rows">
              {rows
                .filter((r) => r.value)
                .map((r) => (
                  <div key={r.label} className="tp-row">
                    <dt>{r.label}</dt>
                    <dd>{r.href ? <Link href={r.href}>{r.value}</Link> : r.value}</dd>
                  </div>
                ))}
            </dl>
            {missing && <p className="tp-missing">{missing}</p>}
          </div>
        </article>
      </div>
    </div>
  );
}
