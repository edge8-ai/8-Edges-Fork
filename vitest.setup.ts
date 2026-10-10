// Configuration the app used to hardcode.
//
// kernel/config/{contacts,organisation,lark}.ts read their values from the
// environment at module load, with no fallback — a fallback is how a fork mails
// the world under the previous owner's name (ADR 0005). That makes a configured
// environment a precondition for running the app, and therefore for testing it.
//
// These are the deliberately fake values every test sees. Set here rather than
// per-test because the modules capture them at import time, which is before any
// test body runs.
process.env.EMAIL_FROM ??= "Test Sender <notifications@example.com>";
process.env.OPS_EMAIL ??= "mai@example.com";
process.env.NEXT_PUBLIC_SUPPORT_EMAIL ??= "hello@example.com";
// The deployment's own origin. Read by getSiteOrigin(), the sitemap, robots.txt
// and the marketing writer's "is this link one of ours" check — all of which
// used to hardcode the upstream's domain, so a fork counted links to its OWN
// site as external and links to the previous owner's as internal.
process.env.NEXT_PUBLIC_SITE_URL ??= "https://www.example.com";

// The CAN-SPAM postal address and the sender's name. Both lost their hardcoded
// fallbacks — the fallback WAS the upstream's address, printed in the footer of
// every broadcast a fork sent, which is the one field in that template the law
// is about. Set here so the template test asserts a real footer rather than an
// empty one.
process.env.MARKETING_POSTAL_ADDRESS ??= "Acme Inc, 1 Example Street, Springfield";
process.env.NEXT_PUBLIC_ORG_NAME ??= "Acme Inc";

