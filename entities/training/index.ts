// The training entity's server door (TR.1, spec 2026-10-11): everything a
// person does to get better at their work, starting with the certification
// programme's tracks it took over from the team entity. It requires no
// other entity, so any deployment can install it; Home reaches it only through
// the HomeTraining and StartHereCertification page slots (app/shell.ts), never
// by import. Who sees which read of a person's training is ADR 0016.
export { readCertifications, type CertStatus, type CertTrack } from "./lib/certifications";
// The page slots Home asks for (kernel/shell/page-slots.ts).
export { HomeTraining } from "./ui/HomeTraining";
export { StartHereCertification } from "./ui/StartHereCertification";
// The reader's own certification tracks, as My Training draws them.
export { myCertificationTracks } from "./lib/my-training-read";
export type { TrackView, TrackStage } from "./lib/my-training";
