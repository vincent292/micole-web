# MiCole

App para colegios, kínderes y guarderías: React 19, Vite, TypeScript, Supabase y galería privada preparada para Cloudflare R2. Identidad MiCole con los logos originales, azul `#3D6EF7`, verde `#54D2A0`, amarillo `#FFC857`, Poppins para marca/títulos e Inter para la interfaz.

## Ejecutar

Node 22.12+.

```bash
npm install
# Solo si todavía no tienes un .env configurado:
cp .env.example .env
npm run dev
```

- `/`: landing pública.
- `/login`: ingreso por los métodos habilitados en Supabase.
- `/auth/callback`: retorno de Google o del enlace de correo.
- `/app/overview`: panel privado; demás módulos bajo `/app/`.
- `/app/reports`: reportes financieros de Dirección y superadministración.
- `/app/cash`, `/app/invoices`: cobros, recibos y solicitudes de facturación.
- `/pago/TOKEN`: enlace público temporal de conceptos e importe con generación de QR Baneco y confirmación bancaria.
- `/invite/TOKEN`: aceptación de invitación por el correo verificado.
- `/inscripcion/TOKEN`: ficha de cuidado sin login, compartida por Dirección con madre o padre.

Las rutas anteriores, como `/students`, redirigen al módulo correspondiente dentro de `/app`. La landing no carga registros privados; el código del panel se descarga al abrir el ingreso o la app. Incluye manifest para añadir un acceso al celular; no es todavía una app Android nativa ni ofrece funcionamiento offline.

## Estado de esta instalación

Las catorce migraciones están aplicadas al proyecto vinculado, incluida `202610150004_realtime_notices.sql`. Los campos de identidad institucional y el directorio público están activos en Supabase; las comprobaciones remotas de instituciones pasan dentro de una transacción que termina en `ROLLBACK`. La app está en modo `live`. Se configuraron la URL de desarrollo, los callbacks locales, el corte diario y la reserva de correo del primer superadmin. El ingreso por correo y **Google están habilitados**; se verificó la redirección inicial a Google. Completar el ingreso con la cuenta elegida sigue siendo una comprobación interactiva. No se enviaron correos de prueba ni se dejaron personas, colegios o alumnos ficticios en el proyecto.

El correo de administrador se reserva en una tabla privada de servidor. Solo se concede superadmin cuando Supabase confirma ese correo. Ningún usuario puede asignarse permisos desde React o aprobar su propio colegio.

Para revisar la conexión:

```bash
npm run supabase:verify
```

Para repetir la prueba de flujos en tu Supabase:

```bash
npm run supabase:smoke
```

Esta prueba utiliza una transacción, usuarios y registros temporales, y termina con `ROLLBACK`. Comprueba inscripción, activación, cuotas, invitaciones, permisos, pagos, notificaciones y alta de instituciones, sin dejar datos ficticios ni ejecutar transacciones bancarias. También comprueba el acceso de soporte, su caducidad, el aislamiento por colegio y la autoría real del propietario.

## Poner en marcha un nuevo entorno

```dotenv
VITE_APP_MODE=live
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=TU_CLAVE_PUBLICA
VITE_R2_ENABLED=false
SUPABASE_DB_PASSWORD=TU_PASSWORD_DE_BASE
MICOLE_ADMIN_EMAIL=TU_CORREO_DE_ADMINISTRADOR
```

Las variables `VITE_` son públicas. Nunca colocar en ellas claves `service_role`, secret keys, contraseñas o credenciales bancarias/R2. Los scripts también admiten el nombre anterior `databasepasword` para la contraseña de base.

```bash
npx supabase login
npx supabase link --project-ref TU_PROJECT_REF
npx supabase db push --dry-run
npx supabase db push
npm run supabase:setup
node scripts/configure-auth.mjs
```

Las migraciones son `001_initial`, `002_workspace`, `003_billing_cycle`, `004_micole_operations`, `005_invitation_lifecycle`, `202610140001_platform_support`, `202610140002_family_enrollment` `202610140003_support_registered_parents` `202610140004_financial_reports` `202610140005_institution_identity`, `202610150001_student_access`, `202610150002_school_operations`, `202610150003_collections_invoices` y `202610150004_realtime_notices`. Están pensadas para un proyecto nuevo. El script de configuración de Auth lee la configuración remota y modifica Site URL, callbacks y confirmación de correo, conservando los otros ajustes. La reserva de administrador y el cron se configuran desde servidor.

