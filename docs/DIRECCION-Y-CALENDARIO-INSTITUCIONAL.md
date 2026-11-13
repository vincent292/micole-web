# Dirección, información institucional y calendario

La web ordena Dirección y Secretaría por tarea: Inicio, Gestión académica,
Comunidad, Economía, Equipo y Administración. Resumen aparece primero; el listado
de estudiantes se ordena por apellidos y nombres. El acceso a cada módulo sigue
dependiendo del rol y de los permisos de la institución.

Planificación y apoyo abre un resumen con accesos a POA/PDC, apoyo pedagógico y
centralizadores. La información oficial se consulta desde la institución, sin
volver a escribirla en un formulario anual. En la interfaz, las gestiones se
identifican por su año, conservando los nombres históricos en la base de datos.

`schools.official_info` contiene código de unidad educativa, distrito,
departamento, autorización de funcionamiento y referencia normativa. Todos son
opcionales en Nueva institución / Editar identidad. La migración recupera el
perfil anual más reciente y conserva intactos los perfiles históricos. El RPC
`save_school` mantiene sus comprobaciones anteriores y valida los nuevos campos;
un cliente que los omite no los borra.

Centralizadores tiene acceso visible y una tabla de libretas publicadas con filtros
por curso y período, páginas de hasta 50 publicaciones y descarga CSV de la
selección completa. La nota mínima se consulta en la configuración institucional.
Los resultados incompletos no se convierten en cero ni se marcan como reprobados.
Si falla la consulta de la nota mínima, se informa el problema sin aplicar un
umbral supuesto. El informe sigue siendo interno y no sustituye al SIE.

El calendario escolar tiene acceso propio para Dirección, Secretaría, docentes
y familias/estudiantes autorizados. Usa `school_calendar_days`, compartido por
todos los cursos y niveles de la sede actual. La agenda de actividades permanece
separada del calendario que determina los días de clase.

Los descansos de varios días se agregan con `add_school_calendar_period` en una
sola operación, hasta 120 días de la misma gestión. Las fechas configuradas se
conservan; repetir la operación no genera duplicados. No se crean faltas ni se
envían comunicados automáticamente. Se conserva la auditoría por fecha y se emite
una señal de sincronización por lote. Los permisos siguen basándose en
`can_plan`; el formulario no permite elegir un paralelo para un feriado.

Migración: `node scripts/migrate-direction-info.mjs` valida y revierte;
`node scripts/migrate-direction-info.mjs --apply` aplica y actualiza PostgREST.

Validación: pruebas SQL de permisos y campos oficiales, descansos en Inicial,
Primaria y Secundaria, conservación de fechas y reintentos; formularios de alta y
edición; revisión visual de cuentas ficticias en escritorio y celular. Las
pruebas visuales de calificaciones y envío de formularios interceptan escrituras;
no publican notas ni configuran descansos reales.
