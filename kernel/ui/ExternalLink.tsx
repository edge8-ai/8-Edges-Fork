import type { AnchorHTMLAttributes, ReactNode } from "react";
import { externalHref } from "./url";

// A link somebody typed, drawn only when it is one. The stored value goes in
// `href` and externalHref decides whether it becomes an <a> opening in a new
// tab or `fallback`, so a stored `javascript:` or a bare word never reaches an
// href whichever writer put it there. It sits at render time as well as behind
// the writers because rows written before a writer checked its input, or by
// SQL and skills that never pass through one, are rendered all the same.
type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "target" | "rel" | "children"> & {
  href: string | null | undefined;
  children?: ReactNode;
  fallback?: ReactNode;
};

export function ExternalLink({ href, children, fallback = null, ...rest }: Props) {
  const safe = externalHref(href);
  if (!safe) return <>{fallback}</>;
  return (
    <a {...rest} href={safe} target="_blank" rel="noopener noreferrer">
      {children ?? safe}
    </a>
  );
}
