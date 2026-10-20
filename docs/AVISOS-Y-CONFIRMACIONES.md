# Avisos, confirmaciones y alertas de MiCole

## Publicar

Dirección y los docentes asignados pueden crear avisos en **Comunicados**. Dirección también puede dirigirse a toda la institución.

1. Completa título, contenido y tipo: comunicado, actividad, notas, salud o recojo.
2. Elige institución o aula y audiencia. En un aula puedes seleccionar niños concretos: reciben el aviso las cuentas verificadas de su madre y padre. Sin selección, se incluyen todas las familias del aula. «Toda la comunidad» incluye además al personal correspondiente.
3. Activa «Exigir Estoy de acuerdo» si necesitas confirmación personal. Al activarlo, se selecciona inicialmente el recordatorio por hora; puedes desactivarlo.
4. Solo salud o recojo permiten marcar **Urgente**.

Un aviso publicado conserva texto, destinatarios y reglas de confirmación. Para corregirlo, retíralo y publica otro. Retirar detiene sus recordatorios y conserva el historial.

## Leer y aceptar

Al entrar en web o Android, los destinatarios ven primero los avisos obligatorios pendientes. Deben marcar «He leído el aviso y estoy de acuerdo» y confirmar, o cerrar sesión. Abrir el aviso registra lectura; no registra aceptación. Cada cuenta confirma por separado.

Los avisos opcionales de salud y recojo también se muestran al entrar, pero permiten cerrarlos sin aceptar. Los demás se consultan desde Comunicados o Notificaciones.

Los avisos obligatorios, de salud y recojo están disponibles para padres con cuotas pendientes. Esto no habilita tareas, notas, calendario ni el resto del contenido bloqueado.

El modo de soporte permite consultar sin aceptar en nombre de otra persona. Dirección y el docente autor pueden abrir **Ver aviso y lecturas** para revisar lecturas y confirmaciones de las cuentas vinculadas. Las cuentas infantiles reciben solo los avisos académicos de lectura; no reciben consentimientos ni alertas privadas de salud o recojo.

## Recordatorios

El worker existente de Supabase corre cada minuto y genera los recordatorios que vencieron hace una hora. No necesita que Android permanezca abierto.

- Obligatorio: se detiene cuando esa cuenta acepta.
- Opcional con recordatorio: se detiene cuando esa cuenta abre el aviso.
- Descanso: 22:00–07:00, zona **America/La_Paz**. Se reprograma para las 07:00 sin acumular nueve avisos nocturnos.
- Solo avisos de salud o recojo marcados urgentes omiten el descanso.
- Se comprueba nuevamente el vínculo, el acceso y la confirmación antes de enviar.
- Los recordatorios de confirmación son para cuentas adultas. El estudiante recibe el aviso académico inicial.

Las notificaciones del teléfono dependen del permiso de Android y de las preferencias de la cuenta. La confirmación dentro de la app permanece pendiente aunque estén desactivadas las notificaciones.

## Android

Se prepararon canales, iconos y vibraciones distintos; salud y recojo tienen además sonidos propios. FCM envía texto genérico y el identificador autorizado del aviso: los nombres, notas y detalles médicos se consultan al entrar en la app.

**No se generó APK.** Los recursos nativos y canales nuevos necesitan la siguiente compilación manual. Un APK anterior utiliza los canales y recursos que ya tenga instalados.

La configuración de los recursos está en `app.json`, `assets/notifications/` y `plugins/with-notification-icons.cjs`. El plugin copia únicamente sus iconos al compilar; no modifica a mano el proyecto nativo existente.

## Operación

Migración: `npm run supabase:migrate:announcements` en el proyecto web. Se aplica una vez; debe desplegarse junto con `push-dispatch` y el frontend. No agrega un cron nuevo: reutiliza `micole-push-dispatch`.

No se cambian las preferencias antiguas del dispositivo ni se convierten avisos anteriores en obligatorios. Las confirmaciones se guardan con su cuenta, fecha y la huella del contenido publicado. Las políticas RLS y los RPC impiden confirmar por otra cuenta o modificar directamente los recibos.
