/**
 * Client-only EXIF parser. Bytes flow browser → S3 directly via the presigned
 * URL we already have for the preview body — no new server route. We Range-GET
 * the first 128 KB (every JPEG/HEIC/AVIF metadata segment lives in the head)
 * and hand the buffer to exifr. The dynamic import keeps the ~24 KB exifr
 * bundle out of the main chunk; it loads only the first time an image preview
 * opens with EXIF parsing enabled.
 *
 * Returned shape is exifr's native loose object — we read fields by name in
 * the section component rather than re-normalizing here.
 */

import { useQuery } from "@tanstack/react-query";

const RANGE_BYTES = 128 * 1024;

export interface ImageExif {
  Make?: string;
  Model?: string;
  LensModel?: string;
  ISO?: number;
  ExposureTime?: number;
  FNumber?: number;
  FocalLength?: number;
  DateTimeOriginal?: Date;
  latitude?: number;
  longitude?: number;
  ExifImageWidth?: number;
  ExifImageHeight?: number;
  ImageWidth?: number;
  ImageHeight?: number;
  PixelXDimension?: number;
  PixelYDimension?: number;
  [key: string]: unknown;
}

export const exifKeys = {
  parsed: (url: string) => ["exif", url] as const,
};

export function useImageExif(url: string | undefined) {
  return useQuery<ImageExif | null, Error>({
    queryKey: url ? exifKeys.parsed(url) : ["exif", "none"],
    queryFn: async () => {
      if (!url) throw new Error("no url");
      const res = await fetch(url, {
        headers: { Range: `bytes=0-${RANGE_BYTES - 1}` },
      });
      // S3 returns 206 for a satisfied Range; some backends ignore the
      // header and return the whole object as 200. Both are fine — exifr only
      // reads what it needs from the start of the buffer.
      if (!res.ok && res.status !== 206) {
        throw new Error(`HTTP ${res.status}`);
      }
      const buf = await res.arrayBuffer();
      const { parse } = await import("exifr");
      const data = (await parse(buf)) as ImageExif | undefined;
      return data ?? null;
    },
    enabled: !!url,
    // EXIF for a key never changes for the lifetime of a presigned URL.
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    // A missing EXIF block isn't a real error — don't burn retry budget on it.
    retry: false,
  });
}
