import {useEffect,useState} from 'react';
import {readAttendanceDraft,saveAttendanceDraft,type AttendanceDraft} from './attendanceDraft';
export function useAttendanceDraft(key:string,confirmed:boolean) {
 const [,render]=useState(0);
 useEffect(()=>{if(confirmed)saveAttendanceDraft(key,null);},[key,confirmed]);
 const draft=confirmed?null:readAttendanceDraft(key);
 function setDraft(value:AttendanceDraft|null) {
  saveAttendanceDraft(key,value);
  render(n=>n+1);
 }
 return [draft,setDraft] as const;
}
