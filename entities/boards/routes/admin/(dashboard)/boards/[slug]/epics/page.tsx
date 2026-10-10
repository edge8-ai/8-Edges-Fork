import { requirePermission } from "@/kernel/identity/access-request";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHead } from "@/kernel/ui/PageHead";
import type { SearchParamsObj } from "@/kernel/ui/url";
import { getBoardBySlug } from "@/entities/boards/lib/data";
import { EpicsView } from "@/entities/boards/ui/EpicsView";

export const metadata = {
  title: "Epics",
  description: "The board's features, with the cards and Human Tokens behind each.",
};

export default async function BoardEpicsPage(
  props: { params: Promise<{ slug: string }>; searchParams: Promise<SearchParamsObj> }
) {
  // The page's declared permission (ADR 0013).
  await requirePermission("boards.open");
  const searchParams = await props.searchParams;
  const params = await props.params;
  const detail = await getBoardBySlug(params.slug);
  if (!detail) notFound();

  return (
    <>
      <PageHead
        eyebrow={<Link href={`/admin/boards/${detail.board.slug}`}>← {detail.board.name}</Link>}
        title="Epics"
        sub="One row per feature: its open and done cards, and the Human Tokens behind them."
      />
      <EpicsView detail={detail} surface="/admin" canManage searchParams={searchParams} />
    </>
  );
}
