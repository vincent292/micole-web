import { useEffect, useRef, useState } from "react";
import { Bot, Send, X, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "../components/UI";
import { askGuide, guideActions, guideState, allowedGuideActions, prepareGuideAnnouncement, confirmGuideProposal, type AssistantContext, type AssistantProposal, type AssistantReply, type GuideAction, type GuideMessage } from "../lib/assistant";
import { liveMode } from "../lib/supabase";
import "../styles/assistant.css";

const audienceNames={families:"Todas las familias de esta sede",staff:"Todo el personal de esta sede",all:"Toda la comunidad de esta sede"};
function DraftEditor({draft,canPublish,disabled,onPrepare}:{draft:{title:string;body:string};canPublish:boolean;disabled:boolean;onPrepare:(title:string,body:string,audience:string)=>Promise<void>}) {
 const [title,setTitle]=useState(draft.title),[body,setBody]=useState(draft.body),[audience,setAudience]=useState("");
 return <section className="assistant-draft" aria-label="Borrador pendiente de revisión">
  <b>Borrador · revisa y completa</b>
  <label className="field"><span>Título del borrador</span><input value={title} onChange={e=>setTitle(e.target.value)} maxLength={160} disabled={disabled}/></label>
  <label className="field"><span>Texto del borrador</span><textarea aria-label="Texto del borrador" value={body} onChange={e=>setBody(e.target.value)} maxLength={6000} rows={4} disabled={disabled}/></label>
  <small>El texto aún no está guardado ni publicado. Completa los datos entre corchetes.</small>
  {canPublish && <>
   <label className="field"><span>Destinatarios del comunicado</span><select aria-label="Destinatarios del comunicado" value={audience} onChange={e=>setAudience(e.target.value)} disabled={disabled}><option value="">Selecciona destinatarios</option>{Object.entries(audienceNames).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
   <Button variant="secondary" disabled={disabled||!audience||!title.trim()||!body.trim()||/\[[^\]]+\]/.test(title+body)} onClick={()=>void onPrepare(title,body,audience)}>Revisar publicación</Button>
  </>}
 </section>;
}

export function DirectorAssistant({context,schoolName,availableActions,onAction,onRefresh,onPublishDemo}:{
 context:AssistantContext;schoolName?:string;availableActions:GuideAction[];onAction:(action:GuideAction)=>void;
 onRefresh:()=>Promise<void>;onPublishDemo:(proposal:AssistantProposal)=>Promise<void>;
}) {
 const [open,setOpen]=useState(false),[question,setQuestion]=useState(""),[history,setHistory]=useState<GuideMessage[]>([]),
 [answers,setAnswers]=useState<{question:string;reply:AssistantReply}[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(""),
 [statusReady,setStatusReady]=useState(false),[pausedUntil,setPausedUntil]=useState<string>(),[now,setNow]=useState(Date.now()),
 [pending,setPending]=useState<{action:GuideAction|"refresh"}|{proposal:AssistantProposal}>(),[notice,setNotice]=useState("");
 const end=useRef<HTMLDivElement>(null),alive=useRef(true),sending=useRef(false),compose=useRef<HTMLTextAreaElement>(null);
 const remaining=Math.max(0,Math.ceil((Date.parse(pausedUntil||"")-now)/1000))||0;
 const paused=remaining>0;
 const disabled=busy||paused||!statusReady;
 const actions=allowedGuideActions(context.role).filter(id=>availableActions.includes(id));
 async function refreshStatus(){
  try{const state=await guideState(context);if(alive.current){setPausedUntil(state.pausedUntil);setNow(Date.now());setStatusReady(true);}}
  catch(e){if(alive.current){setStatusReady(false);setError((e as Error).message);}}
 }
 useEffect(()=>{
  alive.current=true;void refreshStatus();
  const check=()=>void refreshStatus();
  window.addEventListener("focus",check);window.addEventListener("storage",check);
  return ()=>{alive.current=false;window.removeEventListener("focus",check);window.removeEventListener("storage",check);};
 },[]);
 useEffect(()=>{
  if(!open)return;
  const timer=setInterval(()=>setNow(Date.now()),1000);
  const escape=(e:KeyboardEvent)=>{if(e.key==="Escape"){setOpen(false);requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>('button[aria-label="Abrir MiCole IA"]')?.focus());}};
  window.addEventListener("keydown",escape);compose.current?.focus();
  return ()=>{clearInterval(timer);window.removeEventListener("keydown",escape);};
 },[open]);
 useEffect(()=>{end.current?.scrollIntoView({block:"nearest"});},[answers,busy,pending,open]);
 async function ask(text=question){
  if(!text.trim()||disabled||sending.current)return;
  sending.current=true;setBusy(true);setError("");setNotice("");
  const next=[...history,{role:"user" as const,text:text.trim()}].slice(-8);
  try{
   const reply=await askGuide(context,next);if(!alive.current)return;
   setPausedUntil(reply.pausedUntil);setNow(Date.now());
   setHistory([...next,{role:"model" as const,text:(reply.answer+"\n"+reply.steps.join("\n")).slice(0,3000)}].slice(-6));
   setAnswers(old=>[...old.slice(-11),{question:text,reply}]);setQuestion("");
  }catch(e){if(alive.current)setError((e as Error).message);}
  finally{sending.current=false;if(alive.current)setBusy(false);}
 }
 async function prepare(title:string,body:string,audience:string){
  if(disabled||sending.current||pending||!context.schoolId||context.role!=="director")return;
  sending.current=true;setBusy(true);setError("");setNotice("");
  try{
   const proposal=liveMode?await prepareGuideAnnouncement(context.schoolId,title,body,audience):{id:crypto.randomUUID(),schoolId:context.schoolId,schoolName:schoolName||"Sede de demostración",kind:"publish_announcement" as const,payload:{title,content:body,audience:audience as keyof typeof audienceNames},expiresAt:new Date(Date.now()+10*60*1000).toISOString()};
   if(alive.current)setPending({proposal});
  }catch(e){if(alive.current)setError((e as Error).message);}
  finally{sending.current=false;if(alive.current)setBusy(false);}
 }
 async function confirm(accept:boolean){
  if(!pending||busy||sending.current||accept&&disabled)return;
  sending.current=true;setBusy(true);setError("");
  try{
   if("proposal" in pending){
    if(liveMode){const result=await confirmGuideProposal(pending.proposal.id,accept);if(accept&&result.status!=="executed")throw Error("La publicación no se completó.");}
    else if(accept)await onPublishDemo(pending.proposal);
    if(alive.current){setPending(undefined);setNotice(accept?"Comunicado publicado con tu confirmación.":"Propuesta cancelada. No se publicó el comunicado.");}
    // Do not mislabel a successful publication if a later data refresh fails.
    if(accept)await onRefresh();
   }else{
    if(accept){if(pending.action==="refresh"){await onRefresh();if(alive.current)setNotice("Se solicitó actualizar los datos. Revisa el panel; si el error continúa, descríbemelo.");}else{onAction(pending.action);setOpen(false);}}
    if(alive.current)setPending(undefined);
   }
  }catch(e){if(alive.current)setError((e as Error).message);}
  finally{sending.current=false;if(alive.current)setBusy(false);}
 }
 const suggestions=context.role==="director"?["¿Cómo inscribo a un estudiante?","Prepara un borrador de comunicado de reunión para las familias.","No carga una pantalla de MiCole, ¿qué hago?"]:context.role==="guardian"?["¿Cómo veo los pagos en MiCole?","¿Cómo autorizo una recogida?","No puedo ingresar a MiCole"]:context.role==="superadmin"?["¿Cómo gestiono las instituciones en MiCole?","No carga una pantalla de MiCole, ¿qué hago?"]:context.role==="scheduler"?["¿Cómo preparo un horario de clases en MiCole?"]: ["¿Cómo uso las tareas de MiCole?","No carga una pantalla de MiCole, ¿qué hago?"];
 return <div className="director-assistant">
  {!open?<Button icon={Bot} onClick={()=>{setOpen(true);void refreshStatus();}} aria-label="Abrir MiCole IA">MiCole IA <span className="assistant-launcher-name">· Mica</span></Button>:
   <section className="assistant-window" role="dialog" aria-label="Mica · MiCole IA">
    <header><div><b><Bot size={20}/> Mica · MiCole IA</b><small>Ayuda con tu panel{!liveMode?" · guía de demostración":""}</small></div><Button variant="ghost" aria-label="Cerrar asistente" onClick={()=>setOpen(false)}><X size={20}/></Button></header>
    <div className="assistant-conversation" aria-live="polite">
     <p>Te ayudo a usar MiCole y revisar errores. Cuéntame qué intentas hacer y en qué pantalla estás.</p>
     <p className="assistant-review-note"><ShieldCheck size={16}/> Solo consultas de MiCole. Una consulta ajena pausa este chat por 30 minutos. Antes de ejecutar una acción verás los detalles y tendrás que confirmarla.</p>
     <small>Evita incluir datos de alumnos, contraseñas o claves. Si no conozco la solución, te lo diré.</small>
     {!answers.length&&<div className="assistant-suggestions">{suggestions.map(q=><Button key={q} variant="secondary" disabled={disabled||!!pending} onClick={()=>void ask(q)}>{q}</Button>)}</div>}
     {answers.map((entry,i)=><article key={i}>
      <p className="assistant-question">{entry.question}</p><p className="preserve-lines">{entry.reply.answer}</p>
      {!!entry.reply.steps.length&&<ol>{entry.reply.steps.map((s,n)=><li key={n}>{s}</li>)}</ol>}
      {entry.reply.mode==="guide"&&<small>Guía de MiCole · orientación disponible sin respuesta generada.</small>}
      {entry.reply.draft&&<DraftEditor draft={entry.reply.draft} canPublish={context.role==="director"} disabled={disabled||!!pending} onPrepare={prepare}/>}
      <div className="assistant-actions">{entry.reply.actions.filter(id=>actions.includes(id)).map(id=><Button key={id} variant="secondary" disabled={disabled||!!pending} onClick={()=>setPending({action:id})}>{guideActions[id].label}</Button>)}</div>
     </article>)}
     {busy&&<p role="status">Procesando tu solicitud…</p>}
     {notice&&<p className="message success" role="status">{notice}</p>}
     {error&&<p className="message error" role="alert">{error}</p>}
     {!statusReady&&<Button variant="secondary" onClick={()=>{setError("");void refreshStatus();}}>Comprobar disponibilidad</Button>}
     <div ref={end}/>
    </div>
    {pending&&<section className="assistant-confirmation" aria-label="Confirmar acción">
     <b>Revisa antes de confirmar</b>
     {"proposal" in pending?<><p>Publicar comunicado en <strong>{pending.proposal.schoolName}</strong></p><p>{audienceNames[pending.proposal.payload.audience]}</p><b>{pending.proposal.payload.title}</b><p className="preserve-lines assistant-confirmation-content">{pending.proposal.payload.content}</p><small>Se publicará y notificará desde MiCole. No solicita confirmación de lectura ni recordatorios. La propuesta vence en 10 minutos.</small></>:<p>{pending.action==="refresh"?"Volver a consultar los datos del panel. Conserva abiertos los formularios sin guardar.":`Abrir ${guideActions[pending.action].label}.`}</p>}
     <div className="assistant-actions"><Button disabled={disabled||"proposal" in pending&&Date.parse(pending.proposal.expiresAt)<=now} onClick={()=>void confirm(true)}>{"proposal" in pending?"Sí, publicar comunicado":"Sí, continuar"}</Button><Button variant="secondary" disabled={busy} onClick={()=>void confirm(false)}>Cancelar</Button></div>
    </section>}
    {paused&&<div className="assistant-pause" role="status">Chat en pausa · {Math.floor(remaining/60)}:{String(remaining%60).padStart(2,"0")} restantes. Puedes seguir usando MiCole.</div>}
    <form onSubmit={e=>{e.preventDefault();void ask();}}>
     <label className="field"><span>Tu pregunta sobre MiCole</span><textarea ref={compose} value={question} onChange={e=>setQuestion(e.target.value)} maxLength={3000} rows={2} required disabled={disabled||!!pending} placeholder="Describe la pantalla o el error…"/></label>
     <div className="assistant-compose"><Button variant="ghost" disabled={busy||!!pending} onClick={()=>{setAnswers([]);setHistory([]);setError("");setNotice("");}}>Nueva conversación</Button><Button type="submit" icon={Send} disabled={disabled||!!pending||!question.trim()}>Enviar</Button></div>
     <Button variant="ghost" icon={RefreshCw} disabled={disabled||!!pending} onClick={()=>setPending({action:"refresh"})}>Actualizar datos del panel</Button>
    </form>
   </section>}
 </div>;
}
