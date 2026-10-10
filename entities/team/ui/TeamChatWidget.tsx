"use client";

// Team portal assistant: the shared assistant ChatWidget with the team surface's
// copy. Mounted in entities/team/routes/team/(dashboard)/layout.tsx so it is
// available on every /team page. Answer-only — no `approvals` prop, so there
// are no approval cards, no write actions and the composer is never gated.

import { ChatWidget } from "@/entities/assistant/client";

export function TeamChatWidget() {
  return (
    <ChatWidget
      endpoint="/api/team/chat"
      storageKey="edge8-team-chat"
      surface="team"
      fabLabel="Open team assistant"
      panelLabel="Team assistant"
      eyebrow="Edge8 Team"
      inputLabel="Message the team assistant"
      placeholder="Ask about Edge8…"
      historyEmptyHint="No saved conversations yet. Start chatting and they'll show up here."
      toolChipLabel={() => "Looked it up"}
      emptyState={
        <>
          <p>Ask me anything about Edge8:</p>
          <ul>
            <li>What&apos;s our time-off policy?</li>
            <li>Who&apos;s out on vacation next week?</li>
            <li>Who&apos;s in the design team, and who do they report to?</li>
            <li>How much revenue have we invoiced this quarter?</li>
            <li>Which clients do we work with?</li>
          </ul>
          <p className="admin-chat-empty-note">
            Read-only. I look things up but never change anything, and I can&apos;t see payroll or
            private personal data.
          </p>
        </>
      }
    />
  );
}
