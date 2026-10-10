// Characterisation test for the ChatWidget extraction: the admin and team chat
// widgets used to be two ~89% identical copies of the same panel. They are now
// thin wrappers over one `ChatWidget`, and the contract of that refactor is
// that the rendered DOM did not move by a single attribute.
//
// LEGACY_ADMIN_PANEL and LEGACY_TEAM_PANEL below are verbatim copies of the JSX
// the two widgets rendered before the extraction (entities/company-os/ui/
// AdminChatWidget.tsx and entities/team/ui/TeamChatWidget.tsx at commit
// da8f110b). Each state renders both the legacy JSX and the shared
// ChatPanelBody through react-dom/server and asserts the markup is identical.
// They are frozen on purpose: if a future change to ChatWidget breaks a test
// here, that change is a DOM change and belongs in this file too.

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatPanelBody } from "./ChatPanel";
import type { ChatDisplayItem, ChatWidgetProps } from "./chat-widget-types";
import { BotText } from "@/kernel/ui/BotText";

// ---------------------------------------------------------------------------
// Legacy copies (pre-refactor)
// ---------------------------------------------------------------------------

type LegacyApprovalItem = Extract<ChatDisplayItem, { kind: "approval" }>;

const CHIP_LABELS: Record<string, string> = {
  execute_write: "Changed the database",
  send_email: "Sent the email",
  invite_portal_member: "Portal access provisioned",
};

