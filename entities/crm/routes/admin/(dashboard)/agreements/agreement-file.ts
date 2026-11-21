// The agreement file a prepare form picked, read in the browser as base64 so
// a Markdown file and a PDF travel to the server the same way. The server
// checks the type again (agreement-signing.ts, readAgreementFile); this only
// saves a round trip for a file that could never be prepared.

export type PickedFile = { filename: string; contentBase64: string };

export const AGREEMENT_FILE_ACCEPT = ".md,.pdf,text/markdown,application/pdf";

export async function readPickedFile(f: File): Promise<{ ok: true; file: PickedFile } | { ok: false; error: string }> {
  const name = f.name.toLowerCase();
  if (!name.endsWith(".md") && !name.endsWith(".pdf")) return { ok: false, error: "Only a Markdown (.md) or PDF (.pdf) file can be prepared for signing." };
  if (name.endsWith(".pdf") && f.size > 5_000_000) return { ok: false, error: "The PDF is larger than 5 MB." };
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(f);
  });
  return { ok: true, file: { filename: f.name, contentBase64: dataUrl.slice(dataUrl.indexOf(",") + 1) } };
}
