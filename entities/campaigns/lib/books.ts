import { companyOs } from "@/kernel/data/supabase";

// Books: the AIO manuscripts imported from the aio-website repo
// (scripts/books/import-books.mjs). Chapters are the markdown source the
// content pipeline reads; reader_path points at the rendered HTML under
// public/books/.

export type Book = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  format: "nonfiction" | "fable";
  audience: string | null;
  description: string | null;
  readerPath: string | null;
  status: string;
  brandName: string | null;
  chapterCount: number;
};

export type BookChapter = {
  id: string;
  sortOrder: number;
  part: string | null;
  title: string;
  bodyMd: string;
};

type DbBook = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  format: "nonfiction" | "fable";
  audience: string | null;
  description: string | null;
  reader_path: string | null;
  status: string;
  brands: { name: string } | { name: string }[] | null;
  book_chapters: { count: number }[];
};

function mapBook(row: DbBook): Book {
  const brand = Array.isArray(row.brands) ? row.brands[0] : row.brands;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    format: row.format,
    audience: row.audience,
    description: row.description,
    readerPath: row.reader_path,
    status: row.status,
    brandName: brand?.name ?? null,
    chapterCount: row.book_chapters[0]?.count ?? 0,
  };
}

const BOOK_SELECT =
  "id, slug, title, subtitle, format, audience, description, reader_path, status, brands(name), book_chapters(count)";

export async function listBooks(): Promise<Book[]> {
  const { data, error } = await companyOs.from("books").select(BOOK_SELECT)
    .order("sort_order");
  if (error) throw error;
  return (data as DbBook[]).map(mapBook);
}

export async function getBook(
  slug: string,
): Promise<{ book: Book; chapters: BookChapter[] } | null> {
  const { data, error } = await companyOs.from("books").select(BOOK_SELECT)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { data: chapters, error: chErr } = await companyOs.from("book_chapters").select("id, sort_order, part, title, body_md")
    .eq("book_id", (data as DbBook).id)
    .order("sort_order");
  if (chErr) throw chErr;
  return {
    book: mapBook(data as DbBook),
    chapters: (chapters ?? []).map((c) => ({
      id: c.id,
      sortOrder: c.sort_order,
      part: c.part,
      title: c.title,
      bodyMd: c.body_md,
    })),
  };
}
