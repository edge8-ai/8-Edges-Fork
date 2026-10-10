// The home page's social proof: partner logos and named endorsements.
//
// This file is an overlay stub for 8-Edges-Fork. It only neutralises upstream
// while it sits at the SAME repo-relative path as the real module — today
// entities/site/lib/home-endorsements.ts.
//
// Empty: these are other people's clients endorsing the upstream by name.
// Both lists feed sections that INCLUDES_CASE_STUDIES already hides, so
// nothing renders differently — what changes is that the names are no longer
// in the bundle.
export type Testimonial = { text: string; name: string; role: string; avatar: string };
export type PartnerLogo = { src: string; alt: string };

export const testimonials: Testimonial[] = [];
export const partnerLogos: PartnerLogo[] = [];
