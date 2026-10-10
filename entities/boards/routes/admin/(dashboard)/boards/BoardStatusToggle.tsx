"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

// Active or Inactive (archived) boards. URL-driven like the Client Hubs
// filter, so the page stays a server component that fetches only the set it
// shows; Active, the default, drops the param.
export function BoardStatusToggle({ inactive }: { inactive: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function pick(next: boolean) {
    startTransition(() =>
      router.push(next ? "/admin/boards?status=inactive" : "/admin/boards", {
        scroll: false,
      }),
    );
  }

  return (
    <div className="admin-viewtoggle" role="group" aria-label="Board status">
      <button
        type="button"
        className={inactive ? "" : "is-active"}
        aria-pressed={!inactive}
        disabled={pending}
        onClick={() => pick(false)}
      >
        Active
      </button>
      <button
        type="button"
        className={inactive ? "is-active" : ""}
        aria-pressed={inactive}
        disabled={pending}
        onClick={() => pick(true)}
      >
        Inactive
      </button>
    </div>
  );
}
