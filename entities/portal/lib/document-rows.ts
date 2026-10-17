// What the client-side document list receives (S.16.24). Built on the server,
// because a "use client" component's props are shipped in the page payload:
// rows that still carried uploaded_by put every uploader's address — staff
// included — into the HTML a client downloads, whatever the list rendered.
// The browser gets the label to show and whether the viewer may delete; the
// server re-checks the delete anyway.

export type PortalDocumentRow = {
  id: string;
  filename: string;
  url?: string | null; // link rows open the url itself; file rows mint a signed download
  sizeBytes: number | null;
  uploaderName: string | null;
  // The viewer uploaded it, so the list offers Delete.
  isMine: boolean;
  createdAt: string;
};

export function portalDocumentRows(
  docs: { id: string; filename: string; url?: string | null; sizeBytes: number | null; uploadedBy: string | null; uploaderName?: string | null; createdAt: string }[],
  actorEmail: string,
): PortalDocumentRow[] {
  const me = actorEmail.trim().toLowerCase();
  return docs.map((d) => ({
    id: d.id,
    filename: d.filename,
    url: d.url ?? null,
    sizeBytes: d.sizeBytes,
    uploaderName: d.uploaderName ?? null,
    isMine: !!me && (d.uploadedBy ?? "").trim().toLowerCase() === me,
    createdAt: d.createdAt,
  }));
}
