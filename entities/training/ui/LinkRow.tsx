"use client";

// A table row that opens a page: the Admin view's training plans open their
// class page, and a class's lessons open the lesson page (Dave, 2026-10-26: a
// full page, no side shelf). The whole row is the target, by click or by
// Enter, as crm's company rows are; a link or button inside it keeps its own click.
import { useRouter } from "next/navigation";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";

export function LinkRow({ href, children }: { href: string; children: ReactNode }) {
  const router = useRouter();
  const inner = (e: { target: EventTarget; currentTarget: HTMLTableRowElement }) => {
    const hit = (e.target as HTMLElement).closest("a,button,input,select,label,[role=button]");
    return !!hit && hit !== e.currentTarget;
  };
  const onClick = (e: MouseEvent<HTMLTableRowElement>) => {
    if (!inner(e)) router.push(href);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTableRowElement>) => {
    if ((e.key === "Enter" || e.key === " ") && !inner(e)) {
      e.preventDefault();
      router.push(href);
    }
  };
  return (
    <tr className="is-clickable" onClick={onClick} onKeyDown={onKeyDown} tabIndex={0} role="link">
      {children}
    </tr>
  );
}
