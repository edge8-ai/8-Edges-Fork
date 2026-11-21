import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";

// An owner-password-protected PDF (AES-256, empty user password): every viewer
// opens it, and the API refuses it as "The PDF specified was not valid". It is
// the shape of the CV that broke the recruiter intake on 2026-09-25.
const PROTECTED_PDF = Buffer.from(
  "JVBERi0xLjMKJeLjz9MKMSAwIG9iago8PAovUHJvZHVjZXIgPDQ4ODY1OTFhOTkzMWFjMmQzYjc3N2RkZmEyMjhkNjgxYzI1ZmEwODI5ODlmMzdlZDMxN2YxMDI4ODY5NjAzM2M+Cj4+CmVuZG9iagoyIDAgb2JqCjw8Ci9UeXBlIC9QYWdlcwovQ291bnQgMQovS2lkcyBbIDQgMCBSIF0KPj4KZW5kb2JqCjMgMCBvYmoKPDwKL1R5cGUgL0NhdGFsb2cKL1BhZ2VzIDIgMCBSCj4+CmVuZG9iago0IDAgb2JqCjw8Ci9UeXBlIC9QYWdlCi9SZXNvdXJjZXMgPDwKL0ZvbnQgPDwKL0YxIDUgMCBSCj4+Cj4+Ci9NZWRpYUJveCBbIDAuMCAwLjAgNjEyIDc5MiBdCi9QYXJlbnQgMiAwIFIKL0NvbnRlbnRzIDYgMCBSCj4+CmVuZG9iago1IDAgb2JqCjw8Ci9UeXBlIC9Gb250Ci9TdWJ0eXBlIC9UeXBlMQovQmFzZUZvbnQgL0hlbHZldGljYQo+PgplbmRvYmoKNiAwIG9iago8PAovTGVuZ3RoIDk2Cj4+CnN0cmVhbQpUOup3y96hES4seJ6EUAvd1OkCiqfnPxRabauYpUhTYxqfqBTXEnCpQPmdUdHgCvBuGq9Ca8ZfzBBsedeJHBt5RwScqCNGx+REoHdbCRtsJ1WiUePnAviwuJ8PQZUvfqwKZW5kc3RyZWFtCmVuZG9iago3IDAgb2JqCjw8Ci9WIDUKL1IgNgovTGVuZ3RoIDI1NgovUCA0Mjk0OTY3MjkyCi9GaWx0ZXIgL1N0YW5kYXJkCi9PIDwxNGJiYzc5YTgyNjEyNTk5NjQ5ZTc2MWFjMTU1MDc3ZWY4ZjA1Yjc5YjQ1ZjM0ODExM2Y2ZWY4YzhiZWZhYzAxZDhjZDkzMDExOTM5NjdmZWUyNTkwMDM5N2NhMjUyNTI+Ci9VIDwyMGRmMTFiZGExNmYzZDYyNDQ2N2RmOWY2NDMzYTlhYjg4ODI4ZjZmM2NlMzRhYWVjNjYzNGQ0YzhhMjI5YjgyMzEyMTY0N2RkZjYyNTNjOTg4MWY1NjdjOGEwOTFlZGE+Ci9DRiA8PAovU3RkQ0YgPDwKL0F1dGhFdmVudCAvRG9jT3BlbgovQ0ZNIC9BRVNWMwovTGVuZ3RoIDMyCj4+Cj4+Ci9TdG1GIC9TdGRDRgovU3RyRiAvU3RkQ0YKL09FIDxmZjYxNGU2ODFlNzcyZjgxZmNmZGU5MTJlNDljNDI4YmJiYTFkZTFiZWU4Mzk3NmY5MDhjZjc4MGQ0MzA5MDAxPgovVUUgPDdkZDA3YjJhOGI3NzUzZWRlYmI0ZjVkOTkxNDRmNjU5MTEzNzJmYmVjMzI3NDYyM2NkMjlkY2I0MzBlY2Y3YjA+Ci9QZXJtcyA8ZDAzYmQ1NjRlZjM4ZTQ0YWJjMTJmMjkxODJmYWQ4YTM+Cj4+CmVuZG9iagp4cmVmCjAgOAowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMTUgMDAwMDAgbiAKMDAwMDAwMDExMyAwMDAwMCBuIAowMDAwMDAwMTcyIDAwMDAwIG4gCjAwMDAwMDAyMjEgMDAwMDAgbiAKMDAwMDAwMDM1MyAwMDAwMCBuIAowMDAwMDAwNDIzIDAwMDAwIG4gCjAwMDAwMDA1NjkgMDAwMDAgbiAKdHJhaWxlcgo8PAovU2l6ZSA4Ci9Sb290IDMgMCBSCi9JbmZvIDEgMCBSCi9JRCBbIDw2NjM2NjQzNjM4NjUzNTMzNjIzNTY1MzIzNzM4NjIzMDM5MzkzNzY1MzY2NjM0MzYzODYxNjY2MjYyNjEzNDM3PiA8NjYzNjY0MzYzODY1MzUzMzYyMzU2NTMyMzczODYyMzAzOTM5Mzc2NTM2NjYzNDM2Mzg2MTY2NjI2MjYxMzQzNz4gXQovRW5jcnlwdCA3IDAgUgo+PgpzdGFydHhyZWYKMTEyNAolJUVPRgo=",
  "base64",
);

