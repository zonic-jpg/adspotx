import { useState, useCallback } from "react";

interface UploadResult {
  objectPath: string;
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
  const [progress, setProgress] = useState(0);

  const uploadFile = useCallback(
    async (file: File): Promise<UploadResult | null> => {
      setIsUploading(true);
      setError(null);
      setProgress(0);

      try {
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
