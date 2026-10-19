# Crédito inicial, solicitudes de demo y recogidas

## Crédito de licencias

Todas las instituciones, incluidas las existentes, requieren un adelanto inicial de **Bs 500**. Dirección entra a Crédito MiCole para generar el QR, mientras conserva configuración básica, aulas, docentes y preparación de inscripciones. Los módulos académicos se habilitan al recibir una confirmación bancaria de producción. El propietario conserva el acceso de soporte autorizado.

Los Bs 500 cubren licencias mensuales, por defecto Bs 29 por estudiante activo. No se cobra inicialmente la activación de Bs 50. El propietario puede habilitar o deshabilitar esa activación en Facturación MiCole, indicando un motivo. Las tarifas guardadas se usan en nuevas emisiones; los importes emitidos no disminuyen.

El saldo se aplica automáticamente a las licencias. Con Bs 29, 17 licencias consumen Bs 493 y dejan Bs 7. La siguiente licencia mantiene su importe de Bs 29, aplica esos Bs 7 y pide un QR de Bs 22. Las bajas dejan de generar nuevas licencias; una licencia ya emitida conserva su historial. Repetir un corte o una confirmación no repite el cobro por estudiante/período.

El adelanto no se acredita con recibos manuales, capturas ni certificación bancaria. Los movimientos se guardan en un registro privado de solo inserción, con importes cifrados mediante pgcrypto y clave en Supabase Vault, más autenticación HMAC. Ningún rol del panel puede editar el saldo o el historial. No guardar esta clave en React, Android ni archivos `.env` públicos.

## Solicitudes de demostración

La landing real incluye «Solicitar demostración guiada». Requiere datos de contacto y consentimiento. El endpoint público valida tamaño, origen y límites por solicitante. Las solicitudes aparecen únicamente al propietario en «Solicitudes de demo», con estados por contactar, contactada y cerrada, y notas de seguimiento. Realtime actualiza el panel sin interrumpir formularios abiertos.

La demo de acceso inmediato sigue separada, con credenciales ficticias y datos locales. No crea cuentas reales ni toca cobros. El formulario comercial es opcional y se encuentra en la landing real. No se envían correos automáticamente por esta funcionalidad; SMTP se configura con la guía existente.

## Autorizaciones de recogida

Madre o padre autorizados adjuntan una foto legible del carnet de quien recogerá al niño: JPG, PNG o WebP, máximo 5 MB. La carga se confirma en R2 privado antes de enviar la autorización. El archivo queda ligado a esa solicitud, estudiante, institución y familiar. No pertenece a la galería y no se publica.

La carga temporal firma por 120 segundos. El servidor comprueba tamaño, tipo y cabecera de imagen y guarda una copia final con una clave distinta, que la URL temporal no puede sobrescribir. Las vistas privadas firman por 300 segundos y solo se entregan a la familia y al personal autorizado. Las autorizaciones antiguas sin foto deben reemplazarse por una nueva.

Dirección o la docente asignada revisan la autorización y comparan presencialmente a la persona con el carnet. «Confirmar identidad y entrega» registra observación, cuenta y fecha real; exige autorización aprobada y que sea el día de recogida en Bolivia. No hay reconocimiento facial automático.

## Verificación y despliegue

- Migraciones: `202610190001_platform_credit`, `202610190002_pickup_identity`, `202610190003_demo_requests`.
- `node scripts/migrate-credit.mjs` previsualiza y revierte; `node scripts/migrate-credit.mjs --apply` aplica y registra versiones.
- `node scripts/smoke-credit.mjs --preview` prueba migraciones pendientes dentro de una transacción revertida. Después de aplicarlas, usar `node scripts/smoke-credit.mjs`. Usa exclusivamente datos temporales y confirmaciones SQL ficticias; no llama al banco ni mueve dinero.
- Funciones compartidas: `r2-media` y `demo-request`. La primera valida JWT con `auth.getUser()` y permisos por solicitud. La segunda es pública con validación de origen y consentimiento.
- R2 usa el bucket privado existente y sus secretos actuales. No ampliar credenciales ni hacer públicos los carnets.
- Android consume el mismo backend. Estos cambios no generan APK: al distribuir la siguiente versión, compilar manualmente siguiendo la configuración existente.