function LegacyApprovalCard({
  item,
  disabled,
  onDecide,
}: {
  item: LegacyApprovalItem;
  disabled: boolean;
  onDecide: (id: string, approved: boolean) => void;
}) {
  const isEmail = item.name === "send_email";
  const isPortal = item.name === "invite_portal_member";
  const statusLabel =
    item.status === "approved" ? "Approved" : item.status === "declined" ? "Cancelled" : null;
  return (
    <div className="admin-chat-approval">
      <div className="admin-chat-approval-title">
        {isEmail
          ? "Send this email?"
          : isPortal
            ? item.input.action === "resend_link"
              ? "Send a fresh portal sign-in link?"
              : "Send this portal invite?"
            : "Run this change?"}
      </div>
      {isEmail ? (
        <div className="admin-chat-approval-email">
          <div>
            <span className="admin-chat-approval-label">To</span> {String(item.input.to ?? "")}
          </div>
          <div>
            <span className="admin-chat-approval-label">Subject</span>{" "}
            {String(item.input.subject ?? "")}
          </div>
          <pre>{String(item.input.body ?? "")}</pre>
        </div>
      ) : isPortal ? (
        <div className="admin-chat-approval-email">
          <div>{String(item.input.summary ?? "")}</div>
        </div>
      ) : (
        <pre className="admin-chat-approval-sql">{String(item.input.sql ?? "")}</pre>
      )}
      {statusLabel ? (
        <div className={`admin-chat-approval-status chatw-approval-status--${item.status}`}>
          {statusLabel}
        </div>
      ) : (
        <div className="admin-chat-approval-actions">
          <button
            type="button"
            className="admin-chat-approve"
            disabled={disabled}
            onClick={() => onDecide(item.id, true)}
          >
            {isEmail || isPortal ? "Approve & send" : "Approve & run"}
          </button>
          <button
            type="button"
            className="admin-chat-decline"
            disabled={disabled}
            onClick={() => onDecide(item.id, false)}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

type LegacyState = {
  items: ChatDisplayItem[];
  conversationId: string | null;
  input: string;
  pending: boolean;
};

const noop = () => {};

function LegacyAdminPanel({ state, canWrite }: { state: LegacyState; canWrite: boolean }) {
  const { items, conversationId, input, pending } = state;
  const showHistory = false;
  const hasPendingApproval = items.some(
    (it) => it.kind === "approval" && it.status === "pending",
  );
  return (
    <div>
      <button type="button" aria-label="Close" className="admin-drawer-backdrop" onClick={noop} />
      <aside className="admin-drawer admin-chat-panel" role="dialog" aria-label="Admin assistant">
        <div className="admin-drawer-head">
          <div>
            <div className="admin-drawer-eyebrow brand-label">8 Edges</div>
            <h2 className="admin-drawer-title">Assistant</h2>
          </div>
          <div className="admin-chat-head-actions">
            <button
              type="button"
              className={`admin-chat-history-btn${showHistory ? " admin-chat-history-btn--active" : ""}`}
              aria-pressed={showHistory}
              onClick={noop}
            >
              {showHistory ? "Back" : "History"}
            </button>
            {(items.length > 0 || conversationId) && (
              <button type="button" className="admin-chat-newchat" onClick={noop}>
                New chat
              </button>
            )}
            <button type="button" className="admin-drawer-close" aria-label="Close" onClick={noop}>
              ×
            </button>
          </div>
        </div>

        <>
          <div className="admin-chat-msgs">
            {items.length === 0 && (
              <div className="admin-chat-empty">
                <p>Ask anything about the Company OS data:</p>
                <ul>
                  <li>How many open deals do we have, and what is their total USD value?</li>
                  <li>Which job requisitions are open and how many applicants each?</li>
                  <li>Who is on vacation next week?</li>
                  <li>Top 5 unpaid invoices by balance.</li>
                </ul>
                <p className="admin-chat-empty-note">
                  {canWrite
                    ? "It can also update records and send emails — every change and every email needs your approval first."
                    : "Read-only. The assistant never changes data."}
                </p>
              </div>
            )}

            {items.map((item, i) => {
              if (item.kind === "user") {
                return (
                  <div key={i} className="admin-chat-msg admin-chat-msg--user">
                    {item.text}
                  </div>
                );
              }
              if (item.kind === "bot") {
                return (
                  <div key={i} className="admin-chat-msg admin-chat-msg--bot">
                    <BotText text={item.text} />
                  </div>
                );
              }
              if (item.kind === "tool") {
                return (
                  <div key={i} className="admin-chat-toolchip" title={item.detail}>
                    {CHIP_LABELS[item.name ?? ""] ?? "Queried the database"}
                  </div>
                );
              }
              if (item.kind === "approval") {
                return (
                  <LegacyApprovalCard key={i} item={item} disabled={pending} onDecide={noop} />
                );
              }
              return (
                <div key={i} className="admin-chat-msg admin-chat-msg--error">
                  {item.text}
                </div>
              );
            })}

            {pending && <div className="admin-chat-typing">Thinking…</div>}
          </div>

          <form className="admin-chat-composer" onSubmit={noop}>
            <input
              type="text"
              value={input}
              onChange={noop}
              placeholder={
                hasPendingApproval
                  ? "Approve or cancel the pending action first…"
                  : "Ask about the business…"
              }
              disabled={pending || hasPendingApproval}
              aria-label="Message the admin assistant"
            />
            <button
              type="submit"
              className="admin-chat-send"
              disabled={pending || hasPendingApproval || !input.trim()}
            >
              Send
            </button>
          </form>
        </>
      </aside>
    </div>
  );
}

function LegacyTeamPanel({ state }: { state: LegacyState }) {
  const { items, conversationId, input, pending } = state;
  const showHistory = false;
  return (
    <div>
      <button type="button" aria-label="Close" className="admin-drawer-backdrop" onClick={noop} />
      <aside className="admin-drawer admin-chat-panel" role="dialog" aria-label="Team assistant">
        <div className="admin-drawer-head">
          <div>
            <div className="admin-drawer-eyebrow brand-label">Edge8 Team</div>
            <h2 className="admin-drawer-title">Assistant</h2>
          </div>
          <div className="admin-chat-head-actions">
            <button
              type="button"
              className={`admin-chat-history-btn${showHistory ? " admin-chat-history-btn--active" : ""}`}
              aria-pressed={showHistory}
              onClick={noop}
            >
              {showHistory ? "Back" : "History"}
            </button>
            {(items.length > 0 || conversationId) && (
              <button type="button" className="admin-chat-newchat" onClick={noop}>
                New chat
              </button>
            )}
            <button type="button" className="admin-drawer-close" aria-label="Close" onClick={noop}>
              ×
            </button>
          </div>
        </div>

        <>
          <div className="admin-chat-msgs">
            {items.length === 0 && (
              <div className="admin-chat-empty">
                <p>Ask me anything about Edge8:</p>
                <ul>
                  <li>What&apos;s our time-off policy?</li>
                  <li>Who&apos;s out on vacation next week?</li>
                  <li>Who&apos;s in the design team, and who do they report to?</li>
                  <li>How much revenue have we invoiced this quarter?</li>
                  <li>Which clients do we work with?</li>
                </ul>
                <p className="admin-chat-empty-note">
                  Read-only. I look things up but never change anything, and I can&apos;t see
                  payroll or private personal data.
                </p>
              </div>
            )}

            {items.map((item, i) => {
              if (item.kind === "user") {
                return (
                  <div key={i} className="admin-chat-msg admin-chat-msg--user">
                    {item.text}
                  </div>
                );
              }
              if (item.kind === "bot") {
                return (
                  <div key={i} className="admin-chat-msg admin-chat-msg--bot">
                    <BotText text={item.text} />
                  </div>
                );
              }
              if (item.kind === "tool") {
                return (
                  <div key={i} className="admin-chat-toolchip" title={item.detail}>
                    Looked it up
                  </div>
                );
              }
              return (
                <div key={i} className="admin-chat-msg admin-chat-msg--error">
                  {(item as { text?: string }).text}
                </div>
              );
            })}

            {pending && <div className="admin-chat-typing">Thinking…</div>}
          </div>

          <form className="admin-chat-composer" onSubmit={noop}>
            <input
              type="text"
              value={input}
              onChange={noop}
              placeholder="Ask about Edge8…"
              disabled={pending}
              aria-label="Message the team assistant"
            />
            <button type="submit" className="admin-chat-send" disabled={pending || !input.trim()}>
              Send
            </button>
          </form>
        </>
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The props the two wrappers pass today, mirrored here so the test compares the
// real configuration and not an invented one.
// ---------------------------------------------------------------------------

function adminProps(canWrite: boolean): ChatWidgetProps {
  return {
    endpoint: "/api/admin/chat",
    storageKey: "edge8-admin-chat",
    surface: "admin",
    fabLabel: "Open admin assistant",
    panelLabel: "Admin assistant",
    eyebrow: "8 Edges",
    inputLabel: "Message the admin assistant",
    placeholder: "Ask about the business…",
    historyEmptyHint: "No saved conversations yet. Start chatting and they'll show up here.",
    toolChipLabel: (name) => CHIP_LABELS[name ?? ""] ?? "Queried the database",
    approvals: {
      pendingPlaceholder: "Approve or cancel the pending action first…",
      render: (args) => <LegacyApprovalCard {...args} />,
    },
    emptyState: (
      <>
        <p>Ask anything about the Company OS data:</p>
        <ul>
          <li>How many open deals do we have, and what is their total USD value?</li>
          <li>Which job requisitions are open and how many applicants each?</li>
          <li>Who is on vacation next week?</li>
          <li>Top 5 unpaid invoices by balance.</li>
        </ul>
        <p className="admin-chat-empty-note">
          {canWrite
            ? "It can also update records and send emails — every change and every email needs your approval first."
            : "Read-only. The assistant never changes data."}
        </p>
      </>
    ),
  };
}

const teamProps: ChatWidgetProps = {
  endpoint: "/api/team/chat",
  storageKey: "edge8-team-chat",
  surface: "team",
  fabLabel: "Open team assistant",
  panelLabel: "Team assistant",
  eyebrow: "Edge8 Team",
  inputLabel: "Message the team assistant",
  placeholder: "Ask about Edge8…",
  historyEmptyHint: "No saved conversations yet. Start chatting and they'll show up here.",
  toolChipLabel: () => "Looked it up",
  emptyState: (
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
  ),
};

function renderShared(props: ChatWidgetProps, state: LegacyState): string {
  const hasPendingApproval = Boolean(
    props.approvals && state.items.some((it) => it.kind === "approval" && it.status === "pending"),
  );
  return renderToStaticMarkup(
    <ChatPanelBody
      props={props}
      items={state.items}
      conversationId={state.conversationId}
      showHistory={false}
      onToggleHistory={noop}
      input={state.input}
      setInput={noop}
      pending={state.pending}
      hasPendingApproval={hasPendingApproval}
      onClose={noop}
      onNewChat={noop}
      onSubmit={noop}
      onSelect={noop}
      onDecide={noop}
      scrollRef={React.createRef<HTMLDivElement>()}
      inputRef={React.createRef<HTMLInputElement>()}
    />,
  );
}

const EMPTY: LegacyState = { items: [], conversationId: null, input: "", pending: false };

const WITH_MESSAGES: LegacyState = {
  items: [
    { kind: "user", text: "How many open deals?" },
    { kind: "bot", text: "There are **12** open deals — see /admin/crm.", streaming: false },
    { kind: "tool", detail: "select count(*) from deals", name: "run_query" },
    { kind: "tool", detail: "update deals set stage='won'", name: "execute_write" },
    { kind: "error", text: "Response interrupted. Try again." },
  ],
  conversationId: "conv-1",
  input: "next question",
  pending: false,
};

const PENDING_TYPING: LegacyState = {
  items: [{ kind: "user", text: "hello" }],
  conversationId: "conv-2",
  input: "",
  pending: true,
};

const approvalState = (
  name: string,
  input: Record<string, unknown>,
  status: "pending" | "approved" | "declined",
): LegacyState => ({
  items: [
    { kind: "user", text: "mark deal won" },
    { kind: "approval", id: "toolu_1", name, input, status },
  ],
  conversationId: "conv-3",
  input: "",
  pending: false,
});

describe("ChatWidget renders the admin panel exactly as AdminChatWidget did", () => {
  const cases: Array<[string, LegacyState, boolean]> = [
    ["empty, read-only", EMPTY, false],
    ["empty, canWrite", EMPTY, true],
    ["with messages", WITH_MESSAGES, true],
    ["thinking", PENDING_TYPING, true],
    [
      "pending SQL approval",
      approvalState("execute_write", { sql: "update deals set stage='won'" }, "pending"),
      true,
    ],
    [
      "pending email approval",
      approvalState(
        "send_email",
        { to: "a@b.com", subject: "Hi", body: "Body text" },
        "pending",
      ),
      true,
    ],
    [
      "pending portal invite",
      approvalState(
        "invite_portal_member",
        { action: "resend_link", summary: "Resend to a@b.com" },
        "pending",
      ),
      true,
    ],
    [
      "approved card",
      approvalState("execute_write", { sql: "update deals set stage='won'" }, "approved"),
      true,
    ],
    [
      "declined card",
      approvalState("send_email", { to: "a@b.com", subject: "Hi", body: "B" }, "declined"),
      true,
    ],
  ];

  it.each(cases)("%s", (_name, state, canWrite) => {
    const legacy = renderToStaticMarkup(<LegacyAdminPanel state={state} canWrite={canWrite} />);
    expect(renderShared(adminProps(canWrite), state)).toBe(legacy);
  });
});

describe("ChatWidget renders the team panel exactly as TeamChatWidget did", () => {
  const cases: Array<[string, LegacyState]> = [
    ["empty", EMPTY],
    ["with messages", { ...WITH_MESSAGES, items: WITH_MESSAGES.items.slice(0, 3) }],
    ["thinking", PENDING_TYPING],
  ];

  it.each(cases)("%s", (_name, state) => {
    const legacy = renderToStaticMarkup(<LegacyTeamPanel state={state} />);
    expect(renderShared(teamProps, state)).toBe(legacy);
  });
});
