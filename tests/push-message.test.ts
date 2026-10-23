import {notificationTestTemplates} from '../src/lib/notificationTests';
import {describe,it,expect} from 'vitest';
import {deliveryResult,equalSecret,firebaseMessage} from '../supabase/functions/push-dispatch/core';
describe('FCM delivery contract',()=>{
 const item={token:'private-device-token',recipientId:'parent-id',notificationId:'notice-id',category:'academic',kind:'grade'};
 it('sends only a generic notification and an authorized lookup id',()=>{const m=firebaseMessage(item);expect(m.message.notification.title).toBe('Nueva nota o recomendación');expect(m.message.data).toEqual({recipientId:'parent-id',notificationId:'notice-id'});expect(m.message.android.notification.channel_id).toBe('micole-grades');expect(m.message.android.notification.visibility).toBe('PRIVATE');});
 it('invalidates only unregistered tokens; temporary permissions errors retain devices',()=>{expect(deliveryResult(404,{error:{details:[{errorCode:'UNREGISTERED'}]}}).result).toBe('invalid');expect(deliveryResult(403,{}).result).toBe('retry');expect(deliveryResult(429,{}).result).toBe('retry');expect(deliveryResult(400,{error:{status:'INVALID_ARGUMENT'}}).result).toBe('failed');expect(deliveryResult(200,{}).result).toBe('sent');});
 it('authenticates the worker before it can touch the outbox',async()=>{expect(await equalSecret(null,'correct')).toBe(false);expect(await equalSecret('wrong','correct')).toBe(false);expect(await equalSecret('correct','correct')).toBe(true);});
});

it('cada escenario de prueba conserva su canal e icono con texto ficticio y sin datos personales',()=>{for(const t of notificationTestTemplates){const m=firebaseMessage({token:'synthetic-token',recipientId:'owner',notificationId:'notice',category:t.category,kind:'push_test',isTest:true,testKind:t.kind,testLabel:t.label,alertType:t.alertType});expect(m.message.notification.title).toBe('[PRUEBA] '+t.label);expect(m.message.notification.body).toContain('ficticio');expect(m.message.android.notification.channel_id).toBe(`micole-${t.alertType==='general'?'alerts':t.alertType}`);expect(m.message.data).toEqual({notificationId:'notice',recipientId:'owner'});}});
it('los metadatos de prueba no alteran una notificación real sin la marca de servidor',()=>{const base={token:'synthetic',recipientId:'parent',notificationId:'notice',category:'academic',kind:'grade'};expect(firebaseMessage({...base,testLabel:'No autorizado',testKind:'message'})).toEqual(firebaseMessage(base));});
it('entrevistas y coordinación docente usan avisos privados sin revelar el motivo ni notas',()=>{
 for(const kind of ['interview_1','interview_response_1_2','classroom_message']){
  const message=firebaseMessage({token:'synthetic',recipientId:'family',notificationId:'notice',category:kind==='classroom_message'?'messages':'academic',kind}).message;
  expect(message.notification.title).toBe(kind==='classroom_message'?'Coordinación del aula':'Entrevista familiar en MiCole');
  expect(message.data).toEqual({recipientId:'family',notificationId:'notice'});expect(message.notification.body).not.toMatch(/Matemáticas|Lucía|42/);
 }
});
