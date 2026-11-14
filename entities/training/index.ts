// The training entity's server door (TR.1, spec 2026-10-11): everything a
// person does to get better at their work, starting with the certification
// programme's tracks it took over from the team entity. It requires no
// other entity, so any deployment can install it; Home reaches it only through
// the HomeTraining and StartHereCertification page slots (app/shell.ts), never
// by import. Who sees which read of a person's training is ADR 0016.
export { readCertifications, type CertStatus, type CertTrack } from "./lib/certifications";
// The page slots Home asks for, declared in slots.ts (ADR 0026) with their types.
export { HomeTraining } from "./ui/HomeTraining";
export { StartHereCertification } from "./ui/StartHereCertification";
export type { HomeTrainingSlot, StartHereCertificationSlot } from "./slots";
// The reader's own certification tracks, as My Training draws them.
export { myCertificationTracks } from "./lib/my-training-read";
export type { TrackView, TrackStage } from "./lib/my-training";
// One question for the ladders (LD.1; ADR 0021): the register of a set of
// sessions, who came and whether it was held, judged by nobody here.
export { sessionRegisters } from "./lib/registers";
export type { SessionRegister } from "./lib/registers";
// Taught sessions for another entity (QS.5): a session created for the person
// who teaches it, a seat put on and taken off its register, and the
// per-session organiser check that refuses a Raid's Host a seat at their own
// fire. Quests' Campfires is the first caller. The quest clock asks which
// sessions just ended, to state the fires held (ADR 0023).
export { cancelTaughtSession, createTaughtSession, leaveSeat, organisesSession, sessionsEndedBetween, takeSeat, taughtSessions } from "./lib/taught-sessions";
export type { TaughtSession } from "./lib/taught-sessions";
// The Host role the resolver implies for whoever organises a taught session
// (QS.5b, ADR 0013), registered at boot by the composition root (app/access.ts).
export { accessContributions } from "./lib/access-contributions";
// And for the badges found by doing (LD.7): the sessions a person attended,
// and the submissions, reviews, recaps and self-logged trainings they made.
// Never a review's stars, and never a register row skipped or removed.
export { trainingFactsOf } from "./lib/act-facts";
export type { AttendedFact, MadeFact, TrainingFacts } from "./lib/act-facts";
