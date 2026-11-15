import { useCallback, useEffect, useState } from 'react';
import { liveMode, supabase } from './supabase';
import { rpc } from './repository';
import type { Role, School } from './types';
export interface WhatsAppSettings {
  revision: number; mode: 'manual' | 'automatic'; hours: string; admissions: string; greeting: string; fallback: string;
  quick_replies: { id?: string; title: string; keywords: string[]; body: string; enabled?: boolean }[];
  updated_at: string;
}
export interface WhatsAppConversation {
  id: string; school_id: string; contact_name: string; contact_key: string; human: boolean;
  stage: 'new' | 'interested' | 'visit' | 'enrolled' | 'closed'; notes: string; unread: number;
  last_customer_at: string | null; last_message_at: string;
}
export interface WhatsAppMessage {
  id: string; conversation_id: string; direction: 'in' | 'out'; source: 'customer' | 'staff' | 'app' | 'bot';
  body: string; status: string; created_at: string; error_code?: string;
}
export interface WhatsAppWorkspace {
  setupReady: boolean; canConnect: boolean; settings: WhatsAppSettings;
  connection: { status: string; display_phone: string; verified_name: string; updated_at: string } | null;
  conversations: WhatsAppConversation[]; messages: WhatsAppMessage[];
}
export const whatsAppStages = { new: 'Consulta nueva', interested: 'Interesado', visit: 'Visita', enrolled: 'Inscrito', closed: 'Cerrado' };
export const whatsAppMessageStatus: Record<string, string> = { received: 'Recibido', pending: 'En cola', sending: 'Enviando', sent: 'Enviado', delivered: 'Entregado', read: 'Leído', failed: 'No enviado', unknown: 'Entrega sin confirmar; revisa WhatsApp antes de reenviar', cancelled: 'Cancelado' };
export function whatsAppWindowOpen(time: string | null, now = Date.now()) { return !!time && new Date(time).getTime() > now - 24 * 3600000; }
export async function whatsAppRequest<T>(schoolId: string, action: string, data?: object, extra?: object, signal?: AbortSignal): Promise<T> {
  if (!liveMode || !supabase) throw Error('WhatsApp se conecta desde una institución real habilitada.');
  const result = await supabase.functions.invoke('whatsapp-crm', { body: { schoolId, action, data, ...extra }, signal });
  if (result.error) {
    let message = result.error.message;
    try { const body = await result.error.context?.json(); if (body?.error) message = body.error; } catch { /* keep transport error */ }
    throw Error(message || 'No se pudo conectar con WhatsApp.');
  }
  return result.data as T;
}
export function useWhatsAppAccess(schoolId: string | undefined, role: Role) {
  const [result, setResult] = useState<{ key: string; enabled: boolean }>();
  const key = `${schoolId}:${role}`;
  useEffect(() => {
    let active = true;
    if (!liveMode || !schoolId || !['director', 'scheduler', 'superadmin'].includes(role)) return;
    void rpc<{ enabled: boolean }>('whatsapp_access', { p_school: schoolId }).then(data => { if (active) setResult({ key, enabled: data.enabled }); }).catch(() => { if (active) setResult({ key, enabled: false }); });
    return () => { active = false; };
  }, [key, schoolId, role]);
  const eligible = liveMode && !!schoolId && ['director', 'scheduler', 'superadmin'].includes(role);
  return { enabled: result?.key === key && result.enabled, loading: eligible && result?.key !== key };
}
/** Poll only the open CRM, while visible; keep cached content on refresh failures. */
export function useWhatsAppWorkspace(schoolId: string, conversationId: string) {
  const key = `${schoolId}:${conversationId}`, [version, setVersion] = useState(0);
  const [snapshot, setSnapshot] = useState<{ key: string; data?: WhatsAppWorkspace; error: string }>();
  const refresh = useCallback(() => setVersion(v => v + 1), []);
  useEffect(() => {
    let active = true, loading = false;
    const abort = new AbortController();
    async function load() {
      if (loading || document.visibilityState === 'hidden') return;
      loading = true;
      try { const data = await whatsAppRequest<WhatsAppWorkspace>(schoolId, 'workspace', undefined, { conversationId: conversationId || null }, abort.signal);
        if (active) setSnapshot({ key, data, error: '' });
      } catch (error) { if (active) setSnapshot(previous => ({ key, data: previous?.key === key ? previous.data : undefined, error: error instanceof Error ? error.message : 'No se pudo actualizar la bandeja.' })); }
      finally { loading = false; }
    }
    void load(); const timer = window.setInterval(() => void load(), 12000);
    const visible = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', visible);
    return () => { active = false; abort.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [key, schoolId, conversationId, version]);
  return { data: snapshot?.key === key ? snapshot.data : undefined, error: snapshot?.key === key ? snapshot.error : '', loading: snapshot?.key !== key, refresh };
}

export function formatSavedWhatsAppReply(body: string, school: School, settings: WhatsAppSettings) {
 const values: Record<string,string> = { institucion: school.name, sede: school.siteName || 'Sede principal', ciudad: school.city || '', direccion: school.address || '', telefono: school.phone || '', horario: settings.hours, inscripciones: settings.admissions, niveles: school.educationLevels?.join(', ') || '', web: school.website || '', descripcion: school.publicDescription || '' };
 return body.replace(/\{([a-z]+)\}/g, (match,key:string)=>values[key] ?? match).slice(0,4000);
}