## Primer uso

1. Abre `/login` e ingresa con el correo reservado para el superadmin. Puedes usar Google o el enlace de correo con esa misma cuenta verificada.
2. En superadministración, crea y activa una institución. Invita a su directora desde la tarjeta del colegio.
3. También puedes recibir solicitudes desde la landing: la responsable entra, completa los datos del colegio y envía la solicitud. Superadmin la aprueba; se crea la institución y se asigna dirección a la cuenta verificada que la solicitó.
4. Dirección crea primero las aulas con gestión, horario, cupos y precio; después registra docentes y sus aulas. Publica y aprueba la lista anual de materiales antes de inscribir. Comparte las invitaciones de docentes.
5. Inscribe alumnos con CI y RUDE opcional, nombres completos y correos distintos de madre y padre. Sus cuentas verificadas quedan vinculadas a todos sus hijos. Comparte la ficha de cuidado por WhatsApp desde la fila del estudiante; revisa y aprueba la respuesta, o complétala tú misma.
6. La inscripción guarda al alumno y su plan de 1–36 cuotas juntos, con mes inicial/final. Superadmin registra la activación de Bs 50; Dirección activa al alumno. La familia completa su ficha de salud y emergencia.

El panel de superadmin tiene resumen de plataforma, instituciones, solicitudes, cobros MiCole, reportes por institución, soporte, auditoría e integraciones. No carga fichas de alumnos ni registros del cuaderno.

**Soporte y probar roles** está reservado al propietario cuyo correo figura en la lista privada. Elige colegio, rol, usuario y un motivo (10–500 caracteres). El acceso caduca en 30 minutos y una barra permite volver a superadmin. Dirección incluye una entrada de soporte para preparar colegios nuevos; no se asigna un rol permanente a tu cuenta. Docente requiere una cuenta vinculada por invitación; Familia se vincula por el correo confirmado que registra Dirección. El propietario puede seleccionar su propia cuenta de padre o docente si tiene un vínculo real. Sus permisos y bloqueos se conservan. Las modificaciones guardan tu identidad real y la sesión en auditoría; los mensajes indican «soporte MiCole». Una nueva sesión revoca la anterior.

El selector de perfil ofrece únicamente los roles autorizados de la cuenta. En `demo` se pueden explorar las cuatro vistas con datos locales. El modo conectado no usa ejemplos como fallback si falla la base.

## Funciones operativas

