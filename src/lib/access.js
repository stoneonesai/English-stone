import { timingSafeEqual } from "node:crypto";

export function decodeAccess(header) {
  if (!header) return "";
  try {
    return Buffer.from(String(header), "base64").toString("utf8");
  } catch {
    return "";
  }
}

export function passwordMatches(expected, got) {
  const left = Buffer.from(String(got ?? ""));
  const right = Buffer.from(String(expected ?? ""));
  if (left.length !== right.length) {
    timingSafeEqual(right, right);
    return false;
  }
  return timingSafeEqual(left, right);
}
