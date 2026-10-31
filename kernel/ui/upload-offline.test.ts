import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Bug hunt F0 (2026-10-05): tus-js-client never retries while the browser says
// it is offline, so "Keeps going if the connection drops" was untrue: a real
// disconnect failed the upload at once. The helper now waits for the "online"
// event and resumes from the address the storage gave the upload, and keeps
// telling a real refusal (a 4xx) apart from a stop that a later try can resume.
//
// tus-js-client is replaced by a recording double: each Upload it builds is
// kept, with its options, so a test can fail it the way the library would.

type Options = {
  uploadUrl?: string | null;
  onShouldRetry: (err: unknown, attempt: number, options: unknown) => boolean;
  onError: (err: unknown) => void;
};
const built: { options: Options; started: number; aborted: boolean; url: string | null }[] = [];

vi.mock("tus-js-client", () => ({
  Upload: class {
    url: string | null;
    record: (typeof built)[number];
    constructor(_file: unknown, options: Options) {
      this.url = options.uploadUrl ?? null;
      this.record = { options, started: 0, aborted: false, url: this.url };
      built.push(this.record);
    }
    start() {
      this.record.started += 1;
      // The storage hands every upload an address as soon as it is created.
      this.url ??= "https://s/upload/resumable/sign/abc";
    }
    abort() {
      this.record.aborted = true;
      return Promise.resolve();
    }
  },
}));

const { resumableUploadToSignedPath, OFFLINE_WAIT_MS } = await import("./upload");

const answered = (status: number) => ({ originalRequest: {}, originalResponse: { getStatus: () => status } });
const dropped = { originalRequest: {}, originalResponse: null };

let online = true;
let page: EventTarget;

function start(onError = vi.fn()) {
  const handle = resumableUploadToSignedPath({
    file: new File([new Uint8Array([1, 2, 3])], "cut.mp4", { type: "video/mp4" }),
    bucket: "card-attachments",
    path: "task/t1/d1-cut.mp4",
    token: "tok",
    onProgress: () => {},
    onError,
    onSuccess: () => {},
  });
  return { handle, onError };
}

beforeEach(() => {
  built.length = 0;
  online = true;
  page = new EventTarget();
  vi.useFakeTimers();
  vi.stubGlobal("navigator", {
    get onLine() {
      return online;
    },
  });
  vi.stubGlobal("window", page);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("an upload whose connection drops (F0)", () => {
  it("waits for the browser to come back online, then resumes from the stored upload", () => {
    const { onError } = start();
    online = false;
    built[0].options.onError(dropped);
    expect(onError).not.toHaveBeenCalled();
    expect(built).toHaveLength(1);

    online = true;
    page.dispatchEvent(new Event("online"));
    expect(built).toHaveLength(2);
    expect(built[1].options.uploadUrl).toBe("https://s/upload/resumable/sign/abc");
    expect(built[1].started).toBe(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it("gives up as a resumable stop when the connection stays down", () => {
    const { onError } = start();
    online = false;
    built[0].options.onError(dropped);
    vi.advanceTimersByTime(OFFLINE_WAIT_MS);
    expect(onError).toHaveBeenCalledWith("stopped");
    expect(built).toHaveLength(1);
  });

  it("does not restart an upload that was cancelled while it waited", () => {
    const { handle, onError } = start();
    online = false;
    built[0].options.onError(dropped);
    handle.abort();
    page.dispatchEvent(new Event("online"));
    vi.advanceTimersByTime(OFFLINE_WAIT_MS);
    expect(built).toHaveLength(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it("lets the library retry online, and declines while offline so the wait takes over", () => {
    start();
    const retry = built[0].options.onShouldRetry;
    expect(retry(dropped, 0, {})).toBe(true);
    expect(retry(answered(500), 0, {})).toBe(true);
    expect(retry(answered(409), 0, {})).toBe(true);
    online = false;
    expect(retry(dropped, 0, {})).toBe(false);
  });
});

describe("an upload the storage refuses", () => {
  it("is never retried and is reported as refused, online or not", () => {
    const { onError } = start();
    expect(built[0].options.onShouldRetry(answered(403), 0, {})).toBe(false);
    online = false;
    built[0].options.onError(answered(403));
    expect(onError).toHaveBeenCalledWith("refused");
  });

  it("reports other failures online as a stop that can be resumed", () => {
    const { handle, onError } = start();
    built[0].options.onError(answered(500));
    expect(onError).toHaveBeenCalledWith("stopped");
    expect(handle.uploadUrl()).toBe("https://s/upload/resumable/sign/abc");
  });
});
