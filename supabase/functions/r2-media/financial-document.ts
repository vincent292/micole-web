import { imageSignatureMatches } from "./pickup-image.ts";
export function financialDocumentMatches(bytes: Uint8Array, mime: string) {
  if (mime !== "application/pdf") return imageSignatureMatches(bytes, mime);
  return (
    bytes.length >= 12 &&
    new TextDecoder().decode(bytes.subarray(0, 8)).startsWith("%PDF-") &&
    new TextDecoder()
      .decode(bytes.subarray(Math.max(0, bytes.length - 2048)))
      .includes("%%EOF")
  );
}
