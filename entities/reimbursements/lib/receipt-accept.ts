// Client-safe: no import, so a "use client" file picker may take it.

/**
 * What a receipt or payment file picker offers (MO.9, M1.4). HEIC and HEIF are
 * left off on purpose. An iPhone converts a photo from its library to JPEG
 * only when the picker does not name HEIC, and the receipt reader cannot read
 * a HEIC, so naming it meant every field was typed by hand. The server still
 * takes both (RECEIPT_TYPES in claim-files.ts), so a HEIC dropped on the
 * receipt drop from a computer still uploads.
 */
export const RECEIPT_PICKER_ACCEPT = "application/pdf,image/jpeg,image/png,image/webp";
