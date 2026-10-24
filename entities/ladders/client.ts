// The ladders entity's browser-safe door. Only what a "use client" file may
// import. It exports nothing yet: LD.1 ships the ladders dark, and the first
// client component outside the entity (the rank-up gate, LD.5; the wear
// switches, LD.4) arrives with its page. knip.json lists this file among the
// empty client doors until then.
// ./index.ts will reach the service-role client and must never reach the browser.
export {};
