import {describe,it,expect} from 'vitest';
import {deliveryResult,equalSecret,firebaseMessage} from '../supabase/functions/push-dispatch/core';
describe('FCM delivery contract',()=>{
 const item={token:'private-device-token',recipientId:'parent-id',notificationId:'notice-id',category:'academic',kind:'grade'};
 it('sends only a generic notification and an authorized lookup id',()=>{const m=firebaseMessage(item);expect(m.message.notification.title).toBe('Nueva nota o recomendación');expect(m.message.data).toEqual({recipientId:'parent-id',notificationId:'notice-id'});expect(m.message.android.notification.channel_id).toBe('micole-grades');expect(m.message.android.notification.visibility).toBe('PRIVATE');});
 it('invalidates only unregistered tokens; temporary permissions errors retain devices',()=>{expect(deliveryResult(404,{error:{details:[{errorCode:'UNREGISTERED'}]}}).result).toBe('invalid');expect(deliveryResult(403,{}).result).toBe('retry');expect(deliveryResult(429,{}).result).toBe('retry');expect(deliveryResult(400,{error:{status:'INVALID_ARGUMENT'}}).result).toBe('failed');expect(deliveryResult(200,{}).result).toBe('sent');});
 it('authenticates the worker before it can touch the outbox',async()=>{expect(await equalSecret(null,'correct')).toBe(false);expect(await equalSecret('wrong','correct')).toBe(false);expect(await equalSecret('correct','correct')).toBe(true);});
});