- Instituciones, identidad visual, logo, NIT, dirección, teléfono y sitio web. Crear y editar desde superadmin; Dirección edita su institución. Logo y banner por HTTPS o archivo PNG/JPG/WebP hasta 10 MB, convertidos y reducidos a WebP en el navegador. Incluye Google Maps y contacto privado de Dirección.
- Landing con Motion: hero escalonado, revelado al scroll, interacciones, barra de lectura y vista ilustrativa navegable con teclado. Animaciones finitas y respeto a movimiento reducido.
- Instituciones afiliadas: sección vacía hasta que existan instituciones reales; directorio público automático de instituciones activas con visibilidad habilitada, carrusel táctil/teclado, logos e iniciales como alternativa. No se muestran registros de ejemplo como clientes.
- Solicitud y aprobación de incorporación con cuenta verificada y asignación controlada de dirección.
- Docentes, estado e invitaciones, aulas con varias maestras y maestras en varios cursos.
- Inscripción transaccional con activación pendiente, alta/baja y acceso temporal por deuda.
- Familia con varios hijos. Acceso exclusivo de madre y padre mediante los correos registrados por Dirección; los contactos de emergencia no reciben cuentas.
- Ficha por WhatsApp sin login: alergias, alimentos, seguro, condiciones de salud, instrucciones y dos contactos de emergencia. El primer contacto es obligatorio; el segundo es opcional. Dirección revisa la respuesta o completa directamente la ficha.
- Enlaces de ficha que vencen en 7 días, se retiran o reemplazan; respuesta única e idempotente. No permiten leer los datos médicos existentes ni cambiar curso, tarifas o responsables.
- RUDE opcional y CI, con control de duplicados dentro de la institución; nombres y correos separados de madre/padre. Cambiar el correo de un padre revoca el vínculo anterior.
- Documentos privados de inscripción: CI, certificado de nacimiento, seguro y otros, en PDF/JPG/PNG/WebP hasta 5 MB. La subida real requiere R2 configurado y la función desplegada. Dirección carga; Dirección y padres autorizados consultan. Docentes y contactos de emergencia no tienen acceso a los archivos.
- Planes de 1–36 meses: mensualidad, matrícula y merienda opcionales, vencimiento, descuento temporal y prorrateo del primer mes.
- Ajustar o deshabilitar descuentos sobre cuotas no pagadas, conservando los pagos registrados.
- Caja registra efectivo, transferencia o QR corroborado manualmente, con recibo y referencia; admite abonos, varias cuotas y anticipos sin apertura/cierre diario. Familia no puede marcar cuotas como pagadas.
- Facturación SaaS separada: activación y licencias por institución. Corte recurrente sin duplicar cargos.
- Facturas: solicitudes por recibo con razón social, NIT/CI y celular, exportación CSV y seguimiento de emisión manual. Vista previa sin validez fiscal; no emite factura SIAT.
- Cuaderno por estudiante o por toda un aula: actividades, alimentación, descanso, observaciones y tareas.
- Comunicados generales de dirección y por curso de docentes.
- Agenda, tareas, cumpleaños, materiales, notas y recomendaciones.
- Inbox por estudiante, compartido por sus responsables, docentes asignados y Dirección. Realtime utiliza señales por colegio con RLS, sin datos personales, y recarga selectiva; los cambios en segundo plano esperan al cierre del modal para conservar escritura, foco y scroll. No hay sondeo cada minuto.
- Permisos de ausencia y recogidas con persona, documento y placa; revisión por dirección o docente del aula.
- Notificaciones por mensajes, comunicados, permisos, pagos e incorporación. Lectura individual persistente, con acceso sujeto a vínculos y deuda.
- Historial de altas, cambios de estado y cobros; visible para dirección de su colegio y superadmin. No guarda datos médicos, claves ni tokens en los resúmenes.
- Galería individual con función R2 preparada, acceso firmado y validación de objetos.
- Reportes financieros con cuotas emitidas, ingresos verificados, pendientes, mora y gráfico mensual. Dirección filtra por período, curso actual y estudiante; superadmin consulta únicamente licencias y activaciones por institución.
- Detalle paginado de cuotas, cobros y morosos; estado de cuenta por estudiante en el período elegido. CSV de todos los resultados filtrados (con protección frente a fórmulas) e impresión/guardado PDF desde el navegador.
- Entradas y transiciones cortas para páginas, tarjetas, modales y landing; respeto a movimiento reducido y validación responsive desde 320 px.
- Exportación JSON de registros visibles y restauración únicamente del entorno local.

## Cobros y acceso

**MiCole:** Bs 50 de activación una vez por estudiante, y Bs 29 por mes activo. La activación no incluye la licencia del primer mes.

**Colegio:** cada mensualidad = tarifa escolar + merienda + Bs 29 de licencia − descuento. Matrícula aparte si aplica. El descuento no reduce la licencia y se evalúa por el vencimiento. El primer mes puede prorratear mensualidad y merienda. La institución cobra sus cuotas y liquida la licencia a MiCole por separado.

La agenda familiar requiere inscripción activa, activación pagada, ficha completa e inexistencia de cuotas vencidas. El acceso temporal conserva la deuda y no evita la activación ni la ficha. Los pagos y la ficha de cuidado siguen disponibles. Las reglas se aplican en la base, incluso si alguien intenta consultar directamente la API.

La baja mantiene deuda histórica y cancela cuotas futuras no pagadas. Al terminar un plan, el corte continúa con la tarifa vigente mientras el alumno siga activo. La liquidación congela la cantidad de activos al generarla; no se recalcula una liquidación ya emitida.

El job `micole-corte-diario` ejecuta el motor a las 00:05 de Bolivia. No confirma pagos ni mueve dinero. Puede ejecutarse también desde **Facturación SaaS → Ejecutar corte del mes**.

