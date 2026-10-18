# Operación de MiCole

## Preparar una institución

1. Superadmin crea y activa la institución e invita a Dirección, o entra mediante soporte con motivo y caducidad.
2. Dirección crea aulas por gestión, nombre/paralelo, horario seleccionado, días, capacidad y mensualidad base. La capacidad cuenta estudiantes activos y pendientes; una baja libera el cupo. Puede cerrar el aula a nuevas inscripciones.
3. Registra los docentes, asignándolos a una o varias aulas. Un aula puede tener varios docentes. Los docentes vinculados pueden consultar sus aulas aunque todavía no tengan alumnos.
4. Crea y aprueba la lista anual de materiales del aula/gestión. Los docentes proponen; solo Dirección aprueba. Sin lista anual aprobada se impide una nueva inscripción, cambio de aula o reactivación. Las fichas existentes conservan su aula. Solo puede haber una lista anual aprobada por aula y gestión.
5. Inscribe al niño con CI, RUDE opcional y nombres/correos distintos de madre y padre. El formulario guarda estudiante y plan en una transacción: si falla una parte, se revierte todo. Selecciona meses inicial/final y cantidad de cuotas, mensualidad, merienda, matrícula, descuentos, vencimiento y prorrateo. El primer mes predeterminado es el actual de Bolivia.
6. Comparte manualmente la ficha de cuidado por WhatsApp; la familia completa alergias, alimentación, seguro y emergencias. Dirección revisa/aprueba, o la completa directamente. Activación de Bs 50 y licencia mensual MiCole siguen separadas de los ingresos institucionales.

Aulas permite abrir el directorio filtrado por curso. Estudiantes permite filtrar por aula y dar de baja con un motivo obligatorio. La baja conserva el historial, la deuda vencida y cualquier cuota con abonos; cancela solo cuotas futuras que no recibieron pagos. La reactivación vuelve a comprobar que el aula admite inscripciones y tiene cupo.

## Caja y acceso

Caja es un registro de cobros y recibos, sin apertura/cierre diario. Dirección puede seleccionar varias cuotas, abonar parte de una, adelantar meses y combinarlo en un recibo. Cada línea tiene importe y saldo; no se admite importe nulo, negativo, con fracciones menores a un centavo o superior al saldo.

- Cuotas del plan anteriores a las últimas dos: acceso al alcanzar el 50 % del importe, redondeado hacia arriba al centavo.
- Últimas dos cuotas: acceso al alcanzar el 100 %.
- Matrícula y cargos fuera del plan: pago completo. Los extras aprobados bloquean solo si Dirección selecciona esa condición.
- Se evalúan las cuotas vencidas y la cuota del mes actual del plan, aunque su fecha límite sea posterior. Las cuotas futuras no bloquean antes de su período/vencimiento.
- La activación inicial, estado de inscripción, ficha familiar y estado institucional siguen siendo requisitos. Un plazo temporal autorizado por Dirección permite acceso manteniendo la deuda.
- Un abono que habilita acceso conserva la cuota como pendiente hasta completar todo el saldo. Ni el navegador ni la familia pueden atribuirse un pago.

El servidor bloquea los cargos durante el cobro y usa un identificador idempotente: reintentar el mismo recibo no duplica ingresos; reutilizarlo con otros importes falla. Efectivo, transferencia y QR corroborado manualmente generan recibos con autor y fecha. QR exige marcar la comprobación del abono e introducir una referencia. La misma referencia QR/transferencia no puede usarse en dos recibos del colegio. Esto no constituye verificación bancaria automática.

Un docente puede corroborar cobros únicamente de materiales/actividades aprobadas de sus aulas; no puede cobrar mensualidades, modificar planes ni consultar datos fiscales. Los padres pueden consultar sus propios cobros y preparar enlaces, nunca confirmar pagos.

Los enlaces de pago caducan a las 48 horas. WhatsApp abre un mensaje para envío manual al número elegido; no se envía nada automáticamente. La página pública muestra solo institución, nombre mínimo, conceptos, importe y estado. No incluye CI, correos ni datos médicos. Si cambian los saldos, solicita un enlace nuevo; un abono completo del importe solicitado da el enlace por pagado aunque reste deuda en la cuota. La página puede generar el QR real de Baneco con la conexión habilitada del colegio. La confirmación proviene de una consulta autenticada al banco; consulta [la integración Baneco](BANECO.md).

## Facturación

Puede solicitarse al registrar el cobro o desde un recibo propio. Se requieren razón social/nombre, NIT/CI y celular. El importe es el dinero efectivamente recibido en el recibo, no el total de las cuotas seleccionadas. Una solicitud por recibo, pendiente o emitida, con filtros y exportación CSV para facturación manual. Dirección puede registrar el número de la factura emitida externamente. La vista previa indica «Sin validez fiscal»; no hay emisión SIAT automática.

## Materiales, actividades y cumpleaños

