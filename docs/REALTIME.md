# Realtime en MiCole

Web y Android usan un canal de Supabase por sesión/contexto. Reciben únicamente institución, tabla modificada y revisión. Los datos se consultan después con las políticas RLS y los RPC existentes. Los permisos de cada sede, aula y familia siguen verificándose en el servidor.

## Actualización por módulo

- Mensajes, agenda, comunicados, galería, documentos y cuaderno: solo sus colecciones y notificaciones.
- Asistencia de alumnos, planilla, cuidados, asistencia de docentes y boletas: solo el RPC de la pantalla abierta.
- Reportes, comprobantes, facturas, sedes, crédito y registro QR: señales relevantes con filtros conservados.
- Pagos, acceso familiar, permisos, matrículas y cambios de alumnado: reconstrucción del acceso para reflejar bloqueos o habilitaciones.
- Un cambio de etiquetas o límite de notas se refleja en la planilla sin cambiar valores ya escritos.

Las ráfagas de una transacción se agrupan. Las consultas del almacén se ejecutan en serie y acumulan tablas pendientes; una respuesta no puede descartar la de otra tabla. Los formularios abiertos retienen las actualizaciones generales hasta cerrarse. Las pantallas especializadas conservan borradores y usan versiones para detectar conflictos.

## Conexión y excepciones

La carga inicial y la reconexión sincronizan los datos. Al volver desde segundo plano se comprueban cambios que pudieron no llegar. El botón Actualizar/Reintentar permanece para fallos de conexión.

Los comunicados pendientes ya no se consultan cada minuto. El QR autenticado consulta al recibir cambios del servidor, sin consultar cada cinco segundos. La conciliación bancaria del servidor sigue siendo la autoridad: Realtime no acredita pagos.

Los enlaces públicos de pago no reciben señales privadas: mantienen consulta periódica limitada usando su token. El directorio público de instituciones carga al entrar y al volver a la página; no abre un canal institucional ni consulta cada minuto.

Las notificaciones con la app cerrada siguen usando Firebase. Realtime no sustituye a las notificaciones push. Los documentos interpretados por Gemini conservan el borrador para revisión: ninguna señal lo aplica ni sustituye automáticamente.

## Activación y verificación

Migración: `202610220005_realtime_modules.sql`. Se mantienen publicadas solo las tablas de señales, no las tablas privadas de banco, crédito o personal. Los movimientos de crédito siguen inmutables; la migración añade disparadores de aviso.

- Web: `npm test` y `npm run build`.
- Android: `npm run lint`, `npm run typecheck` y `npm test`.
- No se genera APK automáticamente.
