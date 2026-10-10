// Brand palette for renderers that cannot read CSS custom properties:
// Open Graph images (Satori, via entities/site/lib/ogRender.js), QR codes, and HTML email
// sent to external inboxes. Everything rendered in the browser must use the
// tokens in app/styles/tokens.css instead. The values live in palette.json
// so the CommonJS OG renderer can read the same file; keep that file in sync
// with section 1 of tokens.css by hand. `npm run check:tokens` allows raw
// colours only in tokens.css and palette.json.
import palette from "./palette.json";

export const PALETTE = palette as Readonly<typeof palette>;
