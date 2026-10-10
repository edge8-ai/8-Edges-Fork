// The upload form's half of meeting-extract: the size cap and the accept list
// the browser needs before a file ever reaches the server. They live apart from
// extractTranscript because that function pulls mammoth (the .docx parser),
// which has no place in a client bundle; entities/assistant/client.ts re-exports
// this file and never the extractor (multi-entity design §3, "two doors").

export const MEETING_MAX_BYTES = 10 * 1024 * 1024;

export const MEETING_ACCEPT = ".txt,.vtt,.srt,.md,.markdown,.docx";
