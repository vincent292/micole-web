# Auditoría focalizada de seguridad y uso — 24 de octubre de 2026

Revisión de Astra sobre el código de web, Android y Supabase, contrastada con pruebas locales. No es una certificación ni un pentest completo de infraestructura. No se probaron ataques sobre producción ni se enviaron cobros/notificaciones reales.

## Correcciones preparadas

- **Reservas QR (media):** una reserva abandonada sin comenzar la generación podía bloquear cuotas indefinidamente. La nueva migración distingue una reserva no reclamada por el servidor de un posible envío bancario. Solo la primera se libera al vencer. La reclamación es atómica y exclusiva de service_role. Los intentos históricos o inciertos conservan sus reservas; requieren conciliación, nunca liberación por simple timeout.
- **Integridad de tareas (media):** una URL PUT podía reemplazar un archivo recién confirmado. La finalización nueva lee el objeto con ETag, verifica formato/tamaño y escribe una clave final aleatoria que nunca se firma para carga del cliente. La RPC mantiene validaciones de alumno, plazo, revisión, aula y acceso. Ante respuesta RPC incierta se conserva el objeto y se consulta el estado, evitando borrar una entrega que ya pudo confirmarse. Los documentos financieros también conservan su objeto ante error de respuesta incierto.
- **Tamaño R2 (mitigación parcial):** imágenes y documentos generales ahora incluyen ContentLength al firmar el PUT, además de la validación posterior. Falta comprobar el comportamiento efectivo de R2 en una carga sintética y completar cuotas/reservas y limpieza de cargas abandonadas.
- **Cabeceras web:** política frame-ancestors none, X-Frame-Options DENY, nosniff, base-uri self y object-src none. Impiden incrustar la interfaz en páginas ajenas; no sustituyen autenticación ni RLS. Se conserva Maps, OAuth y geolocalización.
- **Saldo parcial:** el resumen calcula el saldo restante y el importe cubierto, incluidos abonos y créditos, en lugar de sumar toda la cuota pendiente.
- **Teclado modal:** Mayús+Tab desde el foco inicial permanece dentro de la modal. Se incluyen controles con tabindex y se excluyen controles deshabilitados.
- **Asistencia web y Android:** borrador temporal por usuario, rol, sede, aula y fecha, con revisión del servidor. Se conserva al desmontar y volver; desaparece al guardar, descartar, confirmar, cerrar sesión o vencer. Solo memoria de sesión, no almacenamiento en disco. Cerrar la app/página pierde este borrador: para conservarlo entre sesiones se usa Guardar borrador. La asistencia confirmada continúa inmutable.
- **Evaluación Android:** las modales de columna/reglas y observación comparan contra su valor inicial y solicitan confirmación si se cierran con cambios.

## Evidencia

- Fallo de Mayús+Tab reproducido antes de la corrección.
- 431 pruebas web/SQL aprobadas en 50 archivos; la comprobación final focalizada se repite tras ajustar compatibilidad de despliegue.
- 9 pruebas de navegador aprobadas: saldo parcial, retroceso con borrador, foco modal, asistencia confirmada, pasos obligatorios y recorridos a 390/768/1366 px, incluyendo altura reducida por teclado.
- Android: TypeScript y ESLint de archivos modificados; validación interactiva en teléfono pendiente. No se genera APK.

## Despliegue compatible

1. Revisar/aplicar `202610230003_security_audit.sql` con `node scripts/migrate-security.mjs` (sin --apply valida en transacción y revierte); `--apply` confirma.
2. Desplegar `bank-qr` y `r2-media` con su configuración de autenticación actual. Ambas verifican la identidad según su flujo; no cambiar gateway/JWT a ciegas.
3. La migración conserva temporalmente la RPC antigua `finish_assignment_file(uuid,integer,text)` solo para service_role, para que instancias Edge anteriores sigan funcionando durante el despliegue. La nueva usa cuatro argumentos y clave final privada. Después de comprobar la nueva versión y drenar solicitudes antiguas se puede revocar y retirar la RPC antigua en otra migración.
4. Publicar web y demo desde sus configuraciones separadas; la demo sigue aislada y con acceso privado. No hacer público ningún usuario ni contraseña.
5. Verificar en producción con archivos sintéticos y conexión bancaria de certificación: carga/descarga, segundo PUT al staging sin cambio del archivo final, reserva no reclamada, resultado incierto sin liberación y cabeceras HTTP.
6. Incorporar Android mediante la próxima compilación solicitada por el propietario.

## Pendientes reales

- R2: cuotas por institución/usuario, reservas de todas las cargas y limpieza segura de huérfanos. Un PUT firmado sigue reutilizable sobre staging durante su vigencia; no afecta a la clave final nueva. Los objetos finales sin referencia por fallos ambiguos requieren reconciliación antes de borrarlos.
- Verificar despliegue efectivo, configuración de bucket y políticas de producción; esta auditoría de fuentes no garantiza que coincidan con el repositorio.
- Completar la CSP de scripts/conexiones tras inventariar y probar integraciones; esta ronda agrega protecciones específicas, no una política completa.
- Probar Android físicamente: Atrás, cambio de pestaña, teclado y descartar formularios. No se afirma prueba en dispositivo.

No se encontró una ruptura confirmada entre instituciones ni escalada a superadmin en el alcance revisado. El asistente usa guías y carece de herramientas para consultar expedientes ajenos. Esto describe el código observado, no ausencia universal de vulnerabilidades.

Referencias técnicas consultadas: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/ y https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors.
