import { handleWhatsAppApi } from '../_shared/whatsapp-api.ts';
import { whatsAppDependencies } from '../_shared/whatsapp-deps.ts';
Deno.serve(req => handleWhatsAppApi(req, whatsAppDependencies()));
