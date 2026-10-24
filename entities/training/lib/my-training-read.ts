// The reader's own certification tracks, for My Training and Home (TR.1). The progress
// lives on the person's record (people.metadata.certifications, written by the
// nightly sync), a kernel table every entity may read. A failed read raises
// rather than falling back: an empty record would draw every track as "Not
// started", a wrong answer about the person's own progress.
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { readCertifications, type CertTrack } from "./certifications";
import { trackStages, type TrackView } from "./my-training";

export async function myCertifications(personId: string): Promise<CertTrack[]> {
  const rows = mustRows(await companyOs.from("people").select("metadata").eq("id", personId).limit(1), "[training] my certification tracks");
  return readCertifications(rows[0]?.metadata ?? null);
}

export async function myCertificationTracks(personId: string): Promise<TrackView[]> {
  return (await myCertifications(personId)).map(trackStages);
}
