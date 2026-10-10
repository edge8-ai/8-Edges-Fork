// Prepare an agreement for signature on a deal, through the same module the
// deal page's Prepare button uses (E-signature).
//
//   npx tsx scripts/agreements/prepare.ts <deal id or slug> --file <agreement.md> \
//     --title "<title>" --signer-name "<name>" --signer-title "<title>" --signer-email <email> \
//     --fee <amount> --currency aud --description "<invoice line>" --by <admin email>
//
// It stores the Markdown, pins its sha256 and opens Edge8's signature. It never
// signs and never sends: a Super Admin reads the agreement on the deal page,
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

const USAGE =
  'usage: npx tsx scripts/agreements/prepare.ts <deal id or slug> --file <agreement.md> --title "<title>" --signer-name "<name>" --signer-title "<title>" --signer-email <email> --fee <amount> --currency <aud|usd|...> --description "<invoice line>" --by <admin email>';

async function main() {
  const [dealRef, ...rest] = process.argv.slice(2);
  const need = ["file", "title", "signer-name", "signer-title", "signer-email", "fee", "currency", "description", "by"];
  const missing = need.filter((n) => !flag(rest, n));
  if (!dealRef || missing.length > 0) {
    console.error(USAGE);
    if (missing.length > 0) console.error(`missing: ${missing.map((m) => `--${m}`).join(", ")}`);
    process.exit(2);
  }
  const file = resolve(flag(rest, "file") as string);
  if (!file.toLowerCase().endsWith(".md") || !existsSync(file)) {
    console.error(`${file} is not a Markdown file that exists. Only .md agreements can be prepared.`);
    process.exit(2);
  }
  const fee = Number(flag(rest, "fee"));
  if (!Number.isFinite(fee) || fee <= 0) {
    console.error("--fee must be a positive amount in the currency given, such as 15000.");
    process.exit(2);
  }

  loadEnvLocal();
  const { companyOs } = await import("../../kernel/data/supabase");
  const { isUuid, isShortCode, shortCodeRange, shortOf } = await import("../../kernel/config/slug");
  const { prepareAgreement } = await import("../../entities/crm/lib/agreement-signing");

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
    dealId,
    markdown: readFileSync(file, "utf8"),
    filename: basename(file),
    title: flag(rest, "title") as string,
    signer: { name: flag(rest, "signer-name") as string, title: flag(rest, "signer-title") as string, email: flag(rest, "signer-email") as string },
    fee: { amount: fee, currency: flag(rest, "currency") as string, description: flag(rest, "description") as string },
    preparedBy: flag(rest, "by") as string,
  });
  if (!r.ok) {
    console.error(r.error);
    process.exit(1);
  }
  for (const w of r.warnings) console.warn(`warning: ${w}`);
  // The site address comes from the environment, never a literal: this script
  // reaches the public fork, where the address is someone else's.
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  console.log(`Prepared agreement ${r.agreementId}. Read it, sign it for Edge8 and send it on the deal page:`);
  console.log(`${origin}/admin/revenue/deals/${dealId}`);
}

void main();
