import { useState, useCallback } from "react";

interface UploadResult {
  objectPath: string;
  publicUrl?: string;
}

interface UseUploadOptions {
  basePath?: string;
  getAuthToken?: () => string | null;
  onSuccess?: (result: UploadResult) => void;
  onError?: (error: Error) => void;
  onProgress?: (percent: number) => void;
}

export function useUpload(options: UseUploadOptions = {}) {
  const basePath = options.basePath ?? "/api/storage";
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  /**
   * Byte progress when the transport reports it, `null` when it cannot.
   * The Supabase storage client buffers the whole body, so there is no
   * percentage to show — reporting a made-up one told the user the upload was
   * 30% done the instant they dropped the file.
   */
  const [progress, setProgress] = useState<number | null>(0);

  const uploadFile = useCallback(
    async (file: File): Promise<UploadResult | null> => {
      setIsUploading(true);
      setError(null);
      setProgress(0);

      try {
        // Prefer Supabase router when configured (FormData → storage bucket).
        try {
          const mod = await import("@workspace/api-client-react");
          if (mod.hasSupabase) {
            const formData = new FormData();
            formData.append("file", file);
            setProgress(null);
            const result = await mod.customFetch<UploadResult>(`${basePath}/uploads`, {
              method: "POST",
              body: formData,
            });
            setProgress(100);
            options.onProgress?.(100);
            options.onSuccess?.(result);
            return result;
          }
        } catch (supabaseUploadErr) {
          // Fall through to legacy XHR if router/storage unavailable
          if (supabaseUploadErr instanceof Error && /storage_error|schema_missing|not_found/i.test(supabaseUploadErr.message)) {
            throw supabaseUploadErr;
          }
        }

        const token = options.getAuthToken?.();
        const formData = new FormData();
        formData.append("file", file);

        const result = await new Promise<UploadResult>((resolve, reject) => {
          const xhr = new XMLHttpRequest();

          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const pct = Math.round((e.loaded / e.total) * 100);
              setProgress(pct);
              options.onProgress?.(pct);
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                resolve(JSON.parse(xhr.responseText) as UploadResult);
              } catch {
                reject(new Error("Invalid response from upload server"));
              }
            } else {
              let message = "Upload failed";
              try {
                const body = JSON.parse(xhr.responseText) as { error?: string };
                if (body.error) message = body.error;
              } catch {
                // ignore parse error
              }
              reject(new Error(message));
            }
          };

          xhr.onerror = () => reject(new Error("Upload network error"));

          xhr.open("POST", `${basePath}/uploads`);
          if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
          xhr.send(formData);
        });

        setProgress(100);
        options.onSuccess?.(result);
        return result;
      } catch (err) {
        const uploadError = err instanceof Error ? err : new Error("Upload failed");
        setError(uploadError);
        options.onError?.(uploadError);
        return null;
      } finally {
        setIsUploading(false);
      }
    },
    [basePath, options]
  );

  return { uploadFile, isUploading, error, progress };
}
