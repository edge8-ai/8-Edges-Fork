// What Home shows of training (TR.1), through the HomeTraining page slot: the
// certification card exactly as Home has always drawn it, and below it one
// banner into My Training. Khoa ruled on the canvas (2026-10-11) that the card
// itself does not change; the banner is the only addition. Like the other page
// slots it takes the person and reads their record itself, so Home never hands
// another entity a raw record to parse. A deployment that runs no certification
// programme shows neither, until My Training has trainings of its own (TR.2).
//
// A failed read hides the card rather than failing Home: one card's record is
// not worth the whole page, and drawing the tracks as "Not started" would be a
// wrong answer about the person's own progress. The failure is logged.
import Link from "next/link";
import { ReadFailure } from "@/kernel/data/read";
import { CERTIFICATION_PROGRAMME as PROGRAMME } from "../lib/certification-programme";
import { myCertifications } from "../lib/my-training-read";
import { HomeInstitute } from "./HomeInstitute";

export async function HomeTraining({ personId, greeting }: { personId: string; greeting: string | null }) {
  if (!PROGRAMME) return null;
  let tracks;
  try {
    tracks = await myCertifications(personId);
  } catch (e) {
    if (!(e instanceof ReadFailure)) throw e;
    console.error(`[training] Home card hidden: ${e.message}`);
    return null;
  }
  return (
    <div className="th-training">
      <HomeInstitute tracks={tracks} greeting={greeting} />
      <Link className="th-training-banner" href="/team/my-training">
        <span className="th-training-banner-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M6.5 6.5v11 M17.5 6.5v11 M3.5 9v6 M20.5 9v6 M6.5 12h11" />
          </svg>
        </span>
        <span className="th-training-banner-title">My Training</span>
        <span className="th-training-banner-sub">Certifications, courses and sessions in one place</span>
        <span className="th-training-banner-go">Open My Training →</span>
      </Link>
    </div>
  );
}
