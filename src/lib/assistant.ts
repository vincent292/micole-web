import { liveMode, supabase } from "./supabase";
import {
  normalizeGuideReply,
  type GuideMessage,
} from "../../supabase/functions/_shared/assistant-guide";
import { localAssistantReply, scopeGuideReply, type AssistantRole } from "../../supabase/functions/_shared/assistant-policy";
export { assistantName, allowedGuideActions, type AssistantRole } from "../../supabase/functions/_shared/assistant-policy";
export {
  guideActions,
  guideReviewNotice,
  type GuideAction,
  type GuideMessage,
  type GuideReply,
} from "../../supabase/functions/_shared/assistant-guide";
export interface AssistantContext { schoolId?:string;role:AssistantRole;userId:string;page:string }
export type AssistantReply=ReturnType<typeof normalizeGuideReply> & {pausedUntil?:string;mode?:"ia"|"guide"};
export interface AssistantProposal {id:string;schoolId:string;schoolName:string;kind:"publish_announcement";payload:{title:string;content:string;audience:"families"|"staff"|"all"};expiresAt:string}
const localPauses=new Map<string,string>();
function pauseKey(userId:string){return `micole-assistant-pause:${userId}`;}
function readLocalPause(userId:string){
 let until=localPauses.get(userId)||"";
 try{until=localStorage.getItem(pauseKey(userId))||until;}catch{}
 return Date.parse(until)>Date.now()?until:undefined;
}
export async function guideState(context:AssistantContext):Promise<{pausedUntil?:string;canPublish:boolean}> {
 if(!liveMode)return {pausedUntil:readLocalPause(context.userId),canPublish:context.role==="director"};
 if(!supabase)throw Error("No hay conexión con MiCole.");
 const {data,error}=await supabase.rpc("micole_assistant_state",{p_school_id:context.schoolId||null,p_role:context.role});
 if(error)throw Error("No se pudo comprobar la disponibilidad de Mica. Reintenta en unos momentos.");
 return data;
}
export async function askGuide(context:AssistantContext,messages:GuideMessage[]):Promise<AssistantReply> {
  if (!liveMode) {
    const pausedUntil=readLocalPause(context.userId);
    if(pausedUntil)return {answer:"Mica está en pausa. Tus paneles siguen disponibles.",steps:[],actions:[],pausedUntil};
    const text=messages.at(-1)?.text||"";
    const result=localAssistantReply(text,context.role);
    if(result.offTopic){
      const until=new Date(Date.now()+30*60*1000).toISOString();
      localPauses.set(context.userId,until);
      try{localStorage.setItem(pauseKey(context.userId),until);}catch{}
      return {...result,pausedUntil:until,mode:"guide"};
    }
    if(/[pP]repara|[rR]edacta|[bB]orrador/.test(text) && /comunicado|aviso|reuni[oó]n/.test(text) && ["director","teacher"].includes(context.role))result.draft={title:"Reunión de la comunidad",body:"Invitamos a las familias de [curso] a la reunión del [fecha]. Completa los detalles antes de publicar."};
    return {...result,mode:"guide"};
  }
  if (!supabase) throw new Error("No hay conexión con MiCole.");
  const { data, error } = await supabase.functions.invoke("guide-assistant", {
    body: { schoolId:context.schoolId||null,role:context.role,page:context.page,messages: messages.slice(-8) },
  });
  if (error || data?.error) {
    let message = data?.error;
    try {
      message ||= (await error?.context?.json())?.error;
    } catch {}
    throw new Error(message || "No se pudo consultar al asistente.");
  }
  return {...scopeGuideReply(normalizeGuideReply(data),context.role),pausedUntil:data.pausedUntil,mode:data.mode};
}
export async function prepareGuideAnnouncement(schoolId:string,title:string,content:string,audience:string):Promise<AssistantProposal>{
 if(!supabase)throw Error("No hay conexión con MiCole.");
 const {data,error}=await supabase.rpc("prepare_assistant_announcement",{p_school_id:schoolId,p_title:title,p_content:content,p_audience:audience});
 if(error)throw Error(error.message);
 return data;
}
export async function confirmGuideProposal(id:string,confirm:boolean):Promise<{status:"executed"|"cancelled";id?:string}>{
 if(!supabase)throw Error("No hay conexión con MiCole.");
 const {data,error}=await supabase.rpc("confirm_assistant_proposal",{p_proposal_id:id,p_confirm:confirm});
 if(error)throw Error(error.message);
 return data;
}
