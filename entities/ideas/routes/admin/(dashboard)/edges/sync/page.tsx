import { requirePermission } from "@/kernel/identity/access-request";
import { companyOs } from "@/kernel/data/supabase";
import { PageHead } from "@/kernel/ui/PageHead";

export const metadata = {
  title: "Sync",
  description: "8 Edges: the weekly heartbeat. The Monday packet, prepared Sunday 18:00 by the product manager agent.",
};

type Packet = { id: string; week_start: string; body_md: string; created_by: string; created_at: string };

// Minimal renderer for the packet's markdown subset (## headings and - bullets).
function PacketBody({ body }: { body: string }) {
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = (key: string) => {
    if (!list.length) return;
    blocks.push(
      <ul key={key} className="u-list u-mt-2 u-mb-4">
        {list.map((item, i) => (
          <li key={i} className="u-mb-1">
            {item}
          </li>
        ))}
      </ul>,
    );
    list = [];
  };
  body.split("\n").forEach((line, i) => {
    if (line.startsWith("## ")) {
      flush(`l${i}`);
      blocks.push(
        <h3 key={i} className="admin-h-sm">
          {line.slice(3)}
        </h3>,
      );
    } else if (line.startsWith("- ")) {
      list.push(line.slice(2));
    } else if (line.trim()) {
      flush(`l${i}`);
      blocks.push(
        <p key={i} className="u-m-0 u-mb-2">
          {line}
        </p>,
      );
    }
  });
  flush("end");
  return <>{blocks}</>;
}

export default async function SyncPage() {
  // The page's declared permission (ADR 0013).
  await requirePermission("ideas.manage");
  const { data, error } = await companyOs.from("sync_packets").select("id, week_start, body_md, created_by, created_at")
    .order("week_start", { ascending: false })
    .limit(13);

  const packets = (data ?? []) as Packet[];
  const [latest, ...past] = packets;

  return (
    <>
      <PageHead
        eyebrow="8 Edges"
        title="Sync"
        sub="The weekly heartbeat. The packet is prepared every Sunday 18:00 from the live numbers, goals, and issues; the meeting starts at the decision."
      />
      {error && (
        <div className="admin-alert admin-alert--err u-mb-4">
          {error.message}
        </div>
      )}

      {!latest && (
        <div className="admin-empty">
          No packet yet. The Sunday 18:00 run creates the first one, or run `node scripts/edges/sync-packet.mjs` from the
          repo root.
        </div>
      )}

      {latest && (
        <div className="admin-card u-mb-4 u-p-4">
          <div className="u-row u-gap-3 u-wrap u-mb-2">
            <h2 className="u-m-0 u-lg u-strong">Sync of {latest.week_start}</h2>
            <span className="admin-badge admin-badge--ok">AGENT</span>
            <span className="admin-cell-muted u-xs">
              prepared by {latest.created_by} · {new Date(latest.created_at).toLocaleString()}
            </span>
          </div>
          <PacketBody body={latest.body_md} />
        </div>
      )}

      {past.length > 0 && (
        <div className="admin-card u-p-4">
          <h3 className="u-label u-m-0 u-mt-1 u-mb-2">
            Past syncs (the streak: {packets.length} packet{packets.length === 1 ? "" : "s"})
          </h3>
          {past.map((p) => (
            <details key={p.id} className="admin-divider-row">
              <summary className="u-strong u-pointer">Sync of {p.week_start}</summary>
              <PacketBody body={p.body_md} />
            </details>
          ))}
        </div>
      )}
    </>
  );
}
