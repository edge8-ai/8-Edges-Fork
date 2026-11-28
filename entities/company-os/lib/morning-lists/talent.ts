import { dayTitle, type OfficeList } from "@/kernel/messaging/office-list";
import { talentMorningLines } from "@/entities/hiring";

/** The Talent morning list; hiring builds its lines. */
export async function talentList(today: string, since: string): Promise<OfficeList> {
  return { title: `Talent · ${dayTitle(today)}`, sections: [{ title: "Hiring", lines: await talentMorningLines(today, since) }] };
}
