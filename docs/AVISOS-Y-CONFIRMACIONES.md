# Avisos importantes, lectura y pagos familiares

Actualizado el 29 de octubre de 2026 para web y APK 18.

## Qué aparece al entrar

Salud y recojo pendientes aparecen primero. Para que otro comunicado se muestre obligatoriamente, Dirección o el docente activa **Solicitar confirmación: «He leído»**. Los avisos se vuelven a consultar al entrar, al volver a la aplicación o pestaña y al recuperar conexión. Si hay otro formulario abierto, esperan a que se cierre sin perder su contenido.

Abrir la pantalla no registra lectura automáticamente. Salud y recojo sin confirmación se cierran mediante **Marcar como leído**. Los comunicados obligatorios requieren marcar **He leído el aviso** y pulsar **Confirmar lectura**. Se puede cerrar sesión en lugar de confirmar. Cada destinatario responde desde su cuenta; mamá no confirma por papá ni una cuenta infantil por un adulto. La confirmación no autoriza salidas, actividades ni recojos.

## Pagos: cinco días antes

Los padres verificados reciben un aviso por hijo con las cuotas cuyo saldo es mayor que cero y vencen dentro de cinco días, hoy o ya vencieron. Incluye concepto, fecha, días hasta el vencimiento e importe pendiente. Se agrupan las cuotas del hijo; se excluyen pagadas, anuladas, sin saldo y las que vencen dentro de más de cinco días. Los roles escolares, estudiantes y otras familias no reciben esos avisos familiares.

**Ver mis pagos** registra la lectura y abre el estado de cuenta del hijo correcto. **Marcar como leído** permite continuar. Ninguna acción registra un abono, cobra ni cambia el saldo. Mamá y papá tienen lecturas independientes. Marcar toda la campana no sustituye esta lectura específica.

Se conserva una lectura por persona, hijo, día y composición de cuotas/saldos. Reintentar no duplica. Un abono cambia el importe avisado; al quedar saldado deja de aparecer. Una deuda no resuelta puede generar otro aviso al día siguiente. El saldo es el registrado por la institución; enviar un comprobante no lo confirma por sí solo.

El worker existente suma cinco días a los recordatorios de tres días antes, el vencimiento y el día siguiente. No se agregó otro cron. La pantalla al entrar funciona aunque Android no haya mostrado un banner. Los push conservan texto genérico y las preferencias del teléfono. No se afirma entrega física de cada nuevo recordatorio durante el descanso nocturno.

## Publicar y consultar

Dirección publica para su institución y los docentes dentro de sus aulas. Se pueden elegir niños concretos o las familias del aula; la selección no amplía permisos. El autor y Dirección consultan **Ver aviso y lecturas**, con cuenta y hora de confirmación. Salud, recojo y confirmaciones obligatorias no se delegan a cuentas infantiles.

El texto y los destinatarios publicados son inmutables. Para corregir, retirar y publicar otra versión. Retirar detiene los recordatorios y conserva la historia. Soporte no confirma por una familia.

## Operación

Migración: 202610290003_family_payment_attention.sql, validada con rollback antes de aplicarse. Añade lectura personal de recordatorios y cinco días de anticipación; no reescribe cuotas ni pagos existentes. La APK 18 se compila y firma localmente con el certificado existente.

Cuentas para demostrar: [correos y roles](CUENTAS-DE-PRUEBA-PARA-DEMO.md). Evidencias: output/qa/2026-10-29-avisos-importantes/.
