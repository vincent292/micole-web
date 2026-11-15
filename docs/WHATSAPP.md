# WhatsApp institucional: piloto

Habilitado por identificadores explícitos para Piccolini Montessori (Sucursal 1 y Sucursal 2) y Pinitos Montessori. No se habilita al crear una institución con un nombre similar. Las nuevas sedes requieren autorización explícita en el piloto.

En la web: **WhatsApp y consultas**. Dirección puede conectar el número y configurar el bot; Secretaría con administración institucional puede atender conversaciones. Docentes y familias no acceden al CRM. Los accesos de soporte no operan el canal real.

## Funcionamiento

- **Conexión:** Embedded Signup con coexistencia, adaptado de `saas-food`. El código OAuth se intercambia en servidor; se verifican app, permisos, cuenta y pertenencia del número. Cada sede conserva su propio número. El QR de conexión lo presenta Meta.
- **Webhooks:** firma HMAC-SHA256 sobre el cuerpo original. El receptor identifica la sede por `phone_number_id` y la cuenta de Meta, nunca por una institución enviada por el contacto. Se usa un callback por número; no se modifica el callback global ni los overrides de cuenta de `saas-food`.
- **Conversaciones:** mensajes nuevos, no importación del historial anterior ni de la agenda. Seguimiento por etapa y notas internas; las notas no se envían al bot.
- **Bot:** comienza en modo manual. Dirección puede activar respuestas automáticas, horarios, información pública de inscripciones y hasta 40 respuestas por palabras o frases clave. No usa un modelo generativo ni consulta registros de alumnos. Los datos institucionales vienen de la sede actual; los contactos públicos respetan su configuración de publicación.
- **Atención humana:** tomar la atención, responder desde el CRM o recibir un eco de WhatsApp Business pausa las próximas respuestas del bot. Dirección o Secretaría pueden devolver una conversación al bot. El modo general debe estar en automático para volver a responder automáticamente.
- **Mensajes:** ventana de texto libre de 24 horas desde el último mensaje del contacto. Las plantillas aprobadas fuera de ventana y las campañas no forman parte de esta entrega. No se descargan adjuntos automáticamente.
- **Envíos:** cola durable e identificadores idempotentes. Estados de Meta no retroceden y las confirmaciones tempranas se conservan. Un envío de resultado incierto no se reintenta automáticamente; revisar WhatsApp antes de reenviar. El bot deriva a atención humana al alcanzar 30 respuestas por conversación en 24 horas.
- **Desconectar:** elimina el token local y cancela pendientes; conserva el historial. No desregistra el número ni elimina autorizaciones comerciales en Meta. Cambiar de número necesita una migración de canal para preservar la trazabilidad.

## Configuración de Meta

En Facebook Login for Business de la app existente, conservar los dominios de Yopido y añadir los dominios HTTPS de MiCole a **Allowed domains**. Añadir las páginas que abren el flujo a **Valid OAuth redirect URIs**:

- `https://www.micole.click/app/whatsapp`
- `https://micole.click/app/whatsapp`

Mantener activados los requisitos del SDK documentados por Meta. La app debe estar autorizada para `whatsapp_business_management`, `whatsapp_business_messaging` y coexistencia. Suscribir los campos `messages` y `smb_message_echoes` en la app. El enlace de cada sede configura su propio callback al completar la autorización; no reemplazar el callback global de la app.

La conexión real requiere que Dirección autorice y seleccione el número de la sede en Meta. La configuración local o el despliegue no prueban esa autorización.

## Backend y despliegue

Usar Supabase CLI v3. Si no está en PATH, indicar `MICOLE_SUPABASE_CLI` con la ruta al ejecutable. `npm run whatsapp:setup -- --source /ruta/a/saas-food` valida la migración en una transacción que se revierte. Agregar `--apply` aplica exclusivamente la migración de este piloto y despliega `whatsapp-crm` y `whatsapp-webhook`.

El script reutiliza solamente `META_APP_ID`, `META_APP_SECRET`, `META_WHATSAPP_CONFIG_ID` y la versión de Graph de la configuración existente. No copia tokens de números de `saas-food`. Genera claves independientes de cifrado AES-GCM, verificación y worker para MiCole, las conserva en Vault y configura los secretos del servidor mediante un archivo temporal privado que elimina al terminar. Nunca copiar claves a variables `VITE_` ni versionar archivos de entorno.

El worker procesa pendientes en segundo plano y mediante `micole-whatsapp-outbox` cada minuto. La interfaz consulta la bandeja abierta cada 12 segundos mientras sea visible. Los RPC de usuario validan institución y rol; `whatsapp_service` está reservado a `service_role`. Las tablas privadas tienen RLS y acceso directo revocado.

## Verificación

- `npx vitest run tests/whatsapp.test.ts tests/whatsapp-database.test.ts`: permisos, nonce, firmas, aislamiento, deduplicación, cifrado, pausa humana, ventana y estados de entrega.
- `npm run test` y `npm run build`.
- Revisar conexión, cancelación/reintento, conversación, respuestas y errores de guardado en escritorio y móvil.
- Después de autorizar Meta: probar desde un tercer teléfono cada sede, comprobar que responder en Business pausa el bot, devolver al bot, desconectar y verificar que las otras sedes siguen independientes. No activar automáticamente el bot para hacer estas pruebas.

Referencias oficiales: [Embedded Signup](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation), [webhooks](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview), [callbacks por número](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/override).
