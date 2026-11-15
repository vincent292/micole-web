import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, Bot, CircleHelp, MessageSquare, Plus, RefreshCw, Send, UserRound, X } from 'lucide-react';
import { Button, Empty, Field, SearchBox, SectionTitle } from '../components/UI';
import { WhatsAppConnection } from './WhatsAppConnection';
import { useWhatsAppWorkspace, formatSavedWhatsAppReply, whatsAppRequest, whatsAppStages, whatsAppMessageStatus, whatsAppWindowOpen, type WhatsAppConversation, type WhatsAppSettings, type WhatsAppWorkspace } from '../lib/whatsapp';
import type { PageProps } from './Pages';
import '../styles/whatsapp.css';
const date = (value: string) => new Date(value).toLocaleString('es-BO', { dateStyle: 'short', timeStyle: 'short' });
export function SchoolWhatsApp(p: PageProps) {
  const [conversationId, setConversationId] = useState(''), [tab, setTab] = useState('inbox'), [search, setSearch] = useState('');
  const feed = useWhatsAppWorkspace(p.school?.id || '', conversationId), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const data = feed.data, contact = data?.conversations.find(c => c.id === conversationId), schoolId = p.school?.id || '';
  const [drafts, setDrafts] = useState<Record<string,string>>({});
  const request = useRef<{ text: string; conversationId: string; id: string } | undefined>(undefined);
  async function change(data: object) {
    setBusy(true); setError('');
    try { await whatsAppRequest(schoolId, 'conversation', { conversationId, ...data }); feed.refresh(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function send(event: FormEvent) {
    event.preventDefault(); const text = (drafts[conversationId] || '').trim(); if (!text || busy) return;
    const target = conversationId;
    if (request.current?.text !== text || request.current.conversationId !== target) request.current = { text, conversationId: target, id: crypto.randomUUID() };
    setBusy(true); setError('');
    try { await whatsAppRequest(schoolId, 'send', { conversationId: target, body: text, requestId: request.current.id });
      setDrafts(d => ({ ...d, [target]: d[target]?.trim() === text ? '' : d[target] })); request.current = undefined; feed.refresh();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  function choose(id: string) { setConversationId(id); setError(''); }
  return <section className="whatsapp-workspace">
    <div className="wa-toolbar"><div><h2>Atención por WhatsApp</h2><p>{p.school?.name} · {p.school?.siteName || 'Sede principal'}</p></div><Button variant="secondary" icon={RefreshCw} onClick={feed.refresh}>Actualizar</Button></div>
    <nav className="focus-tabs" aria-label="Herramientas de WhatsApp">{[['inbox','Conversaciones'],['connection','Conexión'],['settings','Bot y respuestas']].map(([key,label]) => <button key={key} type="button" aria-current={tab===key?'page':undefined} onClick={()=>setTab(key)}>{label}</button>)}</nav>
    {(feed.error || error) && <div className="message error" role="alert"><span>{error || feed.error}</span><Button variant="ghost" onClick={feed.refresh}>Reintentar</Button></div>}
    {feed.loading && !data && <div className="panel" role="status">Cargando la atención de tu institución…</div>}
    {data && <>
      <div className="wa-summary"><span><b>{data.connection?.status === 'connected' ? data.connection.display_phone : 'WhatsApp sin conexión activa'}</b><small>{data.connection?.status === 'connected' ? 'Número de esta sede' : 'Completa la conexión desde la pestaña Conexión'}</small></span><span className="wa-mode"><Bot size={17} aria-hidden="true"/>{data.settings.mode === 'automatic' ? 'Respuestas automáticas activadas' : 'Atención manual'}</span></div>
      {tab==='connection' && <WhatsAppConnection schoolId={schoolId} data={data} onChanged={feed.refresh}/>}
      {tab==='settings' && (data.canConnect ? <WhatsAppSettingsEditor schoolId={schoolId} initial={data.settings} onSaved={feed.refresh}/> : <Empty title="Configuración de Dirección" subtitle="Puedes atender conversaciones; Dirección administra la conexión y las respuestas automáticas."/>)}
      {tab==='inbox' && <div className="wa-grid" data-selected={!!contact}>
        <section className="panel wa-contacts" aria-label="Contactos de WhatsApp">
          <SearchBox value={search} onChange={setSearch} placeholder="Buscar contacto o número"/>
          <p className="wa-list-note">Últimas 100 conversaciones de esta sede</p>
          <div className="wa-contact-list">{data.conversations.filter(c => `${c.contact_name} ${c.contact_key}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(c => <button className={`wa-contact ${c.id===conversationId?'selected':''}`} type="button" key={c.id} aria-pressed={c.id===conversationId} onClick={()=>choose(c.id)}>
            <span className="wa-contact-avatar"><UserRound size={20} aria-hidden="true"/></span><span><strong>{c.contact_name || c.contact_key}</strong><small>{c.contact_key}</small><small>{whatsAppStages[c.stage]} · {date(c.last_message_at)}</small></span>{c.unread>0 && <span className="wa-unread" aria-label={`${c.unread} sin leer`}>{c.unread}</span>}
          </button>)}</div>
          {!data.conversations.length && <div className="wa-empty"><MessageSquare size={28} aria-hidden="true"/><h3>Tu próxima conversación empieza aquí</h3><p>Conecta el número y recibe una consulta por WhatsApp. Los nuevos contactos aparecerán en esta bandeja.</p><Button variant="secondary" onClick={()=>setTab('connection')}>Revisar conexión</Button></div>}
          {!!data.conversations.length && !data.conversations.some(c=>`${c.contact_name} ${c.contact_key}`.toLowerCase().includes(search.toLowerCase())) && <p>No hay contactos con esa búsqueda.</p>}
        </section>
        <section className="panel wa-chat" aria-label="Conversación seleccionada">
          {contact ? <>
            <Button variant="ghost" icon={ArrowLeft} className="wa-back" onClick={()=>choose('')}>Volver a contactos</Button>
            <header className="wa-chat-header"><div><h2>{contact.contact_name || contact.contact_key}</h2><p>{contact.contact_key}</p><span className="wa-attention">{data.settings.mode==='automatic' && !contact.human ? 'Bot de la institución activo' : 'Atención humana'}</span></div><div className="wa-actions"><Button variant="secondary" disabled={busy || contact.human && data.settings.mode!=='automatic'} onClick={()=>void change({human:!contact.human})}>{contact.human?'Devolver al bot':'Tomar atención'}</Button>{contact.unread>0 && <Button variant="ghost" disabled={busy} onClick={()=>void change({read:true})}>Marcar leído</Button>}</div></header>
            <WhatsAppMessages contact={contact} data={data}/>
            {!whatsAppWindowOpen(contact.last_customer_at) && <p className="message warn">La ventana de 24 horas terminó. Espera un mensaje nuevo del contacto para responder con texto libre.</p>}
            <form onSubmit={event=>void send(event)} className="wa-compose"><label htmlFor="wa-draft">Responder al contacto</label><textarea id="wa-draft" maxLength={4000} rows={3} value={drafts[conversationId] || ''} onChange={e=>setDrafts(d=>({...d,[conversationId]:e.target.value}))} placeholder="Escribe tu respuesta…"/><div className="wa-compose-actions"><small>Al enviar, esta conversación pasa a atención humana.</small><Button type="submit" icon={Send} disabled={busy || !drafts[conversationId]?.trim() || !whatsAppWindowOpen(contact.last_customer_at) || data.connection?.status!=='connected'}>{busy?'Guardando…':'Enviar respuesta'}</Button></div></form>
            {!!data.settings.quick_replies.length && <details className="wa-saved-replies"><summary>Usar una respuesta guardada</summary><div className="wa-actions">{data.settings.quick_replies.filter(r=>r.enabled!==false).map((r,i)=><Button key={r.id || i} variant="secondary" onClick={()=>setDrafts(d=>({...d,[conversationId]:p.school?formatSavedWhatsAppReply(r.body,p.school,data.settings):r.body}))}>{r.title}</Button>)}</div><small>Los datos de esta sede se completan automáticamente. Revisa la respuesta antes de enviarla.</small></details>}
            <ContactDetails key={contact.id} contact={contact} busy={busy} onSave={change}/>
          </> : <div className="wa-empty"><CircleHelp size={32} aria-hidden="true"/><h2>Elige una conversación</h2><p>Consulta el historial, toma la atención y acompaña cada solicitud hasta su siguiente paso.</p></div>}
        </section>
      </div>}
    </>}
  </section>;
}
function WhatsAppMessages({contact,data}:{contact:WhatsAppConversation;data:WhatsAppWorkspace}) {
  const scroller=useRef<HTMLDivElement>(null),last=useRef('');
  useEffect(()=>{const node=scroller.current;if(!node)return;const nearBottom=node.scrollHeight-node.clientHeight-node.scrollTop<160;if(last.current!==contact.id||nearBottom)node.scrollTop=node.scrollHeight;last.current=contact.id;},[contact.id,data.messages]);
  return <div className="wa-messages" ref={scroller} role="log" aria-label="Mensajes de la conversación" aria-live="polite" aria-relevant="additions text">
    <p className="wa-list-note">Se muestran los últimos 100 mensajes; los anteriores se conservan.</p>
    {data.messages.map(m=><article className={`wa-message ${m.direction==='out'?'wa-out':'wa-in'}`} key={m.id}><small>{m.source==='bot'?'Bot de la institución':m.source==='app'?'WhatsApp Business':m.source==='staff'?'Equipo de la institución':'Contacto'}</small><p>{m.body}</p><footer><time dateTime={m.created_at}>{date(m.created_at)}</time><span>{whatsAppMessageStatus[m.status] || m.status}</span></footer></article>)}
  </div>;
}
function ContactDetails({contact,busy,onSave}:{contact:WhatsAppConversation;busy:boolean;onSave:(data:object)=>Promise<void>}) {
  const [stage,setStage]=useState(contact.stage),[notes,setNotes]=useState(contact.notes);
  return <details className="wa-contact-details"><summary>Seguimiento del contacto</summary><form onSubmit={e=>{e.preventDefault();void onSave({stage,notes});}}><Field label="Etapa de atención" name="wa-stage"><select value={stage} onChange={e=>setStage(e.target.value as WhatsAppConversation['stage'])}>{Object.entries(whatsAppStages).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></Field><Field label="Notas internas" name="wa-notes"><textarea rows={3} maxLength={4000} value={notes} onChange={e=>setNotes(e.target.value)}/></Field><p className="wa-list-note">Estas notas son internas y no se usan como respuestas del bot.</p><Button type="submit" variant="secondary" disabled={busy}>Guardar seguimiento</Button></form></details>;
}
function WhatsAppSettingsEditor({schoolId,initial,onSaved}:{schoolId:string;initial:WhatsAppSettings;onSaved:()=>void}) {
  const [draft,setDraft]=useState(()=>({...initial,quick_replies:initial.quick_replies.map(r=>({...r,id:r.id || crypto.randomUUID(),keywordsText:r.keywords.join(', ')}))}));
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
  async function save(event:FormEvent){event.preventDefault();setBusy(true);setError('');setSaved(false);try{const result=await whatsAppRequest<{revision:number}>(schoolId,'settings',{...draft,quick_replies:draft.quick_replies.map(({keywordsText,...r})=>({...r,keywords:keywordsText.split(',').map(k=>k.trim()).filter(Boolean)}))});setDraft(d=>({...d,revision:result.revision}));setSaved(true);onSaved();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <form className="wa-settings" onSubmit={event=>void save(event)}>
    <section className="panel"><h2>Cómo atenderá tu institución</h2><p>El bot responde con la ficha institucional, estos datos y tus respuestas guardadas. Las consultas privadas de alumnos se derivan al equipo.</p>
      <Field label="Modo de atención" name="wa-mode"><select value={draft.mode} onChange={e=>setDraft(d=>({...d,mode:e.target.value as WhatsAppSettings['mode']}))}><option value="manual">Manual: el equipo responde</option><option value="automatic">Automático: el bot responde consultas institucionales</option></select></Field>
      <div className="wa-settings-grid"><Field label="Horarios que puede informar el bot" name="wa-hours"><textarea maxLength={2000} rows={4} value={draft.hours} onChange={e=>setDraft(d=>({...d,hours:e.target.value}))}/></Field><Field label="Información pública de inscripciones" name="wa-admissions"><textarea maxLength={4000} rows={4} value={draft.admissions} onChange={e=>setDraft(d=>({...d,admissions:e.target.value}))}/></Field><Field label="Saludo" name="wa-greeting"><textarea required maxLength={4000} rows={3} value={draft.greeting} onChange={e=>setDraft(d=>({...d,greeting:e.target.value}))}/></Field><Field label="Respuesta al derivar al equipo" name="wa-fallback"><textarea required maxLength={4000} rows={3} value={draft.fallback} onChange={e=>setDraft(d=>({...d,fallback:e.target.value}))}/></Field></div>
      <p className="wa-variables">Variables disponibles: <code>{'{institucion}'}</code> <code>{'{sede}'}</code> <code>{'{horario}'}</code> <code>{'{inscripciones}'}</code> <code>{'{direccion}'}</code> <code>{'{telefono}'}</code> <code>{'{niveles}'}</code> <code>{'{web}'}</code>. Los datos se resuelven desde esta institución y sede.</p>
    </section>
    <section className="panel"><SectionTitle title="Respuestas guardadas" subtitle="El bot reconoce frases completas de tus palabras clave. También puedes usar estas respuestas al atender manualmente." action={<Button variant="secondary" icon={Plus} disabled={draft.quick_replies.length>=40} onClick={()=>setDraft(d=>({...d,quick_replies:[...d.quick_replies,{id:crypto.randomUUID(),title:'',body:'',keywords:[],keywordsText:'',enabled:true}]}))}>Agregar respuesta</Button>}/>
      {!draft.quick_replies.length && <p className="soft-note">Agrega respuestas para consultas frecuentes, como visitas, materiales o requisitos de inscripción.</p>}
      {draft.quick_replies.map((r,i)=><fieldset className="wa-reply-editor" key={r.id}><legend>Respuesta {i+1}</legend><div className="wa-settings-grid"><Field label="Título" name={`wa-title-${i}`} required maxLength={100} value={r.title} onChange={e=>setDraft(d=>({...d,quick_replies:d.quick_replies.map((v,n)=>n===i?{...v,title:e.target.value}:v)}))}/><Field label="Palabras o frases clave, separadas por coma" name={`wa-keywords-${i}`} required maxLength={960} value={r.keywordsText} onChange={e=>setDraft(d=>({...d,quick_replies:d.quick_replies.map((v,n)=>n===i?{...v,keywordsText:e.target.value}:v)}))}/></div><Field label="Respuesta" name={`wa-body-${i}`}><textarea required rows={3} maxLength={4000} value={r.body} onChange={e=>setDraft(d=>({...d,quick_replies:d.quick_replies.map((v,n)=>n===i?{...v,body:e.target.value}:v)}))}/></Field><div className="wa-actions"><label className="wa-check"><input type="checkbox" checked={r.enabled!==false} onChange={e=>setDraft(d=>({...d,quick_replies:d.quick_replies.map((v,n)=>n===i?{...v,enabled:e.target.checked}:v)}))}/>Disponible para el bot y el equipo</label><Button variant="ghost" icon={X} onClick={()=>setDraft(d=>({...d,quick_replies:d.quick_replies.filter((_,n)=>n!==i)}))}>Quitar respuesta</Button></div></fieldset>)}
    </section>
    {error && <p className="message error" role="alert">{error}</p>}{saved && <p className="message success" role="status">Configuración guardada.</p>}
    <div className="wa-actions"><Button type="submit" icon={Bot} disabled={busy}>{busy?'Guardando…':'Guardar configuración'}</Button></div>
  </form>;
}
