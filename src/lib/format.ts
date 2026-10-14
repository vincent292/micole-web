export function uid() {
  return crypto.randomUUID();
}
export const money = (value: number) =>
  `Bs ${value.toLocaleString("es-BO", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
export const dateLabel = (value: string) =>
  new Date(
    value.includes("T") ? value : `${value}T12:00:00-04:00`,
  ).toLocaleDateString("es-BO", {
    timeZone: "America/La_Paz",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
export const initials = (value: string) =>
  value
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] || "")
    .join("")
    .toUpperCase();
