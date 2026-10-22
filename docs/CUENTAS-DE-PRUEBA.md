# Pruebas persistentes de roles

Existe una institución separada, **MiCole · Institución de pruebas**. Sus cuentas de Dirección, Docente, Familia y Estudiante usan el login normal de correo y contraseña en web y Android. Los permisos se obtienen de Supabase; elegir un correo o cambiar datos locales no concede un rol. El superadmin sigue siendo la cuenta real del propietario.

Las credenciales están fuera del repositorio, en `~/.config/micole/cuentas-pruebas.json`, con permisos `0600`. No se precargan ni se publican en el login. Comparte ese acceso solo con las personas que probarán el sistema. Se pueden abrir varias sesiones en perfiles del navegador distintos; para cambiar de cuenta en Android, cierra sesión primero.

Los cambios de la institución se guardan en Supabase. Usa únicamente datos ficticios: este entorno no es la demo aislada de `micole-demo.vercel.app`, que sigue guardando cambios solo en el navegador. La institución de pruebas contiene un aula, dos materias, un docente asignado, una estudiante con su madre vinculada, una tarea, un comunicado, un evento y cuotas futuras de ejemplo.

## Límites del entorno

- La exención de habilitación existe en un registro privado específico. No simula el pago de Bs 500, no modifica el crédito cifrado ni crea recibos de ingresos de MiCole.
- La institución no emite licencias ni activaciones reales y no aparece en el directorio de la landing.
- Baneco de producción está bloqueado para esta institución, incluso si el propietario apaga su indicador de pruebas. Las credenciales bancarias reales y las de certificación permanecen separadas.
- Los cobros de mensualidades registrados por Dirección son datos de ejemplo de esta institución; no equivalen a dinero recibido.
- Las cuentas ficticias no pueden vincularse a otra institución, a sus niños o a sus docentes. Conservan el rol asignado.
- El propietario puede suspender o restaurar el acceso desde el indicador de institución de pruebas. No conviertas esta institución en una institución de clientes.

## Llegada del docente por GPS

Google Maps no es necesario para marcar entrada. La app solicita la ubicación al marcar; el servidor comprueba las coordenadas, la distancia al centro de la sede, la precisión, la antigüedad de la ubicación, el docente autorizado y su turno. La hora de asistencia procede del servidor.

1. Entra con Dirección en **Asistencia del personal → Ubicación y reglas**.
2. Estando físicamente en el lugar de prueba, usa **Usar mi ubicación** y guarda el centro. Comienza con 150 metros de radio y 50 metros de precisión máxima. No se han inventado coordenadas para la sede.
3. El docente de prueba tiene un turno de 07:00 a 23:00 todos los días para facilitar la prueba; ajusta el horario antes de usar una sede real. Los descuentos no se activan al crear estas cuentas.
4. Cierra sesión y entra con el docente. Concede ubicación precisa mientras usas la app, abre **Mi asistencia** y pulsa **Verificar mi ubicación**.
5. Dentro del radio y con precisión suficiente se habilita **Marcar entrada**. Al pulsarlo se obtiene una ubicación nueva. Fuera del radio no se permite marcar. Comprueba después la salida y el registro de Dirección.

La ubicación física en Android debe comprobarse con el APK nuevo; las pruebas de interfaz usan ubicaciones controladas y no equivalen a una marcación física real. Wi-Fi puede añadirse como comprobación adicional más adelante; conocer un nombre de red no acredita por sí solo presencia en la sede.

## Aprovisionamiento y verificación

```sh
node scripts/migrate-persisted-testing.mjs                 # Validación con rollback
node scripts/migrate-persisted-testing.mjs --apply
MICOLE_SUPABASE_CLI=/ruta/al/binario/supabase node scripts/setup-testing-accounts.mjs --apply
```

El script usa Auth Admin `createUser` con `email_confirm: true` únicamente para estas cuentas ficticias. No desactiva la confirmación global, no envía enlaces, no modifica contraseñas de cuentas existentes y puede reanudarse. Guarda las credenciales antes de crear usuarios y reutiliza las cuentas de su propio identificador privado. El archivo debe conservarse para reanudar; no lo borres ni lo subas al repositorio.

La validación comprueba el login real de los cuatro roles, sus vínculos, que no tengan soporte/superadmin, que no consulten otra institución y que el portal infantil quede habilitado. Los tests de base de datos cubren el crédito real intacto, RLS, restricciones de escritura y bloqueo de Baneco de producción.
