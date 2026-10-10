// Fork overlay stub: a client deployment has no external certification
// programme to point new hires at, so both panels hide their certification
// blocks. Replaces entities/team/lib/certification-programme.ts in the sync.
export type CertificationProgramme = {
  name: string;
  homeUrl: string;
  certificationUrl: string;
  instituteLabel: string;
  firstTrack: string;
  secondTrack: string;
};

export const CERTIFICATION_PROGRAMME: CertificationProgramme | null = null;
