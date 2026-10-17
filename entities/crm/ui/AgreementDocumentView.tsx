import type { AgreementDocument } from "@/entities/crm/lib/agreement-documents";

// An agreement as its signing page shows it (E-signature): Markdown as
// sanitised HTML, a PDF in the browser's own viewer with a link to open it on
// its own (a phone shows a PDF better in a tab than in a frame), or why it
// cannot be shown, in which case nobody should sign it.
export function AgreementDocumentView({ doc, title, full = false }: { doc: AgreementDocument; title: string; full?: boolean }) {
  if (doc.kind === "error") {
    return <div className="admin-alert admin-alert--err">This agreement cannot be shown right now ({doc.error}). Please contact Edge8 before signing.</div>;
  }
  if (doc.kind === "html") {
    return (
      <div
        className={`admin-idea-plan admin-agreement-text${full ? " admin-agreement-text--full" : ""}`}
        dangerouslySetInnerHTML={{ __html: doc.html }}
      />
    );
  }
  return (
    <>
      <iframe title={title} src={doc.url} className="admin-frame" />
      <p className="u-mt-2">
        <a href={doc.url} target="_blank" rel="noopener noreferrer">
          Open the PDF in a new tab
        </a>
      </p>
    </>
  );
}
