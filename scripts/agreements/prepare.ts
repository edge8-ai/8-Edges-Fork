// Prepare an agreement for signature, through the same module the admin pages'
// Prepare buttons use (E-signature). A client's agreement sits on its deal; an
// employee's or contractor's on their team record (AG.1).
//
//   npx tsx scripts/agreements/prepare.ts <deal id or slug> --file <agreement.md|.pdf> \
//     --title "<title>" --signer-title "<title>" --signer-email <email> \
//     --fee <amount> --currency aud --description "<invoice line>" --by <admin email>
//
//   A client agreement with nothing to invoice takes --no-fee in place of
//   --fee, --currency and --description.
//
//   npx tsx scripts/agreements/prepare.ts --team-member <team_members.id> --type contractor|employee \
//     --file <agreement.md|.pdf> --title "<title>" --signer-title "<title>" --by <admin email>
//
// It stores the file, pins its sha256 and opens Edge8's signature. It never
// signs and never sends: a Super Admin reads the agreement in the admin pages,
// signs it for Edge8 there, and only then can send it. The send-agreement skill
// runs this after Dave has confirmed the file, the signer and the fee in chat.

import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) {
    console.error(`No .env.local at ${path}. Run this from a checkout that has one (a fresh worktree does not).`);
    process.exit(1);
  }
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    const [, k, raw] = m;
    if (process.env[k] !== undefined) continue;
    process.env[k] = raw.replace(/^"(.*)"$/, "$1").trim();
  }
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

const USAGE = [
  'usage: npx tsx scripts/agreements/prepare.ts <deal id or slug> --file <agreement.md|.pdf> --title "<title>" --signer-title "<title>" --signer-email <email> --fee <amount> --currency <aud|usd|...> --description "<invoice line>" --by <admin email>',
  '   or: npx tsx scripts/agreements/prepare.ts <deal id or slug> --file <agreement.md|.pdf> --title "<title>" --signer-title "<title>" --signer-email <email> --no-fee --by <admin email>',
  '   or: npx tsx scripts/agreements/prepare.ts --team-member <team_members.id> --type contractor|employee --file <agreement.md|.pdf> --title "<title>" --signer-title "<title>" --by <admin email>',
].join("\n");

function requireFlags(args: string[], need: string[], hasRef: boolean) {
  const missing = need.filter((n) => !flag(args, n));
  if (!hasRef || missing.length > 0) {
    console.error(USAGE);
    if (missing.length > 0) console.error(`missing: ${missing.map((m) => `--${m}`).join(", ")}`);
    process.exit(2);
  }
}

function readFileArg(args: string[]): { filename: string; contentBase64: string } {
  const file = resolve(flag(args, "file") as string);
  const lower = file.toLowerCase();
  if (!(lower.endsWith(".md") || lower.endsWith(".pdf")) || !existsSync(file)) {
    console.error(`${file} is not a Markdown or PDF file that exists. Only .md and .pdf agreements can be prepared.`);
    process.exit(2);
  }
  return { filename: basename(file), contentBase64: readFileSync(file).toString("base64") };
}

function report(r: { ok: true; agreementId: string; warnings: string[] } | { ok: false; error: string }, adminPath: string) {
  if (!r.ok) {
    console.error(r.error);
    process.exit(1);
  }
  for (const w of r.warnings) console.warn(`warning: ${w}`);
  // The site address comes from the environment, never a literal: this script
  // reaches the public fork, where the address is someone else's.
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  console.log(`Prepared agreement ${r.agreementId}. Read it, sign it for Edge8 and send it from:`);
  console.log(`${origin}${adminPath}`);
}

async function prepareForTeamMember(args: string[]) {
  const teamMemberId = flag(args, "team-member");
  requireFlags(args, ["type", "file", "title", "signer-title", "by"], Boolean(teamMemberId));
  const type = flag(args, "type");
  if (type !== "contractor" && type !== "employee") {
    console.error("--type must be contractor or employee.");
    process.exit(2);
  }
  const file = readFileArg(args);
  loadEnvLocal();
  const { prepareAgreement } = await import("../../entities/crm/lib/agreement-prepare");
  const r = await prepareAgreement({
    type,
    teamMemberId: teamMemberId as string,
    ...file,
    title: flag(args, "title") as string,
    signerTitle: flag(args, "signer-title") as string,
    preparedBy: flag(args, "by") as string,
  });
  report(r, "/admin/agreements");
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--team-member")) return prepareForTeamMember(args);
  const [dealRef, ...rest] = args;
  const noFee = rest.includes("--no-fee");
  if (noFee && rest.some((a) => a === "--fee" || a === "--currency" || a === "--description")) {
    console.error("--no-fee cannot be combined with --fee, --currency or --description.");
    process.exit(2);
  }
  requireFlags(rest, ["file", "title", "signer-title", "signer-email", ...(noFee ? [] : ["fee", "currency", "description"]), "by"], Boolean(dealRef));
  const file = readFileArg(rest);
  const fee = Number(flag(rest, "fee"));
  if (!noFee && (!Number.isFinite(fee) || fee <= 0)) {
    console.error("--fee must be a positive amount in the currency given, such as 15000. Use --no-fee for an agreement with nothing to invoice.");
    process.exit(2);
  }

  loadEnvLocal();
  const { companyOs } = await import("../../kernel/data/supabase");
  const { isUuid, isShortCode, shortCodeRange, shortOf } = await import("../../kernel/config/slug");
  const { prepareAgreement } = await import("../../entities/crm/lib/agreement-prepare");

  let dealId = dealRef;
  if (!isUuid(dealRef)) {
    const short = shortOf(dealRef);
    if (!isShortCode(short)) {
      console.error(`${dealRef} is neither a deal id nor a deal slug.`);
      process.exit(2);
    }
    const { lo, hi } = shortCodeRange(short);
    const { data, error } = await companyOs.from("deals").select("id").gte("id", lo).lte("id", hi).limit(2);
    if (error || !data || data.length !== 1) {
      console.error(`Deal ${dealRef} not found unambiguously: ${error?.message ?? `${data?.length ?? 0} matches`}`);
      process.exit(1);
    }
    dealId = data[0].id;
  }

  const r = await prepareAgreement({
    type: "client",
    dealId,
    ...file,
    title: flag(rest, "title") as string,
    signer: { title: flag(rest, "signer-title") as string, email: flag(rest, "signer-email") as string },
    fee: noFee ? null : { amount: fee, currency: flag(rest, "currency") as string, description: flag(rest, "description") as string },
    preparedBy: flag(rest, "by") as string,
  });
  report(r, `/admin/revenue/deals/${dealId}`);
}

void main();
