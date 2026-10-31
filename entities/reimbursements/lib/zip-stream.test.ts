import { describe, expect, it } from "vitest";
import { crc32, zipStream, type ZipEntry } from "./zip-stream";

// The streamed zip (RB.12). Read back here the way an unzip tool reads it —
// from the end-of-directory record, through the central directory, to each
// entry's bytes — so a wrong offset, size or CRC fails, not only a missing
// signature.

const enc = new TextEncoder();
const dec = new TextDecoder();

async function collect(stream: ReadableStream<Uint8Array>): Promise<{ bytes: Uint8Array; chunks: number }> {
  const parts: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
  }
  const bytes = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    bytes.set(p, at);
    at += p.length;
  }
  return { bytes, chunks: parts.length };
}

/** The entries a zip's central directory lists, each with its bytes as its local header leads to them. */
function unzip(bytes: Uint8Array): { name: string; data: string; crcOk: boolean }[] {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  expect(v.getUint32(end, true)).toBe(0x06054b50);
  const count = v.getUint16(end + 10, true);
  let at = v.getUint32(end + 16, true);
  const out: { name: string; data: string; crcOk: boolean }[] = [];
  for (let i = 0; i < count; i++) {
    expect(v.getUint32(at, true)).toBe(0x02014b50);
    const crc = v.getUint32(at + 16, true);
    const size = v.getUint32(at + 20, true);
    const nameLen = v.getUint16(at + 28, true);
    const local = v.getUint32(at + 42, true);
    const name = dec.decode(bytes.subarray(at + 46, at + 46 + nameLen));
    expect(v.getUint32(local, true)).toBe(0x04034b50);
    const start = local + 30 + v.getUint16(local + 26, true);
    const data = bytes.subarray(start, start + size);
    expect(v.getUint32(start + size, true)).toBe(0x08074b50);
    out.push({ name, data: dec.decode(data), crcOk: crc32(data) === crc });
    at += 46 + nameLen;
  }
  return out;
}

function streamOf(...parts: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(c) {
      for (const p of parts) c.enqueue(enc.encode(p));
      c.close();
    },
  });
}

describe("crc32", () => {
  it("matches the standard check values", () => {
    expect(crc32(enc.encode("hello"))).toBe(0x3610a686);
    expect(crc32(enc.encode("123456789"))).toBe(0xcbf43926);
    // Folding chunk by chunk gives the same answer as all at once.
    expect(crc32(enc.encode("6789"), crc32(enc.encode("12345")))).toBe(0xcbf43926);
  });
});

describe("zipStream", () => {
  it("writes each entry's bytes as they arrive, readable back with its name and CRC", async () => {
    const entries: ZipEntry[] = [
      { name: "2026-10-16 Avery - Taxis [aaaa1111]/item 01 Grab - receipt.pdf", open: async () => streamOf("%PDF-1.7 ", "first file") },
      { name: "bank receipts/2026-10-16 Avery.png", open: async () => enc.encode("second") },
    ];
    const { bytes, chunks } = await collect(zipStream(entries));
    expect(unzip(bytes)).toEqual([
      { name: entries[0].name, data: "%PDF-1.7 first file", crcOk: true },
      { name: entries[1].name, data: "second", crcOk: true },
    ]);
    // Streamed: the first file's two chunks go out as two, never joined in memory.
    expect(chunks).toBeGreaterThanOrEqual(2 * 3 + 2 + 1);
  });

  it("puts a note in place of a document storage could not give, and keeps the rest", async () => {
    const { bytes } = await collect(
      zipStream([
        { name: "a.pdf", open: async () => null },
        { name: "b.pdf", open: async () => streamOf("ok") },
      ]),
    );
    const files = unzip(bytes);
    expect(files.map((f) => f.name)).toEqual(["a.pdf.missing.txt", "b.pdf"]);
    expect(files[0].data).toMatch(/could not be read/);
  });

  it("never gives two entries the same name", async () => {
    const { bytes } = await collect(
      zipStream([
        { name: "x/receipt.pdf", open: async () => enc.encode("1") },
        { name: "x/receipt.pdf", open: async () => enc.encode("2") },
      ]),
    );
    expect(unzip(bytes).map((f) => f.name)).toEqual(["x/receipt.pdf", "x/receipt (2).pdf"]);
  });

  it("reads nothing ahead of the client: an entry is opened only when the zip reaches it", async () => {
    const opened: string[] = [];
    const reader = zipStream([
      { name: "a", open: async () => (opened.push("a"), enc.encode("1")) },
      { name: "b", open: async () => (opened.push("b"), enc.encode("2")) },
    ]).getReader();
    await reader.read();
    expect(opened).toEqual(["a"]);
    await reader.cancel();
  });
});
