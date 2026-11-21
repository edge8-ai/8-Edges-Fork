// The Vietnamese banks a company account may be with, and each one's NAPAS code,
// which a VietQR code names the bank by (AD.13). A list rather than free text
// because a misspelt bank would have no code, and a QR code that names the wrong
// bank is worse than none. Codes read from the public list at
// api.vietqr.io/v2/banks on 2026-11-05.
//
// Client-safe: no imports.
export const VN_BANKS = [
  { name: "ABBANK", bin: "970425" },
  { name: "ACB", bin: "970416" },
  { name: "Agribank", bin: "970405" },
  { name: "BacABank", bin: "970409" },
  { name: "BIDV", bin: "970418" },
  { name: "Eximbank", bin: "970431" },
  { name: "HDBank", bin: "970437" },
  { name: "KienLongBank", bin: "970452" },
  { name: "LPBank", bin: "970449" },
  { name: "MBBank", bin: "970422" },
  { name: "MSB", bin: "970426" },
  { name: "NamABank", bin: "970428" },
  { name: "OCB", bin: "970448" },
  { name: "PVcomBank", bin: "970412" },
  { name: "Sacombank", bin: "970403" },
  { name: "SeABank", bin: "970440" },
  { name: "SHB", bin: "970443" },
  { name: "Techcombank", bin: "970407" },
  { name: "TPBank", bin: "970423" },
  { name: "VIB", bin: "970441" },
  { name: "VietCapitalBank", bin: "970454" },
  { name: "Vietcombank", bin: "970436" },
  { name: "VietinBank", bin: "970415" },
  { name: "VPBank", bin: "970432" },
] as const;

/** A bank's NAPAS code, or null for a name the list does not hold. */
export function bankBinOf(name: string): string | null {
  return VN_BANKS.find((b) => b.name === name)?.bin ?? null;
}
