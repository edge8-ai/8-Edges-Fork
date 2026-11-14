// The one thing about "Noticed" that both the browser and the server need (L.4).
//
// It lives apart from lib/data/noticed.ts because that file opens with the
// service-role Supabase client, and the write form is a client component. A
// value import — not a type import — would have pulled that client into the
// browser bundle, which is precisely what entity-client-doors.test.mjs exists
// to stop, and it stopped it.

// A sentence, not an essay. The cap is the feature: "you caught the pricing
// error before it went out, and rewrote it yourself" is the shape that works,
// and anything needing three paragraphs belongs in the 1-1 itself.
export const NOTICED_MAX = 300;
