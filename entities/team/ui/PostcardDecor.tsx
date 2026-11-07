// The postcard page's decorations (OV.5): the sky behind the card and the
// doodles under the photo. All of it is aria-hidden and coloured from tokens by
// app/styles/team-profile.css, so nothing here carries a colour of its own.

const STAR = "M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z";
const CLOUD = "M18 40h86a14 14 0 0 0 0-28 20 20 0 0 0-37-6A16 16 0 0 0 40 14 13 13 0 0 0 18 40z";

export function PostcardSky() {
  return (
    <div className="tp-sky" aria-hidden="true">
      <svg className="tp-cloud tp-cloud-1" width="120" height="44" viewBox="0 0 120 44"><path d={CLOUD} /></svg>
      <svg className="tp-cloud tp-cloud-2" width="84" height="30" viewBox="0 0 120 44"><path d={CLOUD} /></svg>
      <svg className="tp-trail" width="300" height="44" viewBox="0 0 300 44" fill="none">
        <path d="M2 38C70 6 150 2 214 20s60 8 78-6" strokeWidth="2" strokeDasharray="2 7" strokeLinecap="round" />
      </svg>
      <svg className="tp-plane" width="40" height="34" viewBox="0 0 40 34" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
        <path d="M2 15 38 2 26 32l-7-11z" />
        <path d="M19 21 38 2" fill="none" />
      </svg>
      <svg className="tp-sun" width="40" height="40" viewBox="0 0 40 40" fill="none" strokeWidth="2.4" strokeLinecap="round">
        <circle cx="20" cy="20" r="8" />
        <path d="M20 3v5M20 32v5M3 20h5M32 20h5M8 8l3.5 3.5M28.5 28.5 32 32M8 32l3.5-3.5M28.5 11.5 32 8" />
      </svg>
      <svg className="tp-star tp-star-gold tp-sky-star-1" width="18" height="18" viewBox="0 0 24 24"><path d={STAR} /></svg>
      <svg className="tp-star tp-star-pink tp-sky-star-2" width="12" height="12" viewBox="0 0 24 24"><path d={STAR} /></svg>
      <svg className="tp-star tp-star-violet tp-sky-star-3" width="14" height="14" viewBox="0 0 24 24"><path d={STAR} /></svg>
    </div>
  );
}

// The doodles that fill the space under the photo on a wide card; the phone
// layout hides them, because there the text follows the photo directly.
export function PhotoDoodles({ mark }: { mark: string | null }) {
  return (
    <div className="tp-doodles" aria-hidden="true">
      <span className="tp-ring" />
      <span className="tp-badge">
        {mark && <span className="tp-badge-v">{mark}</span>}
        <span className="tp-badge-k">Team</span>
      </span>
      <svg className="tp-arrow" width="70" height="66" viewBox="0 0 70 66" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 62c14-6 30-14 30-28 0-10-12-12-14-4-2 9 14 12 24 2 6-6 10-16 12-26" />
        <path d="M50 10l8-4 3 9" />
      </svg>
      <svg className="tp-heart" width="34" height="32" viewBox="0 0 24 24" strokeWidth="1.8" strokeLinejoin="round">
        <path d="M12 20s-7-4.4-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.6-9 9-9 9z" />
      </svg>
      <svg className="tp-star tp-star-gold tp-doodle-star-1" width="16" height="16" viewBox="0 0 24 24"><path d={STAR} /></svg>
      <svg className="tp-star tp-star-violet tp-doodle-star-2" width="12" height="12" viewBox="0 0 24 24"><path d={STAR} /></svg>
    </div>
  );
}

// The airmail cancellation lines that run into the postmark.
export function PostmarkWaves() {
  const wave = "c8-5 16 5 24 0s16 5 24 0 16 5 24 0 16 5 20 2";
  return (
    <svg className="tp-waves" width="96" height="36" viewBox="0 0 96 36" fill="none" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d={`M2 6${wave}`} />
      <path d={`M2 18${wave}`} />
      <path d={`M2 30${wave}`} />
    </svg>
  );
}
