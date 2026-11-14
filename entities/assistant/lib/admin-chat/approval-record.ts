// The assistant's privileged actions on the approvals primitive (S.5).
//
// Approval here is synchronous and asks nobody else: a lone privileged tool
// call pauses the chat turn, and the same privileged admin approves or declines
// it in the next request. Nothing waits, so nothing is opened; the decision is
// recorded as an approval already decided, so every privileged write, email and
// portal invite leaves the same row as a leave decision does, with what was
// asked and who answered. Recorded before the action runs, because the approval
// is the admin's decision, whatever the action then returns.
import { decideApproval } from "@/kernel/approvals/requests";
import { personIdForEmailOrNull } from "@/kernel/identity/person-by-email";

export async function recordAssistantDecision(
  toolUse: { id: string; name: string; input: unknown },
  approved: boolean,
  adminEmail: string,
): Promise<void> {
  const decidedBy = await personIdForEmailOrNull(adminEmail, "assistant");
  await decideApproval(
    {
      subjectType: "assistant_action",
      subjectId: toolUse.id,
      state: approved ? "approved" : "rejected",
      decidedBy,
      // The same admin asks and answers in one chat turn.
      requestedBy: decidedBy,
      label: `Assistant: ${toolUse.name}`,
      metadata: { tool: toolUse.name, input: toolUse.input },
    },
    adminEmail,
  );
}
