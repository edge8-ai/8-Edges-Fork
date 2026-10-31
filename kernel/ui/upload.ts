// Browser-side upload to a Supabase Storage signed upload URL.
//
// It is XHR and not fetch because only XHR reports upload progress, and the
// three document uploaders (admin CRM, team client hub, portal program
// onboarding) all render a per-file progress bar. Progress is scaled to 0.95 so
// the bar never reads "done" while the caller is still recording the row.
//
// The body is multipart with an empty field name and `cacheControl`, which is
// the shape Supabase Storage's signed-upload endpoint expects; `x-upsert: false`
// makes a collision fail loudly rather than overwrite someone's document.

import { Upload, type DetailedError } from "tus-js-client";

const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export function putToSignedUrl(signedUrl: string, file: File, onProgress: (p: number) => void): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    if (SUPABASE_KEY) xhr.setRequestHeader("apikey", SUPABASE_KEY);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress((e.loaded / e.total) * 0.95);
    };
    xhr.onload = () =>
      resolve(xhr.status >= 200 && xhr.status < 300 ? { ok: true } : { ok: false, error: `Upload failed (${xhr.status}).` });
    xhr.onerror = () => resolve({ ok: false, error: "Network error." });
    const fd = new FormData();
    fd.append("cacheControl", "3600");
    fd.append("", file);
    xhr.send(fd);
  });
}

// ─── Resumable upload to a signed path (W.128) ───────────────────────────────
// For files too large for one PUT: the TUS protocol, which Supabase Storage
// speaks at /storage/v1/upload/resumable, in 6 MB pieces (the only size it
// takes), retried with backoff when the connection drops. A signed upload token
// from `createSignedUploadUrl` rides in `x-signature`, so the browser needs no
// session of its own and can write that one path and nothing else.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

/**
 * The signed resumable endpoint. Supabase asks large uploads to use the
 * storage host directly ("<ref>.storage.supabase.co") rather than the API
 * gateway; any other URL (custom domain, local stack) is used as it is.
 */
export function resumableEndpoint(url: string = SUPABASE_URL): string {
  const direct = /^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/i.exec(url);
  const base = direct ? `https://${direct[1]}.storage.supabase.co` : url.replace(/\/$/, "");
  return `${base}/storage/v1/upload/resumable/sign`;
}

/**
 * How long an upload waits for the browser to come back online before it
 * gives up (bug hunt F0). Ten minutes covers a tunnel or a router restart;
 * past that the person is better served by a failure they can see and a Try
 * again that picks up from the same byte.
 */
export const OFFLINE_WAIT_MS = 10 * 60 * 1000;

/**
 * Why an upload stopped. "refused" is the storage saying no (a 4xx other than
 * the two that TUS asks a client to retry), which sending again will not
 * change. "stopped" is everything else, the retries running out or the
 * connection staying down, and the same upload can pick up where it left off.
 */
export type UploadStop = "refused" | "stopped";

export type ResumableHandle = {
  abort: () => void;
  /** The upload's address on the storage host once it has one, so a later try can resume it. */
  uploadUrl: () => string | null;
};

/** A real refusal: a 4xx answer, except 409 and 423, which TUS clients retry. */
export function isRefusal(err: Error | DetailedError): boolean {
  const res = "originalResponse" in err ? err.originalResponse : null;
  const status = res ? res.getStatus() : 0;
  return status >= 400 && status < 500 && status !== 409 && status !== 423;
}

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/**
 * Calls `done(true)` when the browser says it is online again, or `done(false)`
 * after `ms`. Returns a function that stops the wait without calling `done`.
 */
export function waitUntilOnline(ms: number, done: (back: boolean) => void): () => void {
  if (typeof window === "undefined") {
    done(false);
    return () => {};
  }
  const onOnline = () => finish(true);
  const timer = setTimeout(() => finish(false), ms);
  function stop() {
    clearTimeout(timer);
    window.removeEventListener("online", onOnline);
  }
  function finish(back: boolean) {
    stop();
    done(back);
  }
  window.addEventListener("online", onOnline);
  return stop;
}

export function resumableUploadToSignedPath(input: {
  file: File;
  bucket: string;
  path: string;
  token: string;
  /** An earlier try's `uploadUrl()`: the storage says how far that try got, and only the rest is sent. */
  resumeUrl?: string | null;
  onProgress: (sentBytes: number) => void;
  onError: (why: UploadStop) => void;
  onSuccess: () => void;
}): ResumableHandle {
  let aborted = false;
  let stopWaiting: (() => void) | null = null;
  let current: Upload | null = null;

  // tus-js-client never retries while the browser reports itself offline (its
  // default check reads navigator.onLine), so a dropped connection used to fail
  // the upload at once (bug hunt F0). Offline, the retry hook declines, the
  // error lands here, and the upload waits for the "online" event. It then
  // starts again from the address the storage gave it, which resumes from the
  // stored offset with a fresh set of retries.
  const begin = (uploadUrl: string | null) => {
    const upload: Upload = new Upload(input.file, {
      endpoint: resumableEndpoint(),
      uploadUrl,
      retryDelays: [0, 3000, 5000, 10000, 20000, 60000],
      headers: { apikey: SUPABASE_KEY ?? "", "x-signature": input.token, "x-upsert": "false" },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: 6 * 1024 * 1024,
      metadata: { bucketName: input.bucket, objectName: input.path, contentType: input.file.type, cacheControl: "3600" },
      onShouldRetry: (err) => !isRefusal(err) && !isOffline(),
      onProgress: (sent) => input.onProgress(sent),
      onError: (err) => {
        if (aborted) return;
        if (isRefusal(err)) return input.onError("refused");
        if (!isOffline()) return input.onError("stopped");
        stopWaiting = waitUntilOnline(OFFLINE_WAIT_MS, (back) => {
          stopWaiting = null;
          if (aborted) return;
          if (back) begin(upload.url ?? uploadUrl);
          else input.onError("stopped");
        });
      },
      onSuccess: () => input.onSuccess(),
    });
    current = upload;
    upload.start();
  };
  begin(input.resumeUrl ?? null);

  return {
    abort: () => {
      aborted = true;
      stopWaiting?.();
      void current?.abort(true);
    },
    uploadUrl: () => current?.url ?? null,
  };
}
