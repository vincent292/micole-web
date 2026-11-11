import { demoRole } from "./demo-config";
import { readDemoData, writeDemoData } from "./demo";
import type { SchoolDay } from "./attendanceWeek";
import type { SchoolCalendarDay } from "./schoolCalendar";
const key = "micole_demo_school_calendar_v1";
function read(): SchoolCalendarDay[] {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}
const commit = (rows: SchoolCalendarDay[]) =>
  localStorage.setItem(key, JSON.stringify(rows));
export const calendarOperations = [
  "school_calendar_workspace",
  "save_school_calendar_day",
  "import_bolivia_holidays",
  "publish_school_calendar_notice",
];
export function demoSchoolDay(
  school: string,
  date: string,
  weekdays: number[] = [1, 2, 3, 4, 5],
): SchoolDay {
  const special = read().find(
    (row) => row.schoolId === school && row.date === date && row.active,
  );
  const scheduled = weekdays.includes(
    new Date(date + "T12:00:00Z").getUTCDay() || 7,
  );
  return {
    date,
    isSchoolDay: special ? special.kind === "school_day" : scheduled,
    kind: special?.kind || "schedule",
    label:
      special?.label ||
      (scheduled ? "Día de clases" : "Sin clases según el horario del aula"),
    sourceUrl: special?.sourceUrl || "",
  };
}
export async function demoSchoolCalendarRpc(method: string, args: object) {
  const p = args as Record<string, any>,
    rows = read(),
    manager = demoRole() === "director",
    data = readDemoData();
  const day = rows.find((row) => row.id === p.p_id);
  const school = p.p_school_id || day?.schoolId;
  if (!data.schools.some((row) => row.id === school))
    throw new Error("Selecciona una sede válida.");
  if (method === "school_calendar_workspace")
    return {
      canManage: manager,
      canPublish: manager,
      days: rows
        .filter(
          (row) =>
            row.schoolId === school &&
            Number(row.date.slice(0, 4)) === p.p_year,
        )
        .sort((a, b) => a.date.localeCompare(b.date)),
    };
  if (!manager)
    throw new Error(
      "Solo Dirección o Secretaría autorizada puede actualizar el calendario.",
    );
  if (method === "save_school_calendar_day") {
    const v = p.p_values,
      old = rows.find((row) => row.schoolId === school && row.date === v.date);
    if (old && old.revision !== v.revision)
      throw new Error("El calendario cambió. Actualiza antes de guardar.");
    if (
      !v.label?.trim() ||
      !["holiday", "suspension", "school_day"].includes(v.kind)
    )
      throw new Error("Revisa el día.");
    const next: SchoolCalendarDay = {
      id: old?.id || crypto.randomUUID(),
      schoolId: school,
      date: v.date,
      label: v.label.trim(),
      kind: v.kind,
      active: v.active !== false,
      source: "manual",
      sourceUrl: v.sourceUrl || "",
      revision: (old?.revision || 0) + 1,
      announcedRevision: old?.announcedRevision || 0,
    };
    commit([...rows.filter((row) => row.id !== next.id), next]);
    return next.id;
  }
  if (method === "import_bolivia_holidays") {
    let added = 0,
      preserved = 0;
    for (const item of p.p_days) {
      if (
        item.countryCode !== "BO" ||
        Number(item.date.slice(0, 4)) !== p.p_year
      )
        throw new Error(
          "Solo se aceptan feriados de Bolivia de la gestión elegida.",
        );
      const old = rows.find(
        (row) => row.schoolId === school && row.date === item.date,
      );
      if (old) {
        if (old.source === "manual") preserved++;
        continue;
      }
      rows.push({
        id: crypto.randomUUID(),
        schoolId: school,
        date: item.date,
        label: item.label,
        kind: "holiday",
        active: true,
        source: "national",
        sourceUrl: item.sourceUrl,
        revision: 1,
        announcedRevision: 0,
      });
      added++;
    }
    commit(rows);
    return { added, updated: 0, manualPreserved: preserved };
  }
  if (!day || !day.active || day.revision !== p.p_revision)
    throw new Error("Actualiza el calendario antes de publicar.");
  const noticeId = `calendar-${day.id}-${day.revision}`;
  if (data.announcements.some((row) => row.id === noticeId)) return noticeId;
  data.announcements.push({
    id: noticeId,
    schoolId: school,
    title: day.label + " · " + day.date,
    content: p.p_content,
    audience: "all",
    createdAt: new Date().toISOString(),
    createdBy: "demo-director",
  });
  writeDemoData(data, true);
  day.announcedRevision = day.revision;
  commit(rows);
  return noticeId;
}
