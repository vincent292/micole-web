import {afterEach,expect,it,vi} from 'vitest';
import {draftKey,clearDrafts} from '../src/lib/sessionDraft';
import {readAttendanceDraft,saveAttendanceDraft} from '../src/lib/attendanceDraft';
afterEach(()=>{clearDrafts();vi.restoreAllMocks();});
it('restaura marcas y revisión al desmontar sin mezclar usuario, sede o fecha',()=>{
 const key=draftKey('u1','teacher','s1','c1:2026-10-23','student-attendance');
 const value={key,revision:4,marks:[{studentId:'a1',status:'absent' as const,note:'Permiso pendiente'}]};
 saveAttendanceDraft(key,value);
 value.marks[0].note='Cambió el objeto original';
 expect(readAttendanceDraft(key)?.marks[0].note).toBe('Permiso pendiente');
 expect(readAttendanceDraft(key)?.revision).toBe(4);
 for(const other of [draftKey('u2','teacher','s1','c1:2026-10-23','student-attendance'),draftKey('u1','teacher','s2','c1:2026-10-23','student-attendance'),draftKey('u1','teacher','s1','c1:2026-10-24','student-attendance')])expect(readAttendanceDraft(other)).toBeNull();
 saveAttendanceDraft(key,null);expect(readAttendanceDraft(key)).toBeNull();
});
it('descarta los borradores al cerrar sesión y al vencer',()=>{
 const value={key:'session-test',revision:0,marks:[]};
 saveAttendanceDraft(value.key,value);clearDrafts();expect(readAttendanceDraft(value.key)).toBeNull();
 saveAttendanceDraft(value.key,value);vi.spyOn(Date,'now').mockReturnValue(Date.now()+3*60*60*1000);expect(readAttendanceDraft(value.key)).toBeNull();
});
