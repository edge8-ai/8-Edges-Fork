// The Operations morning list: approvals with the approver's name, money
// falling due, overdue cards by owner, and who is out this week. Each part is
// built by the entity that owns its table.

import { dayTitle, type OfficeList } from "@/kernel/messaging/office-list";
import { leaveApprovalMorningLines, outThisWeekMorningLines } from "@/entities/time-off";
import { claimMorningLines } from "@/entities/reimbursements";
import { contractorMorningLines } from "@/entities/work-requests";
import { invoiceMorningLines } from "@/entities/finance";
import { overdueCardMorningLines } from "@/entities/boards";

export async function operationsList(today: string): Promise<OfficeList> {
  const [leave, claims, work, money, delivery, out] = await Promise.all([
    leaveApprovalMorningLines(),
    claimMorningLines(),
    contractorMorningLines(),
    invoiceMorningLines(today),
    overdueCardMorningLines(today),
    outThisWeekMorningLines(today),
  ]);
  const approvals = [...leave, ...claims, ...work];
  // "Out this week" and money falling due are facts to plan by; alone they are not worth a message.
  const actionable = approvals.length + money.filter((l) => l.who).length + delivery.length > 0;
  return {
    title: `Operations · ${dayTitle(today)}`,
    sections: [
      { title: "Approvals", lines: approvals },
      { title: "Money", lines: actionable ? money : [] },
      { title: "Delivery", lines: delivery },
      { title: "Out this week", lines: actionable ? out : [] },
    ],
  };
}
