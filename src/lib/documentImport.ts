import type { AdmissionQuestion } from "./admission";
export type DocumentKind = "form" | "calendar";
export interface ImportedEvent {
  title: string;
  date: string;
  endDate: string;
  description: string;
  source: string;
}
export interface DocumentDraft {
  title: string;
  warnings: string[];
  fields?: AdmissionQuestion[];
  instructions?: string;
  events?: ImportedEvent[];
  sourceHash: string;
  year: number;
  kind: DocumentKind;
}
export interface DocumentSource {
  name: string;
  mimeType: string;
  data: string;
}
export function validCalendarDate(value: string, year: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) !== year)
    return false;
  const day = new Date(`${value}T12:00:00Z`);
  return (
    !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === value
  );
}
export function calendarImportError(events: ImportedEvent[], year: number) {
  if (!events.length) return "Selecciona al menos una actividad.";
  if (events.length > 180) return "Puedes importar hasta 180 actividades.";
  for (const e of events) {
    if (!e.title.trim() || e.title.length > 200)
      return "Revisa los títulos de las actividades.";
    if (
      !validCalendarDate(e.date, year) ||
      (e.endDate && (!validCalendarDate(e.endDate, year) || e.endDate < e.date))
    )
      return "Corrige las fechas seleccionadas: deben pertenecer a la gestión y estar en orden.";
  }
  return "";
}
export function expandCalendarEvents<
  T extends { id: string; date: string; endDate?: string },
>(events: T[], month: string): T[] {
  return events.flatMap((e) => {
    if (!e.endDate || e.endDate <= e.date) return [e];
    const first = new Date(`${e.date}T12:00:00Z`),
      last = new Date(`${e.endDate}T12:00:00Z`);
    if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime()))
      return [e];
    const rows: T[] = [];
    for (
      let i = 0;
      i < 366 && first <= last;
      i++, first.setUTCDate(first.getUTCDate() + 1)
    ) {
      const date = first.toISOString().slice(0, 10);
      if (date.startsWith(month))
        rows.push({ ...e, id: `${e.id}:${date}`, date });
    }
    return rows;
  });
}
