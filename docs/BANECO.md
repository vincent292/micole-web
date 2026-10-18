# Pagos con QR Simple de Baneco

MiCole usa el mismo contrato bancario que la integración de saas-food: cifrado, autenticación, generación de QR, consulta de estado y cancelación. El adaptador vive en `supabase/functions/bank-qr`; ninguna contraseña bancaria se incluye en Vite, Expo, enlaces públicos ni APK.

## Configurar una cuenta

En Configuración, el superadmin administra la **cuenta Baneco de MiCole**. Dirección configura la **cuenta de su institución**. Son conexiones independientes: las mensualidades y actividades nunca usan la cuenta de MiCole como reemplazo de una institución sin banco configurado.

1. Introducir un nombre para reconocer la conexión y elegir certificación o producción.
2. Indicar usuario API (`userName`), contraseña (`password`), llave AES (`aesKey`) y cuenta de abono autorizada (`accountCredit`). El código de sucursal es opcional si Baneco no lo asignó.
3. Elegir si contraseña y cuenta ya vienen cifradas por Baneco. En ese caso no se exige llave AES; en el otro formato, el servidor cifra ambas mediante la API bancaria.
4. Guardar, comprobar la autenticación y habilitar los cobros QR.

Las credenciales se almacenan cifradas en Supabase Vault. Para conservarlas al editar el nombre, dejar **todas** vacías. Para sustituirlas, completar el nuevo conjunto. Cada cambio genera una versión para poder consultar los QR emitidos con la conexión anterior. Deshabilitar cobros impide nuevos QR y conserva la conciliación de los existentes. No hay una URL arbitraria configurable: solo se aceptan los hosts oficiales de Baneco.

Comprobar la conexión verifica la autenticación API. El primer cobro controlado confirma también la cuenta de abono y la habilitación bancaria del producto. No se ha hecho un pago real como parte del desarrollo.

## Cobrar cuotas

En Caja se pueden seleccionar varias cuotas y modificar el importe de cada abono antes de generar un QR. El servidor calcula el total en bolivianos y valida los saldos, entre Bs 0,01 y Bs 50.000 por QR. La imagen la emite Baneco; tiene importe fijo, un solo uso y vence ese día, con fecha de Bolivia.

Se puede descargar la imagen en web o compartirla en Android. Los enlaces de pago se crean para cuotas e importes concretos y se pueden enviar manualmente por WhatsApp; no se envían mensajes automáticamente. El destinatario no necesita iniciar sesión para generar o consultar el QR de ese enlace. Un enlace vencido, revocado o con saldos que cambiaron requiere revisión.

El pago confirmado crea un recibo bancario, aplica cada abono una sola vez y guarda la solicitud de factura cuando se indicó nombre, NIT/CI y celular. La emisión fiscal sigue siendo manual en el módulo Facturas. Las reglas de acceso existentes siguen usando los abonos: mínimo 50% y las últimas dos cuotas al 100%.

Las activaciones y liquidaciones de licencias se pagan en **Servicios MiCole** o **Facturación MiCole** usando la conexión del propietario. La familia solo puede pagar activaciones ligadas a sus hijos; Dirección puede pagar la liquidación de su institución.

## Confirmación y recuperación

- Solo una consulta autenticada a Baneco confirma el pago. El navegador, una imagen, un comprobante o el callback bancario por sí solos no lo acreditan.
- Se comprueban QR, importe, moneda, sucursal cuando corresponde y referencia bancaria. Los datos incompatibles quedan en revisión.
- Repetir la misma solicitud recupera el QR reservado. Una reserva activa impide emitir otro QR o registrar efectivo para las mismas cuotas; primero se debe comprobar o cancelar con el banco.
- Si hay timeout durante la generación, se conserva la solicitud. No se reintenta a ciegas. Si se conoce el ID bancario, la conciliación puede continuar. Si el banco no devolvió ID, corresponde consultar al banco con la referencia `MC-…` antes de resolver manualmente.
- Si Baneco confirmó el dinero pero el saldo cambió, se conserva el pago como confirmado y su aplicación queda en revisión, sin duplicar recibos. Dirección o el propietario, según el destino, pueden reintentar su aplicación después de revisar los saldos.
- Los QR de certificación nunca acreditan cuotas reales. Solo una institución marcada expresamente de prueba puede usar esos pagos para probar el acceso. Las instituciones de prueba no permiten generar cobros de producción.

## Operación en Supabase

Aplicar `npm run supabase:migrate:bank`, después `npm run supabase:setup:bank`. El segundo comando despliega la función y programa una conciliación cada minuto con una clave privada de worker en Vault y secretos de Edge. Requiere permisos de administración del proyecto y la conexión PostgreSQL configurada, sin imprimir credenciales.

Callback opcional que se puede registrar en Baneco:

`https://<project-ref>.supabase.co/functions/v1/bank-qr/notify`

El callback solo adelanta una consulta autenticada; la conciliación programada funciona aunque ese aviso no llegue. La interfaz consulta el estado guardado, no realiza una llamada bancaria cada cinco segundos.

Pruebas: `tests/baneco.test.ts` valida el contrato con transporte simulado; `tests/baneco-database.test.ts` valida permisos, enlaces, abonos, recibos, factura e idempotencia; los flujos web y Android tienen pruebas de navegador. Estas pruebas no sustituyen el primer cobro bancario controlado con las credenciales del titular.
