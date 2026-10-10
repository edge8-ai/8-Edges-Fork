import mammoth from "mammoth";
import { getDocumentProxy } from "unpdf";
import { companyOs, supabase } from "@/kernel/data/supabase";
import type { CandidateText, LayoutFacts } from "./resume-precheck";

// What the pre-check reads (Z.9): the candidate's own text, by source, and
// what the PDF reader can tell about text nobody sees. unpdf exposes each
// drawn string's size but not its colour, so white text is not seen here;
// zero-size text is, and the length check catches a page that holds far more
// than it shows (spec section 17 allowed for exactly this). The model's own
// report (prompt v2) is the second net.

type Input = { ok: true; texts: CandidateText[]; layout: LayoutFacts | null } | { ok: false; error: string };

// A string drawn smaller than this, in PDF units, is not text a reader sees.
const VISIBLE_SIZE = 1;

type TextItem = { str?: string; transform?: number[]; height?: number };

async function pdfFacts(buffer: Buffer): Promise<{ text: string; layout: LayoutFacts }> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  let text = "";
  let hiddenChars = 0;
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    for (const raw of content.items as TextItem[]) {
      const str = raw.str ?? "";
      if (!str.trim()) continue;
      text += `${str} `;
      const t = raw.transform ?? [];
      const size = Math.max(Math.hypot(t[0] ?? 0, t[1] ?? 0), Math.hypot(t[2] ?? 0, t[3] ?? 0));
      if (size < VISIBLE_SIZE || (raw.height !== undefined && raw.height < VISIBLE_SIZE)) hiddenChars += str.trim().length;
    }
    text += "\n";
  }
  return { text: text.trim(), layout: { pages: pdf.numPages, hiddenChars } };
}

/**
 * The candidate's text for one application. A résumé file that cannot be
 * parsed is left out rather than failing the step: the screen itself reports
 * an unreadable file, and the cover letter and answers are still checked. A
 * read or download that fails is an error, so the step is retried.
 */
export async function candidateTextsFor(applicationId: string): Promise<Input> {
  const { data: app, error } = await companyOs
    .from("applications")
    .select("cover_letter, answers, resume_document_id")
    .eq("id", applicationId)
    .maybeSingle();
  if (error) return { ok: false, error: `applications: ${error.message}` };
  if (!app) return { ok: false, error: "Application not found." };

  const texts: CandidateText[] = [];
  if (app.cover_letter) texts.push({ source: "cover_letter", text: app.cover_letter });
  const answers = Array.isArray(app.answers) ? (app.answers as { q?: unknown; a?: unknown }[]) : [];
  const answered = answers.map((x) => (typeof x?.a === "string" ? x.a : "")).filter(Boolean).join("\n\n");
  if (answered) texts.push({ source: "answers", text: answered });

  let layout: LayoutFacts | null = null;
  if (app.resume_document_id) {
    const { data: doc, error: docErr } = await companyOs
      .from("documents")
      .select("storage_path, mime_type")
      .eq("id", app.resume_document_id)
      .maybeSingle();
    if (docErr) return { ok: false, error: `documents: ${docErr.message}` };
    if (doc?.storage_path) {
      const { data: file, error: dlErr } = await supabase.storage.from("resumes").download(doc.storage_path);
      // A failed download is not "nothing to check" (rule 2): the step fails and is retried.
      if (dlErr) return { ok: false, error: `The résumé could not be downloaded for the pre-check: ${dlErr.message}` };
      if (file) {
        const buffer = Buffer.from(await file.arrayBuffer());
        const lower = doc.storage_path.toLowerCase();
        try {
          if (doc.mime_type === "application/pdf" || lower.endsWith(".pdf")) {
            const facts = await pdfFacts(buffer);
            texts.unshift({ source: "resume", text: facts.text });
            layout = facts.layout;
          } else if (lower.endsWith(".docx") || doc.mime_type?.includes("wordprocessingml")) {
            const { value } = await mammoth.extractRawText({ buffer });
            texts.unshift({ source: "resume", text: value });
          }
        } catch (err) {
          // A protected or damaged file: the screen says so in its own words.
          console.warn(`[resume-precheck] ${applicationId}: could not read the résumé:`, err instanceof Error ? err.message : err);
        }
      }
    }
  }
  return { ok: true, texts, layout };
}
