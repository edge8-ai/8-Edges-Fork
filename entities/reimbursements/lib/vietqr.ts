// A VietQR code for one transfer (AD.13): the NAPAS 247 payload a banking app
// reads, with the bank, the account, the amount and the reference filled in, so a
// person returning an advance does not retype them. Built and drawn here on the
// server, because an image service would mean sending the company's account to a
// third party.
//
// The payload is EMVCo tag, length, value: each field is a two-digit tag, a
// two-digit length and the value. Lengths count bytes, so anything outside ASCII
// is refused rather than encoded. The banking app shows the holder's name from
// the bank's own records before the person confirms.
import QRCode from "qrcode";
import { PALETTE } from "@/kernel/config/palette";

const field = (tag: string, value: string) => `${tag}${String(value.length).padStart(2, "0")}${value}`;

/** CRC-16/CCITT-FALSE, the check EMVCo closes a payload with, as four upper-case hex digits. */
export function crc16(text: string): string {
  let crc = 0xffff;
  for (let i = 0; i < text.length; i++) {
    crc ^= text.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** NAPAS's identifier in a VietQR code. */
const NAPAS = "A000000727";
/** A transfer to an account, rather than to a card. */
const TO_ACCOUNT = "QRIBFTTA";
/** A code for one amount: the "dynamic" point of initiation. */
const ONE_TRANSFER = "12";
/** ISO 4217 for the dong. */
const VND = "704";

const PRINTABLE_ASCII = /^[\x20-\x7e]+$/;

/**
 * The payload for one transfer, or null when one of its values could not be
 * carried faithfully. A person then copies the details by hand, which is better
 * than a code that says something else.
 */
export function vietQrPayload(transfer: { bin: string; account: string; amountVnd: number; reference: string }): string | null {
  const { bin, account, amountVnd, reference } = transfer;
  if (!/^\d{6}$/.test(bin) || !/^[0-9A-Za-z]{1,19}$/.test(account)) return null;
  if (!Number.isSafeInteger(amountVnd) || amountVnd <= 0 || String(amountVnd).length > 13) return null;
  if (reference.length > 25 || !PRINTABLE_ASCII.test(reference)) return null;
  const payee = field("00", NAPAS) + field("01", field("00", bin) + field("01", account)) + field("02", TO_ACCOUNT);
  const body =
    field("00", "01") +
    field("01", ONE_TRANSFER) +
    field("38", payee) +
    field("53", VND) +
    field("54", String(amountVnd)) +
    field("58", "VN") +
    field("62", field("08", reference)) +
    "6304";
  return body + crc16(body);
}

/** The code as an inline SVG. Server only. */
export function vietQrSvg(payload: string): Promise<string> {
  return QRCode.toString(payload, { type: "svg", margin: 1, width: 200, errorCorrectionLevel: "M", color: { dark: PALETTE.dark, light: PALETTE.white } });
}
