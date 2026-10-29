"use client";

export type UploadKind = "image" | "video" | "receipt" | "document";
export type UploadResult = { id: string; url?: string; thumbUrl?: string | null; name?: string };

/** XHR upload with progress and automatic retry for network failures. */
export function uploadFile(file: Blob & { name?: string }, kind: UploadKind, opts: { params?: Record<string, string>; onProgress?: (pct: number) => void; retries?: number; name?: string } = {}): Promise<UploadResult> {
  const params = new URLSearchParams({ kind, ...(opts.params ?? {}) });
  const attempt = (left: number): Promise<UploadResult> =>
    new Promise<UploadResult>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", `/api/uploads?${params}`);
      xhr.setRequestHeader("x-filename", encodeURIComponent(opts.name ?? file.name ?? "upload"));
      xhr.setRequestHeader("content-type", "application/octet-stream");
      xhr.upload.onprogress = (e) => e.lengthComputable && opts.onProgress?.(Math.round((e.loaded / e.total) * 100));
      xhr.onload = () => {
        let body: { error?: string } & UploadResult = { id: "" };
        try {
          body = JSON.parse(xhr.responseText);
        } catch {}
        if (xhr.status >= 200 && xhr.status < 300) resolve(body);
        else {
          const err = new Error(body.error || `Upload failed (${xhr.status})`) as Error & { retryable?: boolean };
          err.retryable = xhr.status >= 500 || xhr.status === 429;
          reject(err);
        }
      };
      xhr.onerror = () => {
        const err = new Error("Network error during upload") as Error & { retryable?: boolean };
        err.retryable = true;
        reject(err);
      };
      xhr.send(file);
    }).catch(async (e: Error & { retryable?: boolean }) => {
      if (e.retryable && left > 0) {
        await new Promise((r) => setTimeout(r, 1500 * (3 - left)));
        return attempt(left - 1);
      }
      throw e;
    });
  return attempt(opts.retries ?? 2);
}