Materiales admite listas anuales, pedidos mensuales y específicos; Actividades admite salidas y dinámicas. Cada solicitud tiene aula, gestión, fecha, detalle y, opcionalmente, importe/vencimiento y bloqueo de acceso. Solo Dirección aprueba o rechaza con motivo. Al aprobar se publican calendario y comunicado; si hay costo, se crean participaciones y cobros para los estudiantes inscritos en ese momento. Los nuevos inscritos consultan la lista anual ya publicada, sin heredar automáticamente cobros de actividades pasadas.

Una publicación aprobada conserva su contenido; para un nuevo pedido se crea otra solicitud. El docente no puede saltarse la aprobación publicando materiales directamente ni editar/eliminar la entrada aprobada. La familia ve solo contenido aprobado. Se puede indicar no participación con motivo y cancelar el cargo; si ya hay un pago, Dirección debe revisarlo antes de cambiar la participación. No hay devolución automática.

El calendario obtiene los cumpleaños de la fecha de nacimiento de estudiantes vigentes. El corte diario existente genera avisos uno y dos días antes para Dirección, docentes asignados y padres del niño. Cada niño/año/anticipación se notifica una vez. El 29 de febrero se celebra el 28 en años no bisiestos. No se añade un trabajo periódico por familia.

## Institución, imágenes y Maps

Identidad permite ciudad seleccionada, dirección, teléfono institucional, celular y carnet de Dirección, logo, banner y ubicación. Carnet y celular de Dirección se guardan en una tabla privada, consultable solo por Dirección autorizada o plataforma; no están en el directorio público ni en el objeto escolar que ve la familia.

Archivos PNG/JPG/WebP de hasta 10 MB se convierten a WebP y se reducen en el navegador: logo de hasta 512 px; banner de hasta 1400×700 px. Se limita también el tamaño resultante para guardar las imágenes. La foto original no se sube. Los documentos privados de alumnos siguen usando la integración R2 y requieren configurarla.

Maps permite guardar un enlace de Google Maps y abrirlo. Para mostrar un mapa dentro del panel, pega la URL de «Compartir → Insertar un mapa» (también se acepta el iframe y se extrae su URL), o configura la variable pública opcional `VITE_GOOGLE_MAPS_EMBED_KEY` para buscar por dirección. Restringe esa clave por API y dominio desde Google Cloud. No se incorpora geocodificación ni autocompletado con una API sin configurar. El mapa se carga solo al solicitarlo.

## Realtime y estabilidad

Supabase Realtime publica `workspace_signals`, con colegio, revisión, tabla cambiada y fecha; no contiene mensajes, nombres, saldos ni imágenes. RLS controla qué colegio puede observar cada cuenta. La aplicación agrupa señales y recarga las colecciones afectadas; cambios que modifican permisos, vínculos o cobros fuerzan reconciliación completa. También reconcilia al reconectar o enfocar. No hay sondeo cada minuto.

Los cambios de fondo esperan mientras haya un modal abierto. El formulario captura sus valores antes de las comprobaciones asíncronas; conserva campos, foco y desplazamiento durante la escritura. La comprobación de identidad al enfocar también se difiere; salir de la sesión o terminar un soporte sigue teniendo efecto inmediato.

## Configuración bancaria y validación

Integraciones permite guardar proveedor, cuenta, entorno y claves bancarias por institución; superadmin tiene una configuración separada para MiCole. Las credenciales se cifran con Supabase Vault, nunca se devuelven a React ni se publican en variables `VITE_`. No se escriben en auditoría ni se incluyen en las señales. Si Vault no está disponible, guardar claves falla en lugar de almacenarlas sin cifrar. Cambiar proveedor/cuenta/entorno exige volver a introducirlas. La conexión Baneco se guarda, se comprueba y se habilita en pasos explícitos. El callback bancario solo adelanta una consulta autenticada; el worker programado verifica los QR aunque la app esté cerrada. Consulte [Baneco](BANECO.md) para certificación, credenciales y revisión de pagos.

Migraciones: `202610150002_school_operations.sql`, `202610150003_collections_invoices.sql`, `202610150004_realtime_notices.sql`. Para instalaciones con las once anteriores, `npm run supabase:migrate:operations` aplica las tres de forma transaccional. `npm run supabase:smoke:operations` comprueba permisos, datos privados, cuotas, abonos, recibos, facturas, enlaces, Vault y señales con datos temporales y `ROLLBACK`; no hace transacciones bancarias ni envía WhatsApp.

## Cambios de precios

Las tarifas de MiCole son configurables por el propietario. Dirección puede cambiar precios escolares para nuevas emisiones. Las cuotas emitidas no se reducen ni se recalculan al ajustar precios o descuentos. Los aumentos autorizados requieren motivo y no se permiten con un QR reservado. Los abonos conservan importe original y saldo. Consulta [PRICING.md](PRICING.md).
