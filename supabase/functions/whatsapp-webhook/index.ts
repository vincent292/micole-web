import { handleWhatsAppWebhook } from '../_shared/whatsapp-runtime.ts';
import { whatsAppDependencies } from '../_shared/whatsapp-deps.ts';
Deno.serve(req => handleWhatsAppWebhook(req, whatsAppDependencies()));
