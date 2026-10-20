import { liveMode,supabase } from './supabase';
import { localGuideReply,normalizeGuideReply,type GuideMessage } from '../../supabase/functions/_shared/assistant-guide';
export {guideActions,type GuideAction,type GuideMessage,type GuideReply} from '../../supabase/functions/_shared/assistant-guide';
export async function askGuide(schoolId:string,messages:GuideMessage[]){
 if(!liveMode)return localGuideReply(messages.at(-1)?.text||'');
 if(!supabase)throw new Error('No hay conexión con MiCole.');
 const {data,error}=await supabase.functions.invoke('guide-assistant',{body:{schoolId,messages:messages.slice(-8)}});
 if(error||data?.error){let message=data?.error;try{message||=(await error?.context?.json())?.error}catch{}throw new Error(message||'No se pudo consultar al asistente.');}
 return normalizeGuideReply(data);
}
