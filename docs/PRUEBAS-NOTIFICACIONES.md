# Pruebas privadas de notificaciones

Disponible en **Superadmin → Pruebas de notificaciones**. Solo la cuenta real de plataforma, verificada y autorizada en Supabase, puede utilizarlo. Sal de soporte para abrirlo. Dirección, docentes, familias y estudiantes no tienen acceso.

## Probar desde la web

1. Elige uno de los 30 escenarios: comunicados, acuerdo obligatorio, salud, recojo, asistencia, mensajes, tareas, notas, calendario, materiales, cumpleaños, pagos o facturas.
2. Elige **Solo campanita** para comprobar el aviso web. No envía ninguna notificación Android.
3. Para Android, abre MiCole con la misma cuenta real y activa las notificaciones. En la web selecciona **Campanita + mi teléfono Android** y uno de tus teléfonos activos. No admite destinatarios ni dispositivos de otras cuentas.
4. Pulsa **Revisar envío de prueba** y luego confirma. No se envía nada al seleccionar un escenario.
5. Revisa el historial y la campanita. **Aceptada por Firebase** indica aceptación del envío por FCM; no confirma que Android lo haya mostrado. **Lectura** y **Estoy de acuerdo** se registran por separado. El acuerdo solo corresponde a la prueba.

Cada aviso lleva `[PRUEBA]` y texto ficticio. No se crean alumnos, emergencias, autorizaciones de recojo, comunicados, notas, cuotas, pagos ni facturas reales. El laboratorio no envía correos ni SMS. Escribe únicamente avisos personales y su historial técnico privado en Supabase.

## Límites y entrega

Se exige elegir un teléfono activo propio para cada envío Android. No se muestra su token. El límite es de 60 pruebas por hora y una prueba nueva cada dos segundos. Reintentar una respuesta perdida conserva el identificador y no crea otra prueba. El despachador procesa la cola aproximadamente cada minuto.

Las pruebas expresamente solicitadas no activan recordatorios horarios y no esperan al fin del descanso nocturno. Se utiliza el canal, icono y sonido existente del tipo de aviso seleccionado. Los permisos, canales y modo No molestar de Android pueden silenciarlo. Desactivar el dispositivo o revocar su sesión evita envíos pendientes. Leer la prueba en la web no cancela el envío Android solicitado.

Si no aparece tu teléfono, abre MiCole fuera de soporte con tu cuenta real, revisa el permiso de notificaciones y actívalas. Una APK anterior no recibe automáticamente las pantallas nuevas; debe actualizarse después. No se genera una APK como parte de este trabajo.

## Marcación GPS del equipo

Dirección configura coordenadas, rango permitido y precisión máxima por sede, y asigna los turnos al docente. En Android el docente usa **Verificar mi ubicación**; entrada y salida se habilitan al obtener una lectura reciente, precisa y dentro del rango. La habilitación vence a los 90 segundos. Al marcar se obtiene otra lectura y Supabase vuelve a validar el rango y guarda su propia hora.

No se sigue la ubicación en segundo plano. Ante permisos denegados, GPS desactivado o falta de precisión se muestra cómo resolverlo; Dirección conserva la corrección con motivo. Las coordenadas reportadas no prueban presencia de forma infalible: debe hacerse un piloto en cada sede y ajustar el radio sin excluir aulas interiores.

Wi-Fi puede incorporarse como comprobación adicional por sede; todavía no se valida una red. El nombre de una red por sí solo no basta para acreditar presencia. Un QR rotativo presencial o un reloj externo son alternativas para reforzar el control.

## Operación técnica

- Migración: `202610210003_notification_test_lab.sql`.
- Validar sin persistir: `node scripts/migrate-notification-tests.mjs`.
- Aplicar: `node scripts/migrate-notification-tests.mjs --apply`.
- Desplegar `push-dispatch` después de aplicar la migración. Conserva la autenticación privada del worker; los clientes no pueden ejecutarlo.
- Catálogo validado por servidor; los clientes no pueden elegir título, destinatario ni contenido arbitrario para este laboratorio.
- La demo pública de perfiles no contiene un rol de superadmin ni acceso a este módulo.

Verificación del 22/10/2026: pruebas de permisos, catálogo, destino propio, idempotencia, límites, cola y preparación Firebase; navegación web en 390/768/1366 px y Expo web en 390/768 px; validación GPS dentro/fuera del rango y nueva lectura al marcar. Las pruebas de navegador interceptan Supabase y no envían avisos a personas reales. La visualización y el sonido en un teléfono físico deben comprobarse desde el laboratorio.

## Corrección de señales — 22/10/2026

La migración `202610220001_platform_signal_updates.sql` limita las actualizaciones de `platform_signals` a su fila `singleton=true`. Resuelve «UPDATE requires a WHERE clause» al crear, leer o confirmar una prueba bajo la protección de PostgREST. También restaura `changed_table=demo_requests` en las señales comerciales posteriores a una prueba. No desactiva safeupdate, no cambia permisos y no requiere recompilar la APK. El comando de migración anterior aplica ambas migraciones pendientes.
