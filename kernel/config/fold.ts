// The one accent fold for the codebase: how two spellings of the same text are
// made to compare equal. NFD decomposes accented Latin (Vietnamese ơ/ư/â/ê and
// the tone marks included) into a base letter plus combining marks, which are
// stripped (U+0300 to U+036F). Đ/đ are letters in their own right, not d plus a
// mark, so NFD leaves them behind and they are replaced by hand. Then
// everything is lower-cased: "Đặng Phương Mai" becomes "dang phuong mai", so
// "Đức" files under D and someone typing "duc" without a Vietnamese keyboard
// finds "Đức". Apply it to both sides of a comparison.
//
// It lived in people-name.ts until A.93, and four copies grew beside it (a
// searchFold in kernel/ui/format.ts, the Workboard's search, and the start of
// slugify and foldName) because nobody looking for a text helper opens a file
// about how a person's name is written. Build on this one instead of spelling
// the chain again: collapse whitespace, replace punctuation or cap the length
// after calling it.
//
// Two folds elsewhere differ on purpose and are not copies: payroll's name
// matching drops every non-ASCII character, and the claim export keeps case for
// file names.
export function foldDiacritics(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/Đ/g, "D")
    .replace(/đ/g, "d")
    .toLowerCase();
}
