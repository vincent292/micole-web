# Correo dedicado para MiCole

Puede usarse una cuenta Gmail dedicada. Google exige verificación en dos pasos para crear una contraseña de aplicación. No se utiliza la contraseña habitual ni el Client Secret del acceso con Google.

## Supabase Auth

En Supabase → Authentication → Email → SMTP Settings:

- Enable custom SMTP: activado.
- Sender email y Username: la misma dirección Gmail dedicada.
- Sender name: MiCole.
- Host: `smtp.gmail.com`.
- Port: `465` (TLS).
- Password: contraseña de aplicación de esa cuenta, sin espacios.

Conservar Site URL y las redirecciones existentes de web y Android. Revisar el límite de correos de Auth y validar una recuperación de acceso usando una cuenta propia antes de abrir registros públicos. La configuración queda pendiente hasta disponer de la cuenta.

SMTP de Supabase Auth envía mensajes de autenticación. No convierte automáticamente las invitaciones internas, comunicaciones o publicaciones en correos. Esos envíos requieren un servicio del servidor y acciones/preferencias explícitas; los avisos internos y push actuales siguen funcionando. Gmail tiene límites de envío; para un volumen grande se podrá conectar otro proveedor SMTP sin cambiar los roles ni los formularios.

No guardar contraseñas SMTP en variables `VITE_*`, `EXPO_PUBLIC_*`, archivos de la aplicación Android ni en Git. Si se prepara un archivo de configuración, usar `~/.config/micole/smtp.env`, fuera de ambos repositorios, con permisos `600`. No enviar la contraseña por el chat.

Referencias oficiales: [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [contraseñas de aplicación de Google](https://support.google.com/accounts/answer/185833?hl=es).
