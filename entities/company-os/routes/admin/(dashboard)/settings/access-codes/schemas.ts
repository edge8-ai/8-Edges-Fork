import { z } from "zod";
import { ACCESS_CODE_MAX_LENGTH, ACCESS_CODE_MIN_LENGTH } from "@/kernel/identity/access-codes";

// A scope is the string a gate's unlock action and layout pass to signGate and
// verifyGate. It also names the gate's cookie, so it stays a lowercase slug.
// The unlock actions trim what a visitor types, so a stored code with edge
// whitespace could never be matched: trim before the length check.
export const setAccessCodeSchema = z.object({
  scope: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9-]{1,62}$/, "Use the gate's scope: lowercase letters, digits and hyphens."),
  code: z
    .string()
    .trim()
    .min(ACCESS_CODE_MIN_LENGTH, `Use at least ${ACCESS_CODE_MIN_LENGTH} characters.`)
    .max(ACCESS_CODE_MAX_LENGTH, `Use at most ${ACCESS_CODE_MAX_LENGTH} characters.`),
});

export type SetAccessCodeInput = z.infer<typeof setAccessCodeSchema>;
