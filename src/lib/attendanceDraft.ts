import { readDraft, writeDraft, removeDraft } from './sessionDraft';
import type { AttendanceMark } from './studentAttendance';
export interface AttendanceDraft {
  key: string;
  marks: AttendanceMark[];
  revision: number;
}
// The existing session-only cache is bounded, expires, and clears at logout.
// Serialize marks as a value (not storage): no pupil data is written to disk.
export function readAttendanceDraft(key: string): AttendanceDraft | null {
  const saved=readDraft<{marks:string;revision:number}>(key);
  if(!saved || typeof saved.marks!=='string' || !Number.isInteger(saved.revision))return null;
  try { return {key,marks:JSON.parse(saved.marks) as AttendanceMark[],revision:saved.revision}; }
  catch {removeDraft(key);return null;}
}
export function saveAttendanceDraft(key:string,draft:AttendanceDraft|null) {
  if(!draft){removeDraft(key);return;}
  if(draft.key!==key)throw new Error('El borrador pertenece a otra lista.');
  writeDraft(key,{marks:JSON.stringify(draft.marks),revision:draft.revision});
}
