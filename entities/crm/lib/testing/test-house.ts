import type { ProposalHouse } from "../proposal-pricing";

// An invented house reference for the proposal chain's suites (Z.10). The
// suites never import the real one: it carries one company's prices, which
// must not reach the public mirror in a fixture, and the mirror stubs it to
// null, which would fail every suite that read it. Every name, band and amount
// here is made up.
export const TEST_HOUSE: ProposalHouse = {
  brandName: "Northwind",
  eyebrow: "Northwind · Proposal",
  preparedBy: "The Northwind team",
  siteName: "Northwind Studio",
  ogImageUrl: "https://share.example.test/proposal-card.png",
  defaultCurrency: "usd",
  ownDomains: ["northwind.example.test"],
  bands: [
    { key: "starter", label: "Starter phase", currency: "usd", minCents: 200_000, maxCents: 300_000, note: "Invented: a fixed first phase." },
    { key: "retainer-month", label: "Retainer, per month", currency: "usd", minCents: 50_000, maxCents: 80_000, note: "Invented: ongoing help." },
  ],
  productNames: [{ name: "Gizmo", heard: ["Gismo", "Kizmo"] }],
  standingTerms: ["Invented: the first phase can be stopped after its first week."],
};
