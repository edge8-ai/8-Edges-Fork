import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Every file the card renderer reads from disk: the looks' fonts and the brand
// kit's logos. Each read spells its path as a string literal, on purpose.
//
// The build traces a file read into the function that runs it. A read whose path
// it cannot resolve, such as `join(process.cwd(), file)` with `file` a variable,
// is traced as "any file in the project": on 19 Nov that pulled 14,496 files into
// the post page's function, 318 MB against Vercel's 250 MB limit, and the
// deployment failed. A literal path traces exactly one file.
// next.config.mjs's outputFileTracingIncludes names the same files as a second
// guarantee, so adding a file here means adding its glob there too.
const READERS = {
  "public/fonts/manrope-og-500.ttf": () => readFile(join(process.cwd(), "public/fonts/manrope-og-500.ttf")),
  "public/fonts/manrope-og-700.ttf": () => readFile(join(process.cwd(), "public/fonts/manrope-og-700.ttf")),
  "public/fonts/manrope-og-800.ttf": () => readFile(join(process.cwd(), "public/fonts/manrope-og-800.ttf")),
  "public/fonts/inter-og-700.ttf": () => readFile(join(process.cwd(), "public/fonts/inter-og-700.ttf")),
  "public/fonts/inter-og-800.ttf": () => readFile(join(process.cwd(), "public/fonts/inter-og-800.ttf")),
  "public/fonts/geist-og-500.ttf": () => readFile(join(process.cwd(), "public/fonts/geist-og-500.ttf")),
  "public/fonts/jetbrains-mono-og-500.ttf": () => readFile(join(process.cwd(), "public/fonts/jetbrains-mono-og-500.ttf")),
  "public/logo.png": () => readFile(join(process.cwd(), "public/logo.png")),
  "public/logo-white.png": () => readFile(join(process.cwd(), "public/logo-white.png")),
  "public/brands/ai-officer/logo-on-dark.png": () => readFile(join(process.cwd(), "public/brands/ai-officer/logo-on-dark.png")),
  "public/brands/ai-officer/logo-on-light.svg": () => readFile(join(process.cwd(), "public/brands/ai-officer/logo-on-light.svg")),
} as const;

/** A file the renderer may read; a path outside this list does not type-check. */
export type AssetFile = keyof typeof READERS;

export function readAsset(file: AssetFile): Promise<Buffer> {
  return READERS[file]();
}
