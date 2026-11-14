import React from "react";
import { externalHref, internalPath } from "./url";

// Minimal markdown renderer for assistant replies, shared by the admin and team
// chat widgets and the client-roadmap overview editor so they all format
// identically. It has no data of its own, which is why it sits in the kernel:
// an entity that owned it would be imported by every entity that renders a
// model reply, and that was a cycle (RS-04). Supports **bold**, `inline code`,
// "- " bullet lists, line breaks, clickable links — both [label](url) markdown
// links and bare URLs (https://… and internal /team/… or /admin/… paths) — and
// inline photo thumbnails via ![alt](url). Links are how the assistants point
// people at a profile or record, so they must render as real anchors, not dead
// text; images let the team assistant show a person's photo.

// Split tokens, longest/most-specific first: the image token (leading "!") must
// come before the link token so ![alt](url) is captured whole, and a markdown
// link before its inner path can match as a bare URL.
const TOKEN =
  /(\*\*[^*]+\*\*|`[^`]+`|!\[[^\]]*\]\([^)\s]+\)|\[[^\]]+\]\([^)\s]+\)|https?:\/\/[^\s)]+|\/(?:team|admin)\/[^\s)]+)/g;

const MD_LINK = /^\[([^\]]+)\]\(([^)\s]+)\)$/;
const MD_IMAGE = /^!\[([^\]]*)\]\(([^)\s]+)\)$/;

// Only render an <img> for images hosted in our own public Supabase storage
// buckets (avatars/gallery). Anything else is shown as a link instead, so a
// coaxed reply can never load an off-domain tracking pixel from the chat pane.
const SAFE_IMAGE =
  /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/(?:avatars|gallery)\//i;

function Anchor({ href, children }: { href: string; children: React.ReactNode }) {
  // A path on this site navigates in place; a web link opens in a new tab.
  // Anything else is drawn as plain text: a reply is model output that text
  // stored in the database can steer, so a [label](javascript:…) link must
  // never reach an href.
  const path = internalPath(href);
  if (path) return <a href={path}>{children}</a>;
  const external = externalHref(href);
  if (!external) return <>{children}</>;
  return (
    <a href={external} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

function renderInline(text: string, keyBase: string): React.ReactNode[] {
  return text.split(TOKEN).map((part, i) => {
    const key = `${keyBase}-${i}`;
    if (!part) return null;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return <code key={key}>{part.slice(1, -1)}</code>;
    }
    const img = MD_IMAGE.exec(part);
    if (img) {
      const [, alt, src] = img;
      if (SAFE_IMAGE.test(src)) {
        // eslint-disable-next-line @next/next/no-img-element -- model-emitted storage URL of unknown size; next/image needs fixed dimensions
        return <img key={key} className="admin-assistant-photo" src={src} alt={alt || "photo"} loading="lazy" />;
      }
      // Untrusted host: link to it rather than loading it inline.
      return (
        <Anchor key={key} href={src}>
          {alt || src}
        </Anchor>
      );
    }
    const md = MD_LINK.exec(part);
    if (md) {
      return (
        <Anchor key={key} href={md[2]}>
          {md[1]}
        </Anchor>
      );
    }
    if (/^https?:\/\//.test(part) || /^\/(?:team|admin)\//.test(part)) {
      // Keep trailing sentence punctuation out of the href.
      const [, url, trail] = /^(.*?)([.,;:!?]*)$/.exec(part) as RegExpExecArray;
      return (
        <React.Fragment key={key}>
          <Anchor href={url}>{url}</Anchor>
          {trail}
        </React.Fragment>
      );
    }
    return part;
  });
}

export function BotText({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let list: React.ReactNode[] = [];
  const flush = (key: string) => {
    if (list.length) {
      out.push(<ul key={key}>{list}</ul>);
      list = [];
    }
  };
  lines.forEach((line, i) => {
    if (/^\s*[-*] /.test(line)) {
      list.push(<li key={`li-${i}`}>{renderInline(line.replace(/^\s*[-*] /, ""), `l${i}`)}</li>);
    } else {
      flush(`ul-${i}`);
      if (line.trim()) out.push(<p key={`p-${i}`}>{renderInline(line, `t${i}`)}</p>);
    }
  });
  flush("ul-end");
  return <>{out}</>;
}