## Landing e identidad institucional

La raíz `/` utiliza Motion para las animaciones y conserva el scroll nativo. El paquete de funciones de animación se carga por separado con LazyMotion. La vista del panel es ilustrativa e interactiva; los botones de ingreso llevan al sistema real.

En **Superadmin → Instituciones → Nueva institución**, registra nombre, ciudad y directora, y completa logo, NIT, dirección, teléfono y web. Puedes subir un archivo o pegar una URL HTTPS; el archivo tiene prioridad. Desde **Editar institución** o **Dirección → Configuración → Editar identidad**, actualiza estos datos. NIT y dirección son opcionales para que se pueda completar el registro después.

Las instituciones nuevas permanecen pendientes hasta activarlas. Al estar activas y tener marcada **Mostrar institución en la página de MiCole**, aparecerán en la landing automáticamente. Con una sola se presenta una tarjeta; cuando hay varias que no caben, se muestran controles de carrusel, desplazamiento táctil y teclado. Los logos ausentes o que fallan muestran las iniciales. Desactivar la institución o retirar la marca de visibilidad la elimina del directorio público.

La landing consulta exclusivamente `landing_institutions` sin sesión, cookies ni contexto de soporte. El RPC devuelve nombre, logo, ciudad, web e identificador; no incluye NIT, dirección, contactos personales ni registros escolares. Se actualiza al abrir la página, recuperar el foco y cada minuto mientras está visible. Por ahora no hay afiliaciones inventadas; `staticInstitutions` en `src/lib/publicInstitutions.ts` permite añadir una lista manual de instituciones reales si se necesita más adelante.

Para probar el directorio contra Supabase, dentro de una transacción que se revierte:

```bash
npm run supabase:smoke:institutions
```

