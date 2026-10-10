// A zip written as it is read (RB.12): the month-end bundle of receipts, red
// invoices and bank receipts can run to hundreds of files of up to 25 MB each,
// so it is never held in memory. Each entry's bytes pass straight from storage
// to the response; only the central directory (a few dozen bytes per entry)
// is kept until the end.
//
// The format is the plainest the spec allows, which every unzip tool reads:
// entries are STORED (receipts are PDFs and photos, already compressed, so
// deflating them costs time and saves nothing), each followed by a data
// descriptor because its size and CRC are known only after its bytes have
// gone, and names are UTF-8 (flag bit 11). No ZIP64: the caller refuses a
// bundle that would pass 4 GiB before the first byte is sent, because a
// streamed response cannot change its mind halfway.

/** The largest bundle a plain zip can address; the export refuses more before it starts. */
export const ZIP_LIMIT_BYTES = 0xffffffff;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** Folds `bytes` into a running CRC-32 (start at 0). Pure. */
export function crc32(bytes: Uint8Array, crc = 0): number {
  let c = ~crc >>> 0;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

/** One file in the bundle: its path inside the zip, and its bytes when asked for (null when they could not be had). */
export type ZipEntry = { name: string; open: () => Promise<ReadableStream<Uint8Array> | Uint8Array | null> };

const FLAGS = 0x0808; // bit 3: sizes in a data descriptor; bit 11: UTF-8 names.
// 1980-01-01 00:00, the format's epoch: the bundle carries no meaningful file times.
const DOS_TIME = 0;
const DOS_DATE = (1 << 5) | 1;

function header(size: number, fill: (v: DataView) => void): Uint8Array {
  const out = new Uint8Array(size);
  fill(new DataView(out.buffer));
  return out;
}

type Written = { nameBytes: Uint8Array; crc: number; size: number; offset: number };

async function* chunksOf(source: ReadableStream<Uint8Array> | Uint8Array): AsyncGenerator<Uint8Array> {
  if (source instanceof Uint8Array) {
    yield source;
    return;
  }
  const reader = source.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      if (value && value.length > 0) yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * The bundle's bytes, entry by entry, as a generator: each entry's local
 * header, its bytes as they arrive, its data descriptor, then the central
 * directory. An entry whose bytes cannot be had becomes a short note in its
 * place, so one missing object never loses the rest of the month.
 */
export async function* zipChunks(entries: Iterable<ZipEntry> | AsyncIterable<ZipEntry>): AsyncGenerator<Uint8Array> {
  const encoder = new TextEncoder();
  const written: Written[] = [];
  let offset = 0;
  const seen = new Set<string>();
  for await (const entry of entries) {
    let name = entry.name;
    for (let n = 2; seen.has(name); n++) name = entry.name.replace(/(\.[^./]+)?$/, (ext) => ` (${n})${ext}`);
    seen.add(name);
    let source: ReadableStream<Uint8Array> | Uint8Array | null = null;
    try {
      source = await entry.open();
    } catch {
      source = null;
    }
    if (!source) {
      name = `${name}.missing.txt`;
      source = encoder.encode(`This document could not be read from storage when the bundle was made. Download it from the claim instead.\n`);
    }
    const nameBytes = encoder.encode(name);
    const local = header(30 + nameBytes.length, (v) => {
      v.setUint32(0, 0x04034b50, true);
      v.setUint16(4, 20, true);
      v.setUint16(6, FLAGS, true);
      v.setUint16(8, 0, true);
      v.setUint16(10, DOS_TIME, true);
      v.setUint16(12, DOS_DATE, true);
      v.setUint16(26, nameBytes.length, true);
    });
    local.set(nameBytes, 30);
    const at = offset;
    yield local;
    offset += local.length;
    let crc = 0;
    let size = 0;
    for await (const chunk of chunksOf(source)) {
      crc = crc32(chunk, crc);
      size += chunk.length;
      if (offset + size > ZIP_LIMIT_BYTES) throw new Error("The bundle passed 4 GiB; export a shorter period.");
      yield chunk;
    }
    offset += size;
    const descriptor = header(16, (v) => {
      v.setUint32(0, 0x08074b50, true);
      v.setUint32(4, crc, true);
      v.setUint32(8, size, true);
      v.setUint32(12, size, true);
    });
    yield descriptor;
    offset += descriptor.length;
    written.push({ nameBytes, crc, size, offset: at });
  }
  const start = offset;
  for (const w of written) {
    const central = header(46 + w.nameBytes.length, (v) => {
      v.setUint32(0, 0x02014b50, true);
      v.setUint16(4, 20, true);
      v.setUint16(6, 20, true);
      v.setUint16(8, FLAGS, true);
      v.setUint16(10, 0, true);
      v.setUint16(12, DOS_TIME, true);
      v.setUint16(14, DOS_DATE, true);
      v.setUint32(16, w.crc, true);
      v.setUint32(20, w.size, true);
      v.setUint32(24, w.size, true);
      v.setUint16(28, w.nameBytes.length, true);
      v.setUint32(42, w.offset, true);
    });
    central.set(w.nameBytes, 46);
    yield central;
    offset += central.length;
  }
  yield header(22, (v) => {
    v.setUint32(0, 0x06054b50, true);
    v.setUint16(8, written.length, true);
    v.setUint16(10, written.length, true);
    v.setUint32(12, offset - start, true);
    v.setUint32(16, start, true);
  });
}

/** The generator as a web stream a route can return: pulled, so nothing is read ahead of the client. */
export function zipStream(entries: Iterable<ZipEntry> | AsyncIterable<ZipEntry>): ReadableStream<Uint8Array> {
  const chunks = zipChunks(entries);
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await chunks.next();
        if (done) controller.close();
        else controller.enqueue(value);
      } catch (err) {
        controller.error(err);
      }
    },
    async cancel() {
      await chunks.return(undefined);
    },
  });
}
