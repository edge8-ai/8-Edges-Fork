// The reader's own certification tracks, for My Training and Home (TR.1). The progress
// lives on the person's record (people.metadata.certifications, written by the
// nightly sync), a kernel table every entity may read. A failed read raises
// rather than falling back: an empty record would draw every track as "Not
// started", a wrong answer about the person's own progress.
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { readAwards, readCertifications, type CertAward, type CertTrack } from "./certifications";
import { trackStages, type TrackView } from "./my-training";

async function myMetadata(personId: string): Promise<unknown> {
  const rows = mustRows(await companyOs.from("people").select("metadata").eq("id", personId).limit(1), "[training] my certification tracks");
  return rows[0]?.metadata ?? null;
}

export async function myCertifications(personId: string): Promise<CertTrack[]> {
  return readCertifications(await myMetadata(personId));
}

export async function myCertificationTracks(personId: string): Promise<TrackView[]> {
  return (await myCertifications(personId)).map(trackStages);
}

/** The tracks and the certificates awarded, from one read of the record (TR.12's shelf). */
export async function myCertificationRead(personId: string): Promise<{ tracks: TrackView[]; awards: CertAward[] }> {
  const metadata = await myMetadata(personId);
  return { tracks: readCertifications(metadata).map(trackStages), awards: readAwards(metadata) };
}