const download = vi.fn();
vi.mock("@/kernel/data/supabase", () => ({
  supabase: { storage: { from: () => ({ download }) } },
  companyOs: {},
}));
vi.mock("@/kernel/ai/client", () => ({ anthropicIfConfigured: () => null }));
vi.mock("@/kernel/ai/models", () => ({ modelFor: () => "claude-test-model", siteModelFor: () => "claude-test-model", hostFor: () => null, fallbackFor: () => null }));
vi.mock("@/entities/hiring/lib/candidate-sensitive", () => ({ setCandidateAiSalary: vi.fn() }));

const { resumeContentBlock, withResumeBlock } = await import("./resume-screen");

const rejectedPdf = () =>
  new Anthropic.BadRequestError(
    400,
    { type: "error", error: { type: "invalid_request_error", message: "messages.0.content.0.pdf.source.base64.data: The PDF specified was not valid." } },
    "400 messages.0.content.0.pdf.source.base64.data: The PDF specified was not valid.",
    new Headers(),
  );

async function protectedResume() {
  download.mockResolvedValueOnce({ data: new Blob([PROTECTED_PDF]), error: null });
  const resume = await resumeContentBlock("admin/intake/x-cv.pdf", "application/pdf");
  if (!resume.ok) throw new Error(resume.error);
  return resume;
}

describe("withResumeBlock", () => {
  it("retries a refused PDF on the text pdf.js extracts from it", async () => {
    const resume = await protectedResume();
    const call = vi.fn().mockRejectedValueOnce(rejectedPdf()).mockResolvedValueOnce("screened");

    await expect(withResumeBlock(resume, call)).resolves.toBe("screened");
    expect(call.mock.calls[0][0].type).toBe("document");
    expect(call.mock.calls[1][0]).toEqual({
      type: "text",
      text: "RESUME (extracted from PDF):\n\nJin Tran jin@example.com English Trainer",
    });
  });

  it("fences the extracted text under the screen's nonce when the screen asks for it (Z.9)", async () => {
    download.mockResolvedValueOnce({ data: new Blob([PROTECTED_PDF]), error: null });
    const resume = await resumeContentBlock("admin/intake/x-cv.pdf", "application/pdf", "a1b2c3d4e5f6");
    if (!resume.ok) throw new Error(resume.error);
    const call = vi.fn().mockRejectedValueOnce(rejectedPdf()).mockResolvedValueOnce("screened");
    await withResumeBlock(resume, call);
    expect(call.mock.calls[1][0]).toEqual({
      type: "text",
      text: '<untrusted_transcript id="a1b2c3d4e5f6">\n[L1] Jin Tran jin@example.com English Trainer\n</untrusted_transcript id="a1b2c3d4e5f6">',
    });
  });

  it("sends the PDF once and never extracts text when the API accepts it", async () => {
    const resume = await protectedResume();
    const call = vi.fn().mockResolvedValueOnce("screened");

    await expect(withResumeBlock(resume, call)).resolves.toBe("screened");
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("lets every other failure through untouched", async () => {
    const resume = await protectedResume();
    const overloaded = new Error("529 overloaded");
    const call = vi.fn().mockRejectedValueOnce(overloaded);

    await expect(withResumeBlock(resume, call)).rejects.toBe(overloaded);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("names the remedy when the refused PDF has no text either", async () => {
    download.mockResolvedValueOnce({ data: new Blob([Buffer.from("%PDF-1.4 not really")]), error: null });
    const resume = await resumeContentBlock("admin/intake/x-cv.pdf", "application/pdf");
    if (!resume.ok) throw new Error(resume.error);
    const call = vi.fn().mockRejectedValueOnce(rejectedPdf());

    await expect(withResumeBlock(resume, call)).rejects.toThrow("Ask the candidate for an unprotected PDF.");
  });
});
