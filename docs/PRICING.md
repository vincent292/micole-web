# Tarifas y cuotas emitidas

## Tarifas de MiCole

El propietario modifica activación y licencia mensual desde **Configuración → Tarifas de MiCole** o **Facturación MiCole**. Puede cambiar las tarifas generales o establecer un acuerdo por institución. **Usar las tarifas generales** elimina el acuerdo particular y vuelve a heredar el general. Se exige motivo y se registra antes/después en auditoría.

Las tarifas iniciales siguen siendo Bs 50 y Bs 29. Esta entrega no modifica los precios acordados ni recalcula deudas existentes. La landing consulta la tarifa general vigente y la inscripción consulta la de su institución. Las credenciales bancarias son independientes de esta configuración.

Al crear un plan se fija la licencia que corresponde a su tarifa. La matrícula, base, merienda, descuentos y cuota resultante se emiten con esos valores. La activación usa su tarifa al inscribir. Cada liquidación mensual conserva cantidad de estudiantes y tarifa unitaria; los reportes utilizan esa cantidad, sin dividir por Bs 29.

Si cambia una tarifa mientras un formulario está abierto, la inscripción o el plan se rechazan con un aviso para actualizar su cotización. El servidor valida precios y permisos; no acepta una licencia arbitraria enviada por React o Android.

## Precios de la institución

Dirección puede editar el precio base del aula para próximas inscripciones. Desde Pagos, **Precios para nuevas cuotas** cambia la mensualidad, merienda y matrícula del estudiante para nuevas emisiones. Editar el estudiante conserva esa misma separación.

Todas las cuotas ya creadas quedan con su importe anterior, incluso las que vencen en meses futuros. Cambiar el descuento de un plan afecta nuevas emisiones; no vuelve a calcular las cuotas emitidas. Un plan nuevo puede incluir un descuento desde su emisión inicial.

El superadmin accede a estos cambios escolares entrando por soporte como Dirección; su panel normal permanece reservado a las tarifas y cobros de MiCole.

## Importes emitidos y abonos

Una cuota emitida **no se puede disminuir**. Lo comprueban triggers de PostgreSQL tanto para cuotas escolares como para cobros MiCole, además de la interfaz. No se puede cambiar el importe de una cuota pagada o anulada.

Dirección puede **Aumentar importe** en una cuota escolar pendiente, con motivo. Solo el propietario puede aumentar un cobro MiCole. Si existe una reserva QR, primero se debe comprobar o cancelar con el banco; no se modifica una cuota mientras su QR está activo. El cambio conserva los abonos y queda auditado con importe anterior, importe nuevo y motivo.

Ejemplo: cuota de Bs 100, abono de Bs 40 → importe Bs 100, abonado Bs 40, saldo Bs 60. El abono no convierte la cuota en una de Bs 60. Las reglas de acceso siguen siendo 50% y 100% para las últimas dos cuotas.

## Institución de Pinitos Montessori

Por solicitud del propietario, se desactivó su marca de institución de pruebas. Se conservaron datos, precios y credenciales. La operación se registró con la identidad del propietario y revocó sesiones de prueba anteriores. Para la operación escolar del propietario se utiliza el acceso normal de soporte; los pagos de producción ya no quedan bloqueados por esa marca.

## Verificación y operación

Migraciones `202610180001_pricing_and_issued_charges.sql` y `202610180002_pricing_activation_messages.sql`. Aplicar con `npm run supabase:migrate:pricing`; sin `--apply`, el script valida y revierte.

`npm run supabase:smoke:pricing` comprueba tarifas, inscripción, precio de licencia, descuentos, cuota emitida, permisos, abonos e incrementos con usuarios y registros temporales. Termina en rollback, no hace llamadas al banco y no modifica tarifas reales. Los casos de base se encuentran en `tests/pricing-database.test.ts`, y los formularios en `tests/pricing-live.e2e.spec.ts` y la suite móvil.
