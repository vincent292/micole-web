import {useState} from 'react';
import {useAcademicPlanning} from './useAcademicPlanning';
import {type StudentKardex,type KardexKind} from './studentKardex';
const tables=['students','classrooms','enrollment_history','student_history_events','student_observations','student_attendance_sessions','student_attendance_corrections','subject_attendance','assessment_scores','report_cards','student_documents','school_receipts','care_records','family_requests','daily_entries'];
export function useStudentKardex(student:string,school?:string){
 const [year,setYear]=useState(''),[kind,setKind]=useState<KardexKind>('all'),[cursors,setCursors]=useState<NonNullable<StudentKardex['next']>[]>([]);
 const feed=useAcademicPlanning<StudentKardex>('student_kardex',{p_student:student,p_from:year?`${year}-01-01`:null,p_to:year?`${year}-12-31`:null,p_kind:kind,p_cursor:cursors.at(-1)||null,p_limit:40},school,tables);
 return {...feed,year,kind,page:cursors.length+1,setYear:(value:string)=>{setYear(value);setCursors([]);},setKind:(value:KardexKind)=>{setKind(value);setCursors([]);},next:()=>{if(feed.data?.next)setCursors(old=>[...old,feed.data!.next!]);},previous:()=>setCursors(old=>old.slice(0,-1)),reload:()=>{setCursors([]);feed.refresh();}};
}
