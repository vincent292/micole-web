import { expect, it } from "vitest";
import { attendanceWeekDates, attendanceWeekStart, moveAttendanceDay, sortAttendancePupils } from "../src/lib/attendanceWeek";
import { normalizeBoliviaHolidays } from "../src/lib/schoolCalendar";
import { attendanceMarks, type AttendanceWorkspace } from "../src/lib/studentAttendance";
it("un estudiante nuevo aparece sin marcar y ordenar no traslada la marca de otra persona", () => {
  const data={roster:[{student_id:'a',student_name:'Primero'},{student_id:'b',student_name:'Nuevo'}],records:[]} as unknown as AttendanceWorkspace;
  const draft=[{studentId:'a',status:'present' as const,note:'Presencia revisada'},{studentId:'retirado',status:'absent' as const,note:''}];
  expect(attendanceMarks(data,'2026-11-03',draft)).toEqual([{studentId:'a',status:'present',note:'Presencia revisada'},{studentId:'b',status:'',note:''}]);
  expect(draft).toHaveLength(2);
});
it("la semana comienza el lunes, conserva fechas y cruza meses o años sin reutilizar casillas", () => {
  expect(attendanceWeekStart("2026-11-08")).toBe("2026-11-02");
  expect(attendanceWeekDates("2026-04-01")).toEqual(["2026-03-30","2026-03-31","2026-04-01","2026-04-02","2026-04-03","2026-04-04","2026-04-05"]);
  expect(attendanceWeekDates("2027-01-01")).toEqual(["2026-12-28","2026-12-29","2026-12-30","2026-12-31","2027-01-01","2027-01-02","2027-01-03"]);
  expect(moveAttendanceDay("2028-02-28",1)).toBe("2028-02-29");
  expect(() => attendanceWeekDates("2026-02-30")).toThrow();
});
it("ordena por campos de apellidos o nombres sin adivinar apellidos compuestos", () => {
  const rows=[{student_id:'1',student_name:'Ana de la Cruz',first_name:'Ana',last_name:'de la Cruz'},{student_id:'2',student_name:'Zoé Álvarez',first_name:'Zoé',last_name:'Álvarez'}];
  expect(sortAttendancePupils(rows,'lastName').map(row=>row.student_id)).toEqual(['2','1']);
  expect(sortAttendancePupils(rows,'firstName').map(row=>row.student_id)).toEqual(['1','2']);
  expect(rows.map(row=>row.student_id)).toEqual(['1','2']);
});
it("solo admite Bolivia, descarta observancias y contrasta los traslados oficiales de 2026", () => {
  const api=[{countryCode:'BO',global:true,types:['Public'],date:'2026-02-02',localName:'Virgen de Candelaria'},{countryCode:'BO',global:true,types:['Public'],date:'2026-06-21',localName:'Año Nuevo Andino'}];
  const rows=normalizeBoliviaHolidays(api,2026),dates=rows.map(row=>row.date);
  expect(rows).toHaveLength(13);expect(dates).toContain('2026-01-23');expect(dates).toContain('2026-06-22');expect(dates).toContain('2026-06-05');expect(dates).toContain('2026-08-07');
  expect(dates).not.toContain('2026-01-22');expect(dates).not.toContain('2026-06-21');expect(dates).not.toContain('2026-02-02');expect(dates).not.toContain('2026-08-02');
  expect(()=>normalizeBoliviaHolidays([{...api[0],countryCode:'PE'}],2026)).toThrow(/otro país/);
  expect(()=>normalizeBoliviaHolidays([{...api[0],date:'2026-02-30'}],2026)).toThrow(/fecha/);
});
