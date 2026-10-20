# Consultas, estados de cuenta y documentos de MiCole

## Confirmaciones de comunicados

Desde **Comunicados → Ver aviso y lecturas → Ver lecturas y confirmaciones**, Dirección y el docente autor consultan quién confirmó, quién abrió sin confirmar y quién todavía no leyó. El reporte incluye los niños asociados y los padres pendientes de ingresar o vincular su cuenta. Se puede filtrar y exportar a CSV.

«Sin confirmar» representa ausencia de aceptación registrada; no representa un rechazo. En avisos opcionales se muestran lecturas, sin exigir aceptación. Soporte nunca confirma ni registra consultas a nombre de la familia atendida.

## Historial de consultas

Dirección y docentes tienen **Historial de consultas**, con fechas, estudiante, contenido y exportación CSV. El docente consulta únicamente estudiantes autorizados de sus aulas. Los filtros admiten hasta un año; las exportaciones incluyen hasta 10.000 registros por archivo, solicitando acotar fechas si se excede ese límite.

Se registran:

- Notas y recomendaciones que aparecen visibles, y libretas publicadas.
- Fotos de galería visibles después de cargarse.
- Aperturas de cuaderno, calendario, materiales y tareas de la familia o estudiante.
- Apertura o descarga de recibos y solicitud de descarga de facturas privadas.

Las consultas se registran con cuenta, fecha del servidor, tipo de dispositivo y huella del contenido actual en el servidor. No contienen una copia del texto académico ni se convierten en aceptación. Son registros de presentación o solicitud de acceso, no una certificación de comprensión o lectura completa. Una recarga de datos en segundo plano no genera otra vista. No se registran nuevas vistas si una modal tapa el contenido. El historial comienza con esta actualización; no se inventan visitas anteriores.

## Estado de cuenta por niño

En **Caja y cobros / Pagar mis cuotas**, el botón **Estado de cuenta por niño** muestra todas sus cuotas, abonos, saldos, recibos y facturas disponibles, sin limitarse al mes actual. Permite exportar cuotas a CSV e imprimir o guardar el estado de cuenta como PDF. Dirección y los padres vinculados pueden consultarlo aunque haya cuotas pendientes. Los estudiantes no acceden a datos financieros.

## Cobros por QR, efectivo, transferencia y depósito

- El QR bancario mantiene la confirmación del proveedor. La familia puede indicar «Necesito factura», con nombre o razón social, NIT/CI y celular. Se solicita la factura después de confirmar el dinero recibido.
- Dirección registra efectivo desde Caja; los docentes conservan la corroboración de actividades aprobadas de sus aulas.
- Depósitos y transferencias pueden informarse seleccionando cuotas y abonos, fecha, referencia y foto/PDF del comprobante. Se puede pedir factura en el mismo formulario.
- **Informar un comprobante no cambia saldos ni habilita acceso académico.** Dirección descarga el comprobante y contrasta el ingreso real en la cuenta institucional. Al aprobarlo, se generan recibo y abonos; si se solicitó factura, queda pendiente de emisión.
- Repetir la aprobación no duplica el dinero. Se rechaza aplicar importes que superen un saldo que cambió. Una referencia bancaria de depósito/transferencia no puede registrarse dos veces cambiando de método.
- Si el ingreso no pudo verificarse, Dirección registra el motivo; el saldo permanece intacto. La familia puede presentar una nueva solicitud corregida.

La fecha del comprobante se conserva por separado; el recibo y los movimientos registran cuándo se confirmó el cobro. El panel muestra los últimos 100 comprobantes del niño. Los recibos aprobados permanecen en el estado de cuenta.

## Facturas manuales y archivos

En **Facturas**, Dirección adjunta un PDF, JPG, PNG o WebP de hasta 5 MB y registra el número de la factura emitida manualmente. Los archivos se conservan en el R2 privado existente; no se recrean buckets ni credenciales. El sistema no emite por sí mismo una factura fiscal.

La familia puede descargar los archivos cuando la solicitud está marcada como emitida. Los adjuntos en preparación son visibles para Dirección. Se envía una notificación cuando hay factura emitida con archivo disponible. Se pueden conservar varios archivos, por ejemplo páginas o anexos; cada archivo final permanece independiente.

La función `r2-media` verifica sesión, permisos, tamaño y firma de PDF/imagen. La carga temporal se copia a una clave final nueva, de modo que una URL de subida anterior no modifica una factura final. Las descargas usan enlaces firmados breves y vuelven a comprobar el acceso. Niños, familias ajenas y docentes sin permiso financiero no acceden a las facturas.

## Operación y validación

Web y Android comparten Supabase y `r2-media`. Migración: `npm run supabase:migrate:records` en el proyecto web; desplegar junto a la función R2 y el frontend. No se agrega ningún cron ni se convierten comprobantes antiguos en pagos nuevos.

No se genera APK. El código Android se entrega integrado para la próxima compilación manual.
