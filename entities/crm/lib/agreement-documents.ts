import { downloadDocumentBytes, signedDownloadForPath, signedViewForPath } from "@/entities/client-programs";
import { renderAgreementHtml } from "./agreement-render";
import { sha256Hex, type Agreement, type AgreementHeader } from "./agreements";

// An agreement's stored file (E-signature): the check that it is still the
// file both parties sign, and the ways a page shows it or hands it over.

// Re-reads the stored file and checks it is still the file the header pins.
export async function storedFingerprintMatches(header: AgreementHeader): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; error: string }> {
  const stored = await downloadDocumentBytes(header.storagePath);
  if (!stored.ok) return { ok: false, error: stored.error };
  if (sha256Hex(stored.bytes) !== header.sha256) {
    return { ok: false, error: "The stored agreement no longer matches the file that was prepared. Void it and prepare it again." };
  }
  return { ok: true, bytes: stored.bytes };
}

/** A Markdown agreement's text as HTML, after checking it is the text that was prepared. */
export async function readAgreementHtml(a: Agreement): Promise<{ ok: true; html: string } | { ok: false; error: string }> {
  if (a.header.contentType !== "text/markdown") return { ok: false, error: "This agreement is a PDF, not text." };
  const stored = await storedFingerprintMatches(a.header);
  if (!stored.ok) return stored;
  return { ok: true, html: await renderAgreementHtml(new TextDecoder().decode(stored.bytes)) };
}

/** What a signing page shows: the Markdown as HTML, or a link that shows the PDF. */
export type AgreementDocument = { kind: "html"; html: string } | { kind: "pdf"; url: string } | { kind: "error"; error: string };

/**
 * The agreement as its signing page shows it, after checking the stored file
 * is still the one prepared. A PDF is shown through a short-lived link; the
 * signature re-checks the fingerprint of the stored file either way.
 */
export async function readAgreementDocument(a: Agreement): Promise<AgreementDocument> {
  if (a.header.contentType === "text/markdown") {
    const r = await readAgreementHtml(a);
    return r.ok ? { kind: "html", html: r.html } : { kind: "error", error: r.error };
  }
  const stored = await storedFingerprintMatches(a.header);
  if (!stored.ok) return { kind: "error", error: stored.error };
  const link = await signedViewForPath(a.header.storagePath);
  return link.ok ? { kind: "pdf", url: link.url } : { kind: "error", error: link.error };
}

/**
 * Download links for a signed agreement: the signing record, and for a PDF
 * agreement the PDF itself, which is the agreement the record names.
 */
export async function signedAgreementLinks(a: Agreement): Promise<{ signedCopyUrl: string | null; pdfUrl: string | null }> {
  const [copy, pdf] = await Promise.all([
    a.client?.signedCopyPath ? signedDownloadForPath(a.client.signedCopyPath, `${a.header.title} (signed).html`) : null,
    a.status === "signed" && a.header.contentType === "application/pdf" ? signedDownloadForPath(a.header.storagePath, a.header.filename) : null,
  ]);
  return { signedCopyUrl: copy?.ok ? copy.url : null, pdfUrl: pdf?.ok ? pdf.url : null };
}
