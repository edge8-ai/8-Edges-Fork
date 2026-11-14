// The assistant's contribution to the admin shell: the chat pane, already told
// whether this admin may ask it to write. A server component, so the privileged
// check runs here and the shell receives one finished element. The admin
// layout used to import the widget and the check separately and compose them
// itself — which meant a deployment without the assistant still bundled both.
// Now the generated app/shell.ts hands the layout this or nothing (W.7).
import { isPrivilegedChatUser } from "../lib/admin-chat/privileged";
import { AdminChatWidget } from "./AdminChatWidget";

export function AdminAssistant({ email }: { email: string | null | undefined }) {
  return <AdminChatWidget canWrite={isPrivilegedChatUser(email)} />;
}
