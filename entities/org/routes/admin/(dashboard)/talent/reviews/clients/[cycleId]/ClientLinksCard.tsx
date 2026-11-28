"use client";

import { useRouter } from "next/navigation";
import type { MayProp } from "@/kernel/identity/may-prop";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import type { ClientLinks, ClientManagerLine } from "@/entities/org/lib/client-reviews/client-links";
import { CopyLinkButton } from "./CopyLinkButton";
import { cancelManagerLinkAction, reissueManagerLinkAction } from "./manager-link-actions";
import { SkipLinkCard } from "./SkipLinkCard";

// The overview's "Send the client their links" card (CR.5.7), beside "Email
// the members": one line per client manager with their one link for all their
// members, then the skip-manager's. Copying sends nothing; the owner sends each link
// themselves, because the app never contacts anyone at the client. A viewer the
// manager reviews gets no link and no action, only why (./client-links).

type SkipLink = { link: string | null; copiedAt: string | null; cancelled: boolean; inCycle: boolean };

export function ClientLinksCard({ may, cycleId, closed, links, skip }: { may: MayProp; cycleId: string; closed: boolean; links: ClientLinks; skip: SkipLink }) {
  const empty = links.managers.length === 0 && !links.skip;
  return (
    <section className="admin-card u-p-4" aria-labelledby="cr-links-title">
      <div className="cr-card-head">
        <h2 id="cr-links-title" className="admin-card-title u-m-0">
          Send the client their links
        </h2>
        <span className="admin-hint u-m-0">One link per person. Copying sends nothing: you send each link yourself.</span>
      </div>
      {empty ? (
        <p className="admin-hint u-m-0">Nobody at the client reviews this cycle yet. Name a client manager on a member&apos;s row.</p>
      ) : (
        <ul className="cr-links">
          {links.managers.map((line) => (
            <ManagerLine key={line.clientManagerPersonId} may={may} cycleId={cycleId} line={line} />
          ))}
          {links.skip && (
            <li className="cr-link">
              <LineHead name={links.skip.name} detail={links.skip.detail} preview={skip.link} />
              <SkipLinkCard
                may={may}
                cycleId={cycleId}
                name={links.skip.name}
                link={skip.link}
                copiedAt={skip.copiedAt}
                cancelled={skip.cancelled}
                closed={closed}
                inCycle={skip.inCycle}
              />
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

/** Who the line is for, how many they review and how far they are, and a way to open the page their link opens. */
function LineHead({ name, detail, preview }: { name: string; detail: string; preview: string | null }) {
  return (
    <div className="cr-link-head">
      <strong>{name}</strong>
      <span className="admin-hint u-m-0">{detail}</span>
      {preview && (
        <a className="admin-hint u-m-0" href={preview} target="_blank" rel="noreferrer">
          See what they see
        </a>
      )}
    </div>
  );
}

function ManagerLine({ may, cycleId, line }: { may: MayProp; cycleId: string; line: ClientManagerLine }) {
  const router = useRouter();
  const target = { cycleId, clientManagerPersonId: line.clientManagerPersonId };
  const { link, name } = line;
  return (
    <li className="cr-link">
      <LineHead name={name} detail={line.detail} preview={link.kind === "copy" ? link.url : null} />
      <div className="u-mt-2">
        {link.kind === "copy" ? (
          // Keyed by the link, so a new link starts as not copied rather than keeping the old one's time.
          <CopyLinkButton key={link.url} may={may} manager={target} link={link.url} copiedAt={link.copiedAt} subject={link.label} />
        ) : (
          <p className="admin-hint u-m-0" role="status">
            {link.why}
          </p>
        )}
      </div>
      {may["org.reviews"] && (line.canCancel || line.canIssue) && (
        <div className="u-row u-gap-2 u-wrap u-mt-2">
          {line.canCancel && (
            <ConfirmButton
              className="admin-btn admin-btn--sm admin-btn--danger"
              label="Cancel link…"
              title={`Cancel ${name}'s link?`}
              body={`The link stops opening at once, and so does every form opened from it before. The answers ${name} has given so far stay. You can issue a new link afterwards.`}
              confirmLabel="Cancel the link"
              onConfirm={() => cancelManagerLinkAction(target)}
              onDone={() => router.refresh()}
            />
          )}
          {line.canIssue && (
            <ConfirmButton
              className="admin-btn admin-btn--sm"
              label={line.hasLink ? "Issue a new link…" : "Issue a link…"}
              title={line.hasLink ? `Issue ${name} a new link?` : `Issue ${name} a link?`}
              body={
                line.hasLink
                  ? `The link ${name} has stops opening at once, with every form opened from it, and a new one replaces it for you to copy and send. Their answers so far stay.`
                  : `${name} gets one link for all their members, for you to copy and send. Issuing it sends nothing.`
              }
              confirmLabel={line.hasLink ? "Issue a new link" : "Issue the link"}
              onConfirm={() => reissueManagerLinkAction(target)}
              onDone={() => router.refresh()}
            />
          )}
        </div>
      )}
    </li>
  );
}
