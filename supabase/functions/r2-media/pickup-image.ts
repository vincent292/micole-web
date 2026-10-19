export function imageSignatureMatches(bytes: Uint8Array, mime: string) {
  if (mime === "image/jpeg")
    return (
      bytes.length >= 4 &&
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes[2] === 255
    );
  if (mime === "image/png")
    return (
      bytes.length >= 8 &&
      [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)
    );
  if (mime === "image/webp")
    return (
      bytes.length >= 12 &&
      [82, 73, 70, 70].every((v, i) => bytes[i] === v) &&
      [87, 69, 66, 80].every((v, i) => bytes[i + 8] === v)
    );
  return false;
}
