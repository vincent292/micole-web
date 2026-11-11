export interface SchoolCalendarDay {
  id: string;
  schoolId: string;
  date: string;
  label: string;
  kind: "holiday" | "suspension" | "school_day";
  source: "manual" | "national";
  sourceUrl: string;
  active: boolean;
  revision: number;
  announcedRevision: number;
}
export interface SchoolCalendarWorkspace {
  canManage: boolean;
  canPublish: boolean;
  days: SchoolCalendarDay[];
}
export interface BoliviaHoliday {
  date: string;
  label: string;
  countryCode: "BO";
  sourceUrl: string;
}
export const boliviaOfficial2026 =
  "https://mintrabajo.gob.bo/index.php/nota_prensa/la-paz-22/";
const official2026 = [
  ["01-01", "Año Nuevo"],
  ["01-23", "Día del Estado Plurinacional (trasladado)"],
  ["02-16", "Lunes de Carnaval"],
  ["02-17", "Martes de Carnaval"],
  ["04-03", "Viernes Santo"],
  ["05-01", "Día del Trabajo"],
  ["06-04", "Corpus Christi"],
  ["06-05", "Feriado nacional adicional a Corpus Christi"],
  ["06-22", "Año Nuevo Andino Amazónico Chaqueño (trasladado)"],
  ["08-06", "Independencia de Bolivia"],
  ["08-07", "Feriado nacional adicional a la Independencia"],
  ["11-02", "Todos Santos"],
  ["12-25", "Navidad"],
];
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export function normalizeBoliviaHolidays(
  value: unknown,
  year: number,
): BoliviaHoliday[] {
  if (
    !Number.isInteger(year) ||
    year < 2020 ||
    year > 2100 ||
    !Array.isArray(value) ||
    value.length > 100
  )
    throw new Error("No pudimos validar el calendario de Bolivia.");
  const rows: BoliviaHoliday[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object")
      throw new Error("Respuesta de feriados inválida.");
    const row = item as Record<string, unknown>;
    if (row.countryCode !== "BO")
      throw new Error("La fuente contiene feriados de otro país.");
    if (
      row.global !== true ||
      !Array.isArray(row.types) ||
      !row.types.includes("Public")
    )
      continue;
    if (
      typeof row.date !== "string" ||
      !new RegExp(`^${year}-\\d{2}-\\d{2}$`).test(row.date) ||
      !Number.isFinite(new Date(row.date + "T12:00:00Z").getTime()) ||
      new Date(row.date + "T12:00:00Z").toISOString().slice(0, 10) !== row.date
    )
      throw new Error("La fuente devolvió una fecha inválida.");
    const label = typeof row.localName === "string" ? row.localName.trim() : "";
    // The provider also labels some observances as public. Only recognized
    // national holidays are proposed; institutional/regional dates are manual.
    if (
      !/(ano nuevo|carnaval|viernes santo|trabajo|corpus|andino|patria|independencia|todos santos|difuntos|navidad|plurinacional)/.test(
        normalize(label),
      )
    )
      continue;
    if (!label || label.length > 160)
      throw new Error("Nombre de feriado inválido.");
    rows.push({
      date: row.date,
      label,
      countryCode: "BO",
      sourceUrl: `https://date.nager.at/api/v3/PublicHolidays/${year}/BO`,
    });
  }
  // The official 2026 agenda includes special moves and two extra holidays
  // absent from the provider. Do not turn its observances into school closures.
  if (year === 2026)
    return official2026.map(([date, label]) => ({
      date: `2026-${date}`,
      label,
      countryCode: "BO",
      sourceUrl: boliviaOfficial2026,
    }));
  if (!rows.length)
    throw new Error("La fuente no devolvió feriados nacionales de Bolivia.");
  return [...new Map(rows.map((row) => [row.date, row])).values()].sort(
    (a, b) => a.date.localeCompare(b.date),
  );
}
export async function fetchBoliviaHolidays(year: number) {
  if (!Number.isInteger(year) || year < 2020 || year > 2100)
    throw new Error("Selecciona una gestión válida.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(
      `https://date.nager.at/api/v3/PublicHolidays/${year}/BO`,
      { signal: controller.signal, credentials: "omit" },
    );
    if (!response.ok)
      throw new Error(
        "No se pudo actualizar la fuente de feriados. El calendario guardado sigue disponible.",
      );
    return normalizeBoliviaHolidays(await response.json(), year);
  } finally {
    clearTimeout(timer);
  }
}
