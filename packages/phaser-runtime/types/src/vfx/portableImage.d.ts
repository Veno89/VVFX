export type PortableImageMimeType = "image/png" | "image/webp";
export type PortableImageInspection =
  | {
      ok: true;
      mimeType: PortableImageMimeType;
      byteLength: number;
      width: number;
      height: number;
    }
  | {
      ok: false;
      error: string;
    };
export declare function inspectPortableImageHeader(
  bytes: Uint8Array,
  mimeType: PortableImageMimeType,
  totalBytes: number,
  maximumBytes?: number,
): PortableImageInspection;
export declare function inspectPortableImageDataUrl(
  dataUrl: string,
  expectedMimeType?: PortableImageMimeType,
  maximumBytes?: number,
): PortableImageInspection;
