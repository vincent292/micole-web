# Materias, tareas y formularios

Cambios del 16 de octubre de 2026, compartidos por la web y Android.

## Formularios

Los modales web mantienen título, navegación y acciones fuera del área desplazable. En móvil ocupan el alto disponible, y en pantallas amplias distribuyen campos en columnas. Institución, inscripción, ficha de cuidados y tarea usan secciones que conservan todos los valores. La validación muestra la sección con el campo obligatorio pendiente antes de guardar.

Android mantiene Guardar y Cancelar visibles fuera del desplazamiento y ajusta el formulario al teclado. Los formularios largos se dividen por secciones; institución, inscripción y cuidados tienen nombres específicos para cada bloque. Los campos cortos se distribuyen en dos columnas en tablet. Corregida la pérdida de espacios al escribir nombres y textos en los formularios genéricos.

## Organización académica

Desde Aulas se abren Materias y Tareas del aula seleccionada. Las materias son opcionales: Dirección puede trabajar con actividades generales o habilitar materias por aula. Se incluye un catálogo inicial de Lenguaje, Matemáticas, Cálculo, Ciencias, Inglés y otras áreas. Buscar ignora acentos y mayúsculas. Una materia nueva se crea para esa institución al guardar; una materia ya existente se reutiliza.

Dirección asigna uno o varios docentes vinculados al aula. Un docente publica y revisa únicamente sus aulas y materias asignadas. Archivar una materia conserva el historial; habilitar materias no elimina las actividades generales anteriores.

## Tareas y entregas

Docentes y Dirección crean borradores, publican y cierran tareas. Cada tarea tiene aula, materia si corresponde, instrucciones, puntuación máxima y fecha límite opcional. Los vencimientos se guardan y muestran con el día de Bolivia; el último momento del día se interpreta en UTC-4. Se puede permitir o rechazar la entrega atrasada. Las fechas aparecen en la agenda sin duplicar eventos persistidos.

El estudiante habilitado entrega únicamente su propia tarea y puede corregirla si el docente la devuelve. Una entrega revisada queda cerrada para el alumno hasta que el docente la devuelva con comentarios. Dirección o el docente asignado revisan, agregan puntuación opcional y comentarios. La familia solo consulta las entregas y revisiones de su hijo; no entrega ni modifica publicaciones. La nota de una tarea no sustituye automáticamente la nota del período. Las notas del período también se ligan a la materia del aula y se validan contra los docentes asignados. En aulas sin materias se conservan valoraciones generales como Desarrollo integral.

Los permisos se verifican en Supabase, además de los botones. Bloqueos por ficha, estado y pagos se aplican también a las entregas. Cambiar de aula o revocar el acceso infantil elimina el acceso a las tareas y archivos del aula anterior. El superadmin necesita entrar en soporte para acceder a la operación del colegio; las mutaciones conservan la auditoría del usuario real.

La publicación, entrega y revisión generan avisos. Antes del envío se descartan las revisiones de versiones antiguas y publicaciones de tareas ya cerradas. Las revisiones de una nueva versión de la entrega tienen eventos diferentes para no perder el aviso de la corrección. El envío usa el worker FCM existente y respeta las preferencias y el horario de descanso.

## Archivos en R2

Se mantiene Cloudflare R2, por decisión del propietario. Con R2 deshabilitado se permite entregar texto y se explica que los archivos aún no están habilitados por la institución. No se utiliza un bucket alternativo de Supabase.

La integración admite hasta cinco archivos privados PDF, JPG, PNG o WebP de 5 MB por entrega. El servidor reserva una carga para el estudiante autorizado, entrega un PUT firmado de dos minutos, verifica el tamaño y formato reales con HEAD y confirma desde una función exclusiva del servidor. Descargar exige permisos actuales y genera un enlace firmado de cinco minutos. La carga pendiente caduca a los diez minutos. La cuenta de servicio y las credenciales R2 nunca van a la app.

Para activar archivos: configurar `APP_ORIGIN`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` y `R2_BUCKET` en secretos de la función, revisar CORS del bucket para la web y habilitar `VITE_R2_ENABLED` / `EXPO_PUBLIC_R2_ENABLED` al volver a publicar web y APK. R2 fue conectado al bucket privado `aulanexo-private`; las claves están en secretos de Supabase y los indicadores locales de web/Android están habilitados. La comprobación de proveedor verificó escritura, lectura, tamaño, CORS y retirada de un archivo sintético. No se generó APK ni se volvió a publicar la web.

## Base de datos

Migraciones `202610170001_learning_workspace.sql`  , `202610170002_student_subject_metadata.sql` y `202610170003_grade_subject_scope.sql` y `202610170004_learning_push_revision.sql`. La segunda amplía únicamente el indicador de materias del aula dentro del portal infantil que ya estaba restringido. `node scripts/migrate-learning.mjs` valida con rollback; `--apply` registra las migraciones en Supabase. No se cambian los roles mediante variables del cliente.