Referencias de implementación: [Motion para React](https://motion.dev/docs/react), [LazyMotion](https://motion.dev/docs/react-lazy-motion) y [movimiento reducido](https://motion.dev/docs/react-use-reduced-motion).

## Reportes

Abre **Reportes** desde Dirección o superadministración. Aplica el período y, en Dirección, el curso o estudiante; en plataforma, la institución. Las pestañas muestran resumen, cuotas/licencias, movimientos y morosos (solo Dirección). «Ver estado de cuenta» selecciona al estudiante y abre sus cuotas. Exportar CSV incluye todos los resultados de la pestaña después de aplicar búsqueda y estado, aunque la tabla esté paginada. **Imprimir / Guardar PDF** usa el diálogo del navegador y expande todas esas filas, también con Ctrl+P.

Los cobros usan `paid_at` del registro de pagos, en la zona horaria de Bolivia; los ingresos escolares requieren `verification_state=verified`. Las cuotas escolares se filtran por vencimiento, las licencias por mes de emisión y las activaciones por creación. Un cobro puede pagar una cuota de otro período, por eso «Cobrado» no es la suma de cuotas marcadas pagadas. Pendiente y mora representan el estado actual de las cuotas que vencen en el período, sin anulaciones; no reconstruyen saldos históricos ni incluyen deudas fuera del rango. El curso es el actual, pues aún no hay historial de reinscripción anual.

El reporte de plataforma no devuelve identidades de niños. Cuenta licencias por mes facturado, no alumnos únicos del período. Activaciones y mensualidades se liquidan por separado. Los filtros y roles se verifican en el RPC `financial_report`, con el contexto de soporte vigente. Este RPC devuelve el conjunto completo sin el límite habitual de filas REST. Las descargas son informativas; no emiten facturas fiscales.

Para repetir la prueba de reportes contra Supabase, sin guardar personas ni registros de prueba:

```bash
npm run supabase:smoke:reports
```

## Google y correo

En Supabase Authentication → Providers habilita Google con el Client ID y Client Secret de Google Cloud. En Google, el redirect URI autorizado es:

```text
https://TU-PROYECTO.supabase.co/auth/v1/callback
```

El retorno a la aplicación se configura en Supabase URL Configuration:

```text
http://localhost:5173/auth/callback
```

La pantalla detecta los proveedores habilitados. Google aparecerá al activarlo. El ingreso por correo utiliza un enlace personal de un solo uso. Para incorporar cuentas fuera del equipo del proyecto, configura el servicio SMTP apropiado de Supabase o utiliza Google.

Fuentes: [Google Auth](https://supabase.com/docs/guides/auth/social-login/auth-google), [redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

## Cloudflare R2

1. Crea un bucket privado y credenciales restringidas a ese bucket.
2. Despliega `supabase/functions/r2-media`. El gateway heredado no valida el JWT; la función lo verifica con `auth.getUser()` y comprueba RLS.
3. Configura secrets: `APP_ORIGIN`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`. No se colocan en variables `VITE_`.
4. Configura CORS del bucket para el origen de la app, métodos `GET`, `PUT`, `HEAD`, header `Content-Type` y exposición opcional de `ETag`.
5. Copia `.env.r2.example` a `.env.r2.local` (ignorado por Git), completa las credenciales y ejecuta `npm run supabase:setup:r2`. Verifica escritura/lectura/limpieza de un archivo sintético, CORS, despliega la función y comprueba que exige sesión.
6. Solo tras completar la verificación activa `VITE_R2_ENABLED=true` en `.env` y `EXPO_PUBLIC_R2_ENABLED=true` en el `.env.local` de Android. Reinicia los servidores de desarrollo para cargar el entorno.

`APP_ORIGINS` admite una lista de orígenes exactos separada por comas; conserva `APP_ORIGIN` para compatibilidad. La política del bucket está en `docs/r2-cors.json`. Android usa la misma función de Supabase sin enviar `Origin`, siempre con JWT y las comprobaciones de permisos. No necesita claves R2 ni URL pública del bucket. `npm run supabase:verify:r2` comprueba la conexión sin desplegar.

Subida con URL de 120 segundos, validación de tipo/tamaño (hasta 5 MB) al finalizar, y descarga autorizada con URL de 5 minutos. Sin estas credenciales la galería muestra que necesita configuración. [Referencia R2](https://developers.cloudflare.com/r2/buckets/cors/).

## Pruebas

```bash
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Las pruebas locales aplican las migraciones a PostgreSQL embebido (PGlite), simulan roles distintos y verifican RLS, facturación, onboarding, auditoría y notificaciones. PGlite incorpora UUID/SHA-256; se omite únicamente la instalación de `pgcrypto`. Las pruebas de navegador cubren landing, rutas, tipografías, celular/tablet, separación de plataforma y flujos de gestión. El cliente conectado se comprueba con respuestas de API controladas; la prueba remota valida las funciones y políticas reales en Supabase.

`supabase:smoke` ejecuta pruebas contra el servidor vinculado y las revierte. La función R2 puede verificarse con `deno check --node-modules-dir=none supabase/functions/r2-media/index.ts`. La entrega de correos, Google y R2 necesitan pruebas con las cuentas/proveedores reales cuando se configuren.

## Integraciones pendientes

- Baneco QR Simple ya está integrado: falta que cada titular configure y compruebe sus credenciales, y realizar el primer cobro controlado. Consulta [la guía bancaria](docs/BANECO.md).
- Probar una carga desde las aplicaciones con una sesión autorizada; bucket, credenciales y función R2 ya están configurados.
- SIAT, si se integra un proveedor de facturación.
- Aplicación Android nativa y push.
- Antes del lanzamiento público: consentimientos de imágenes, retención, restauración de backups y ajustes/pagos parciales si se necesitan.

## Código

`src/App.tsx`: rutas públicas y carga diferida del panel. `src/WorkspaceApp.tsx`: sesión y navegación privada. `src/features/public`: landing, ingreso e incorporación. `src/lib`: autenticación, adapter Supabase, store y reglas financieras. `supabase/migrations`: esquema, RPC, RLS, cron y operación. `scripts`: preparación y comprobación remota. `tests`: lógica, SQL y navegador. Identidad documentada en `docs/BRAND.md`.

## Ficha familiar por WhatsApp

Dirección abre Estudiantes → Ficha familiar y WhatsApp → selecciona Madre/Padre → Crear enlace de ficha → Compartir por WhatsApp. El botón prepara un mensaje para que Dirección lo envíe; MiCole no envía mensajes automáticamente.

El enlace abre una ficha en blanco y permite una respuesta. Se expone únicamente el colegio, el nombre del niño, el destinatario como madre/padre y el estado; no los correos, CI, RUDE ni la información médica previamente guardada. El backend acepta solo los campos de cuidado. La respuesta queda «Por revisar» hasta que Dirección la apruebe. Desde «Completar cuidados» Dirección también puede llenar los campos. Crear otro enlace o completar directamente la ficha invalida los enlaces pendientes.

La vinculación de cuentas es independiente del enlace público: requiere el correo registrado y confirmado en Supabase. Se activa la confirmación de email para evitar atribuir hijos a una cuenta que no haya verificado ese correo ([documentación de Supabase](https://supabase.com/docs/guides/auth/general-configuration)). Los registros anteriores se conservan; las nuevas inscripciones exigen nombres y correos de ambos padres. Google está habilitado y su redirección fue comprobada. La entrega SMTP externa sigue pendiente de validación.

En desarrollo un enlace `localhost` solo se abre en el equipo que ejecuta la app. Para compartirlo con los padres fuera de ese equipo, publica la web con HTTPS y configura las URLs de Auth de ese dominio. Los documentos médicos se guardarán en R2 privado; no se suben archivos reales mientras el almacenamiento esté pendiente.

## Acceso de estudiantes y consulta familiar

Dirección puede habilitar o revocar el acceso opcional desde **Estudiantes → Acceso del estudiante**. Requiere un correo propio, distinto al de padres/personal, confirmado mediante Google o enlace de correo. El estudiante consulta tareas, calendario, materiales y comunicados de su curso mediante un portal mínimo de solo lectura; no se le conceden permisos de consulta sobre fichas privadas, salud, pagos, documentos ni conversaciones. Se conserva el bloqueo por deuda, inscripción y ficha pendiente. El propietario puede reproducir una cuenta infantil real mediante soporte con motivo y caducidad.

Los padres consultan actividades, calendario mensual interactivo, comunicados y notas de cada hijo sin editarlos. Las solicitudes familiares y mensajes conservan sus permisos originales. El calendario permite cambiar de mes, seleccionar un día y volver a todas sus actividades.

`npm run auth:check` verifica proveedores y retorno inicial hacia Google sin iniciar sesión. `npm run supabase:smoke:students` verifica los permisos reales con datos temporales y `ROLLBACK`. Más detalles en [docs/AUTH.md](docs/AUTH.md).


## Aulas, caja y operación diaria

Consulta [docs/OPERATIONS.md](docs/OPERATIONS.md) para las reglas de inscripción, pagos parciales, materiales con aprobación, cumpleaños, Maps y credenciales bancarias. Las cuotas iniciales permiten acceso al alcanzar el 50 %; las últimas dos exigen el 100 %. El saldo sigue pendiente hasta completarse. Caja permite generar QR dinámicos con Baneco, además del registro manual. Las cuentas MiCole e institucionales son independientes; la confirmación se verifica en el servidor. Consulta [configuración Baneco](docs/BANECO.md).

`npm run supabase:smoke:operations` comprueba estos flujos contra Supabase en una transacción que termina en `ROLLBACK`. Para actualizar una instalación que ya tenga las once migraciones anteriores: `npm run supabase:migrate:operations`.

## QR Baneco

Configuración bancaria, abonos seleccionados, enlaces públicos, conciliación automática y revisión de pagos: [docs/BANECO.md](docs/BANECO.md). El adaptador y su worker ya están desplegados; las credenciales del titular se guardan desde Configuración. No se han realizado pagos bancarios reales durante el desarrollo.

## Precios configurables

El propietario configura tarifas MiCole generales o por institución. Dirección modifica precios para nuevas cuotas; las emitidas no se pueden disminuir y admiten abonos que conservan el saldo. Consulta [tarifas y cuotas emitidas](docs/PRICING.md).

Estado de Cloudflare R2 y continuidad para Codex: [docs/R2.md](docs/R2.md).

## Cuidados, gestiones e importación

Ver [operación de cuidados, libretas e historial](docs/SCHOOL_LIFE.md) y [correo dedicado SMTP](docs/EMAIL.md). Los cuatro módulos están integrados en web y Android; esta entrega no genera un APK.
