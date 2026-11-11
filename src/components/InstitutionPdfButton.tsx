import {useState} from 'react';
import {FileDown} from 'lucide-react';
import {Button} from './UI';
import type {School} from '../lib/types';
export function InstitutionPdfButton({school,name,build,label='Descargar PDF con membrete'}:{school?:School;name:string;build:(api:typeof import('../lib/institutionPdf'))=>Promise<Uint8Array>;label?:string}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 if(!school?.appearance)return null;
 return <><Button icon={FileDown} variant="secondary" disabled={busy} onClick={()=>{setBusy(true);setError('');void import('../lib/institutionPdf').then(async api=>api.downloadPdf(await build(api),name)).catch(e=>setError((e as Error).message)).finally(()=>setBusy(false));}}>{busy?'Preparando PDF…':label}</Button>{error&&<p className="message error" role="alert">{error}</p>}</>;
}
