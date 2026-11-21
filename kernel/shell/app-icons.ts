import type { MetadataRoute } from "next";

// Fork overlay stub: the upstream's app icons are its trademark and do not
// ship, so the installed app names none. Replaces kernel/shell/app-icons.ts.
export const APP_ICONS: NonNullable<MetadataRoute.Manifest["icons"]> = [];
