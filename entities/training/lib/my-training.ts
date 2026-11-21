// A certification track as My Training draws it (TR.1, approved on the
// Training Block canvas 2026-10-11): one segmented bar, modules first, then
// micro sessions, then coaching, ending in the certificate's flag, and a line
// saying what is left. The rules about what counts come from ./certifications;
// this only lays them out, so Home and My Training can never disagree.
import { hasStarted, leftInWords, leftToEarn, type CertTrack } from "./certifications";

export type TrackStage = { key: "modules" | "micro" | "coaching"; label: string; done: number; total: number };

export type TrackView = {
  key: CertTrack["key"];
  label: string;
  stages: TrackStage[];
  certified: boolean;
  toGo: string;
  // One thing left: the line is drawn as nearly there.
  near: boolean;
};

export function trackStages(track: CertTrack): TrackView {
  const certified = track.status === "certified";
  // A stage never reads more done than it requires (9 micro sessions against
  // 8 required read 8 of 8), and an awarded track is full whatever was synced.
  const stage = (key: TrackStage["key"], label: string, done: number, total: number): TrackStage => ({
    key,
    label,
    done: certified ? total : Math.min(done, total),
    total,
  });
  const stages = [
    stage("modules", "Modules", track.completed, track.total),
    stage("micro", "Micro sessions", track.micro_done, track.micro_required),
    stage("coaching", "Coaching", track.coaching_done, track.coaching_required),
  ].filter((s) => s.total > 0);
  const left = leftInWords(track);
  const toGo = certified ? "Certified" : !hasStarted(track) ? "Not started" : left ? `${left} to the certificate` : "All done, award on its way";
  const near = !certified && Object.values(leftToEarn(track)).filter(Boolean).length === 1 && hasStarted(track);
  return { key: track.key, label: track.label, stages, certified, toGo, near };
}
