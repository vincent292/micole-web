# Notificaciones Android de MiCole

Expo SDK 57 usa `expo-notifications` y tokens Android nativos de Firebase Cloud Messaging (FCM HTTP v1). La sesión y el contenido continúan en Supabase. No se usa Firebase Auth ni es necesario configurar el servicio de envío de Expo.

## Configuración

`app.json` apunta a `google-services.json`, proyecto Firebase `micolegio-c0290`, paquete `com.micole.android`. Este archivo identifica la aplicación Android. El JSON de cuenta de servicio es privado: está fuera del repositorio, en `~/.config/micole/firebase-service-account.json`, excluido de Git y EAS. Nunca debe incluirse en el APK ni en variables `EXPO_PUBLIC_` o `VITE_`.

El backend contiene las migraciones `202610160001_android_push.sql` y `202610160002_push_device_test.sql` y la función `push-dispatch`. El script `scripts/setup-push.mjs` de la web valida las migraciones con rollback; con `--apply` las registra, guarda secretos de servidor, despliega la función y programa los trabajos. Usa la CLI de Supabase autenticada. Puede indicarse su binario con `MICOLE_SUPABASE_CLI` y otra ruta privada con `MICOLE_FIREBASE_SERVICE_ACCOUNT`.

## Avisos disponibles

- Cumpleaños: dos días antes, un día antes y el día del cumpleaños. Se derivan de la fecha de nacimiento. Dirección y docentes asignados reciben los de sus alumnos; madre y padre, únicamente los de sus hijos.
- Cuaderno y tareas, notas/recomendaciones nuevas, eventos de agenda y comunicados. Materiales y actividades aprobadas aprovechan el comunicado publicado por Dirección para evitar duplicar la alerta del evento.
- Mensajes y permisos/recogidas: usan los avisos existentes del servidor.
- Cobros confirmados, incluidos abonos, y recordatorios de saldo tres días antes, el día del vencimiento y un día después. Se vuelve a revisar el saldo al enviar; una cuota ya cancelada o pagada no genera el recordatorio pendiente.
- Acceso infantil opcional: solo tareas y contenido que ya permite `student_portal()`. Nunca notas, cuidados, pagos o mensajes privados.

Los avisos académicos respetan el bloqueo por inscripción, perfil y deuda. Los recordatorios financieros permanecen disponibles para la familia vinculada. El servidor vuelve a comprobar vínculos, roles, sesión activa y preferencias antes de enviar cada notificación.

## Entrega

Cada instalación registra un token vinculado a la cuenta real autenticada, incluso durante soporte. Un token no se comparte entre cuentas. Cerrar sesión desactiva el dispositivo y limpia las notificaciones mostradas; cambiar de cuenta invalida las entregas pendientes de la anterior. Las sesiones revocadas y los tokens caducados se descartan.

La cola es privada y transaccional. No se llama a Firebase dentro de una inscripción o publicación. El worker se ejecuta cada minuto, toma lotes con un arrendamiento y reintenta fallos temporales con espera creciente. Los tokens que FCM marca como `UNREGISTERED` se desactivan. La restricción única evita encolar dos veces el mismo aviso para un dispositivo; FCM usa un tag estable. Como en cualquier envío por red, una respuesta perdida puede producir un reintento: no se garantiza entrega exactamente una vez ni recepción inmediata por el sistema operativo.

Los avisos no urgentes se posponen de 22:00 a 07:00, horario de Bolivia. Mensajes, permisos y pruebas solicitadas no se posponen. Los recordatorios de pagos se revisan diariamente a las 08:00. Los cumpleaños también se generan en el corte diario existente. No se reenvía el historial anterior al registro del teléfono. Las entregas pendientes caducan en 48 horas; el historial técnico se limpia a los 14 días.

El mensaje de la pantalla bloqueada es genérico: no incluye nombres de menores, calificaciones, salud, NIT ni importes. El teléfono recibe el id del aviso; al tocarlo pide al servidor su destino y vuelve a aplicar los permisos. Si hay un formulario abierto o una sesión de soporte, espera para abrirlo. Los datos privados se consultan dentro de la app.

## Activar y probar

Instalar el APK nuevo, iniciar sesión y pulsar **Activar notificaciones** en Inicio o Configuración. Android 13 o posterior requiere aceptar el permiso. Configuración permite elegir tareas/actividades/notas, comunicados/permisos, mensajes, pagos y cumpleaños, o desactivar este teléfono.

El botón **Enviar prueba a este teléfono** solicita un aviso únicamente para el teléfono de la sesión actual y limita la frecuencia a una prueba por minuto. Puede tardar un minuto en llegar. La app debe estar instalada; Expo Go no incluye esta configuración nativa. Probar con la app abierta y después en segundo plano, y tocar la notificación para verificar el destino. Android puede demorar o bloquear avisos por batería, permisos, canales, falta de conexión o cierre forzado.

Referencias oficiales: [Expo SDK 57 Notifications](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/), [FCM directo desde Expo](https://docs.expo.dev/push-notifications/sending-notifications-custom/), [FCM HTTP v1](https://firebase.google.com/docs/cloud-messaging/send/v1-api), [Supabase Cron y Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions).

## Estado verificado — 16 de octubre de 2026

Ambas migraciones aplicadas al Supabase vinculado. Secretos de servidor guardados, función `push-dispatch` desplegada y autenticación con Google/Firebase comprobada desde el servidor. Los tres trabajos Cron están activos; la primera ejecución del despachador terminó correctamente. Las funciones de procesamiento rechazan a `anon` y `authenticated`; solo `service_role` puede usarlas.

Prueba real completada en Stratus C7 (Android 12), APK versión 2 y sesión real: dispositivo registrado con las cinco categorías, botón de prueba pulsado desde la app, entrega FCM `sent` en el primer intento y sin error. Android mostró el aviso con el título y canal esperados. Al tocarlo abrió Notificaciones de MiCole y el servidor lo marcó como leído. Solo se envió a este dispositivo; no se enviaron pruebas a familias.

## Laboratorio privado del superadmin

El superadmin puede comprobar 30 escenarios desde la web o Android y enviar cada prueba a un teléfono propio o solo a la campanita. Consulta [Pruebas privadas de notificaciones](PRUEBAS-NOTIFICACIONES.md). No crea casos escolares reales.
