// Small pieces the Time Off page's client components share (TH.6). Dates are
// read from the YYYY-MM-DD string, never through the browser's time zone, so
// the server and the browser draw the same day.
import { LEAVE_TYPE_LABEL, type LeaveType } from "@/entities/time-off/client";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "2026-10-31" → "Oct 31". */
export const shortDay = (iso: string) => `${MON[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;

const weekdayIndex = (iso: string) => new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)))).getUTCDay();

/** "2026-10-18" → "Sunday, 18 October". */
export const longDay = (iso: string) => `${WEEKDAY[weekdayIndex(iso)]}, ${Number(iso.slice(8, 10))} ${MONTH[Number(iso.slice(5, 7)) - 1]}`;

export const isWeekendIso = (iso: string) => {
  const w = weekdayIndex(iso);
  return w === 0 || w === 6;
};

export const typeLabel = (t: string) => LEAVE_TYPE_LABEL[t as LeaveType] ?? t;

export function SunIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="44" height="44" viewBox="0 0 44 44" fill="none" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
      <circle cx="22" cy="22" r="10" />
      <path d="M22 3v5M22 36v5M3 22h5M36 22h5M8.6 8.6l3.5 3.5M31.9 31.9l3.5 3.5M8.6 35.4l3.5-3.5M31.9 12.1l3.5-3.5" />
    </svg>
  );
}
