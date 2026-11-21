// An empty list on My Team › Training (TH.17): what will show there, said in
// one line under a bold one, beside an icon. It never repeats the card's own
// action; the button sits in the card's head.

const ICONS = {
  plan: (
    <>
      <path d="M17 2.5 20.5 6 17 9.5" />
      <path d="M3.5 11V9.5A3.5 3.5 0 0 1 7 6h13.5" />
      <path d="M7 21.5 3.5 18 7 14.5" />
      <path d="M20.5 13v1.5A3.5 3.5 0 0 1 17 18H3.5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M8 3v4 M16 3v4 M3.5 10h17" />
    </>
  ),
};

export function TrainingEmpty({ icon, title, children }: { icon: keyof typeof ICONS; title: string; children: string }) {
  return (
    <div className="tr-empty">
      <span className="tr-empty-ico" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {ICONS[icon]}
        </svg>
      </span>
      <div>
        <p className="tr-empty-t">{title}</p>
        <p className="tr-hint">{children}</p>
      </div>
    </div>
  );
}
