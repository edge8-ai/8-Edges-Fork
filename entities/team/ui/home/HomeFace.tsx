// One face on the team Home (TH.1): the person's photo, or their initials on a
// client-palette tone when there is no photo. No hooks, so both the server
// cards and the client islands draw it.

const TONES = 8;

/** A stable tone for a person, so their initials keep one colour across the page. */
export function toneFor(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h % TONES;
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "·";
  return ((words[0][0] ?? "") + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
}

export function HomeFace({
  name,
  avatarUrl,
  tone,
  className = "",
}: {
  name: string;
  avatarUrl: string | null;
  tone: number;
  className?: string;
}) {
  return (
    <span className={`th-face tone-${tone} ${className}`.trim()} aria-hidden="true">
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- uploaded avatars of unknown size; next/image needs fixed dimensions
        <img src={avatarUrl} alt="" loading="lazy" decoding="async" />
      ) : (
        initials(name)
      )}
    </span>
  );
}
