// Fork overlay: the company's public presence, emptied.
//
// Upstream, this file carries Edge8's <head> copy, logo, phone numbers, social
// profile and the links to its marketing pages. None of that is the fork's: a
// logo is a trademark, a phone number reaches a person, and every link pointed
// at a page this build does not have. Empty values make the App's public frame
// (kernel/shell/public-frame) show the fork's own NEXT_PUBLIC_ORG_NAME as a
// text wordmark, and the root layout fall back to it for the title.
import { EMPTY_PUBLIC_PRESENCE, type PublicPresence } from "@/kernel/shell/public-frame/presence";

export const publicPresence: PublicPresence = EMPTY_PUBLIC_PRESENCE;
