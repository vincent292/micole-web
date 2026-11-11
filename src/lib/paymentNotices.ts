import type {AnnouncementView} from './announcements';
import type {NoticeApi} from './useAnnouncementInbox';
type Rpc = <T>(name:string, parameters:object)=>Promise<T>;
export function withFamilyPaymentAlerts(base:NoticeApi,schoolId:string|undefined,enabled:boolean,rpc:Rpc):NoticeApi {
  const isPayment=(id:string)=>id.startsWith('payment:');
  const paymentId=(id:string)=>id.slice('payment:'.length);
  return {
    ...base,
    pending:async()=>{
      const announcements=await base.pending();
      const health=(n:AnnouncementView)=>['health','pickup'].includes(n.category||'');
      const critical=announcements.filter(health);
      if(critical.length)return critical;
      let payments:AnnouncementView[]=[];
      try{payments=enabled&&schoolId?await rpc<AnnouncementView[]>('family_payment_alerts',{p_school_id:schoolId,p_include_read:false}):[];}
      catch(error){if(!announcements.length)throw error;}
      return [...payments,...announcements];
    },
    view:async id=>{
      if(!isPayment(id))return base.view(id);
      if(!enabled||!schoolId)throw Error('Este aviso de pago no está disponible en tu rol.');
      const items=await rpc<AnnouncementView[]>('family_payment_alerts',{p_school_id:schoolId,p_include_read:true});
      const value=items.find(n=>n.id===id);
      if(!value)throw Error('Este aviso de pago cambió. Revisa el estado de cuenta actualizado.');
      return value;
    },
    read:(id,agree)=>{
      if(!isPayment(id))return base.read(id,agree);
      if(!enabled||!schoolId)throw Error('Este aviso de pago no está disponible en tu rol.');
      return rpc('read_family_payment_alert',{p_school_id:schoolId,p_id:paymentId(id)});
    },
    report:id=>{if(isPayment(id))throw Error('Consulta el estado de cuenta en Pagos.');return base.report(id);},
    withdraw:id=>{if(isPayment(id))throw Error('El aviso se resuelve con el estado real de las cuotas.');return base.withdraw(id);},
  };
}
