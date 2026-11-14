import type { LarkConnectionStatus } from "@/entities/coaching/lib/lark-connection";

// One line above the tabs: whether the daily pickup can read this coach's 1-1
// recordings. A plain link starts the Lark sign-in (/api/coaching-lark/connect).

const STATUS_TEXT: Record<string, string> = {
  connected: "Lark is connected. Your 1-1 recordings come in each evening.",
  denied: "Lark was not connected: the sign-in was cancelled.",
  state_mismatch: "Lark was not connected: the sign-in expired. Try again.",
  error: "Lark was not connected: Lark refused the sign-in. Try again, or tell Dave.",
  unconfigured: "Lark is not set up on this site yet.",
};

export function LarkConnectLine({ connection, status }: { connection: LarkConnectionStatus; status: string | null }) {
  const flash = status ? STATUS_TEXT[status] : null;
  if (connection.connected && !connection.lastError) {
    return flash ? <p className="admin-hint">{flash}</p> : null;
  }
  return (
    <p className="admin-hint">
      {flash && <>{flash} </>}
      {connection.connected && connection.lastError ? (
        <>The last 1-1 pickup failed ({connection.lastError}). </>
      ) : (
        <>Connect Lark and your 1-1 recordings titled &ldquo;1-1 Name &lt;&gt; You&rdquo; come in by themselves. </>
      )}
      <a href="/api/coaching-lark/connect" className="admin-btn admin-btn--sm">
        {connection.connected ? "Reconnect Lark" : "Connect Lark"}
      </a>
    </p>
  );
}
