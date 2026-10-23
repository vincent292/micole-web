# Horarios, evaluación boliviana y promoción anual

## Horarios de clases

Dirección entra en **Horarios de clases → Preparar horario**. Primero elige gestión, jornada, días, minutos por periodo y recreos; después carga todas las materias por paralelo, docente, periodos semanales y bloques consecutivos. Los docentes se asignan por materia/paralelo: quien enseña Matemáticas A puede ser distinto de Matemáticas B. Un mismo docente puede atender varios paralelos.

Un bloque de dos periodos de 40 minutos dura 80 minutos. La carga semanal siempre cuenta periodos, no horas de reloj. La referencia oficial de 2026 es 40 minutos por periodo. La jornada puede configurarse para los distintos tipos de institución; cualquier modificación requiere una elección explícita de la persona responsable.

El algoritmo usa búsqueda de restricciones con límite de trabajo, no generación con un modelo de lenguaje. Respeta jornada, recreos, carga semanal, bloques, indisponibilidad, y cruces de aula/docente. Explica los déficits de capacidad en minutos semanales. Agotar la búsqueda no se presenta como prueba de imposibilidad. Nunca amplía la jornada ni reduce una carga por su cuenta. Si quedan minutos menores a un periodo antes del recreo o fin de jornada, no crea una clase fraccionada.

**Guardar borrador** no publica. Dirección revisa y aprueba por separado; Supabase vuelve a validar todas las restricciones y los horarios publicados de otras sedes/instituciones que comparten el mismo docente (correo o cuenta). Las publicaciones del año se serializan para evitar aprobar simultáneamente dos cruces. Este control no incluye tiempos de viaje entre sedes.

Las familias y estudiantes consultan solo el horario publicado de sus aulas, con sus permisos académicos habituales. El docente puede filtrar por su nombre para consultar su semana. Cada nueva publicación archiva la anterior. Para cambiar un horario publicado se crea una copia, se revisa y se vuelve a publicar. Los formularios guardan sus datos locales al recibir Realtime.

## Secretaría académica

Dirección asigna el correo desde **Horarios de clases → Secretaría académica**. La persona ingresa con ese correo verificado por el login habitual. Este rol solo prepara horarios; Dirección puede conceder además permiso para aprobar/publicar y retirarlo posteriormente. No obtiene permisos sobre expedientes, notas, cobros o configuración bancaria. No se crean ni publican contraseñas ficticias adicionales.

## Grado oficial y evaluación

Desde **Evaluación y libretas → Grado y evaluación**, o **Promoción anual → Configurar grados**, Dirección asigna el grado y modelo a cada paralelo de una gestión. La sucesión es Primaria 1–6 → Secundaria 1–6 → egreso. Los nombres libres de aula no deciden la promoción.

El modelo **Bolivia 2026** utiliza Ser 10, Saber 45, Hacer 40 y Autoevaluación 5. Cada columna numérica debe indicar su dimensión. Sus evidencias se promedian con los pesos de las columnas y se normalizan al máximo de la dimensión; luego se suman las cuatro dimensiones. Por ejemplo, 80% de las evidencias en cada dimensión produce 8 + 36 + 32 + 4 = 80/100. Este método de combinar evidencias se muestra en la interfaz: la RM establece las dimensiones y sus máximos, no esa fórmula específica por actividad.

- **Ser**: evidencias observables de valores, responsabilidad, respeto y actitudes.
- **Saber**: comprensión y conocimientos; pueden documentarse con preguntas, pruebas orales/escritas y otras evidencias.
- **Hacer**: aplicación práctica, ejercicios, proyectos, trabajos y resolución de problemas.
- **Autoevaluación**: valoración del propio estudiante, registrada por el docente.

No toda tarea corresponde automáticamente a Hacer, ni toda prueba cubre únicamente Saber: el docente elige la dimensión según lo evaluado. Una tarea puntuable usa Hacer inicialmente y conserva su columna vinculada; debe revisarse su dimensión antes de registrar notas cuando corresponda.

Las casillas faltantes no valen cero. Sin las cuatro dimensiones completas no se permite cerrar el resultado. Las notas cualitativas no se convierten en puntos. Inicial mantiene sus etiquetas configurables y el esquema flexible existente también se conserva; el modelo numérico no se activa automáticamente en las instituciones actuales. Las columnas existentes deben clasificarse antes de activar el modelo. Las libretas publicadas mantienen su política; para corregirlas se usa la reapertura con motivo antes de confirmar una promoción.

Clasificaciones: menor a 51 ED; 51 a menos de 69 DA; 69 a menos de 85 DO; 85 a 100 DP. No se redondea una nota insuficiente hacia 51 de manera implícita. El promedio anual del modelo Bolivia 2026 es el promedio simple de los tres resultados trimestrales publicados; no utiliza pesos distintos entre trimestres.

## Reforzamiento

Se realiza antes del cierre del trimestre, no como un examen final automático al terminar el año. Dirección habilita la celda de reforzamiento por estudiante y materia con motivo, únicamente con nota completa menor a 51. El docente asignado registra la nueva nota sobre 100; 51 es el mínimo aprobatorio, no un puntaje que se regale al habilitar la celda.

Dirección elige expresamente una regla institucional: conservar la mejor nota o usar el resultado del reforzamiento. Esta decisión debe corresponder a su procedimiento pedagógico aprobado; la plataforma no presenta estas opciones como una fórmula ministerial. La nota original se conserva y la nueva requiere aprobación de Dirección. El trimestre queda pendiente hasta completar y aprobar la celda. Cambiar la evidencia original invalida una aprobación anterior. Se mantienen revisiones, límites de correcciones e historial de cambios; un reforzamiento aprobado no se sobrescribe.

## Promoción y reinscripción

1. Completar y publicar las libretas de los tres trimestres; cerrar la gestión de origen desde Gestiones y libretas.
2. Crear la siguiente gestión. **Preparar aulas de destino** copia aulas, materias, asignaciones y la configuración explícita de grado; revisar capacidad, docentes y lista anual de materiales antes de reinscribir.
3. En **Promoción anual**, revisar aprobados, retenidos, egresados y pendientes. Una materia anual menor a 51 retiene en el mismo grado. La falta de libretas, dimensiones, periodos o política deja el caso pendiente.
4. Elegir paralelo de destino compatible, seleccionar casos listos y confirmar el lote. Se valida capacidad y requisitos de inscripción en el servidor. Si un caso falla, se revierte todo el lote.

6.º de Primaria aprobado pasa a 1.º de Secundaria. 6.º de Secundaria aprobado egresa y finaliza su inscripción para evitar nuevos cobros recurrentes; conserva expedientes, notas y deudas anteriores. Un reintento del mismo lote no duplica inscripciones. Una gestión con promoción confirmada no se puede reabrir directamente: requiere revisión del lote para mantener los resultados históricos consistentes.

La promoción conserva datos familiares, historial, cuotas y saldos existentes. No emite activaciones nuevas, no modifica importes ya emitidos y no crea por su cuenta un plan de pagos para el año nuevo: Dirección lo prepara desde Mensualidades. Los casos de traslado durante el año, adaptaciones curriculares, inicial o expedientes incompletos deben revisarse individualmente; no se promueven por una suposición del algoritmo.

## Fuentes verificadas el 23 de octubre de 2026

- Ministerio de Educación, RM 0001/2026, artículos 7 y 29 (duración del periodo y ponderación); artículo 50 (fortalecimiento de aprendizajes): https://www.minedu.gob.bo/files/documentos-normativos/resoluciones-ministeriales/1_RM_0001_EDUCACIN_REGULAR.pdf
- Reglamento de Evaluación del Desarrollo Curricular, artículos 6, 31, 34, 50–51 y 57–58 (apoyo durante el trimestre, dimensiones, inicial, escalas y promedio anual): https://www.minedu.gob.bo/files/documentos-normativos/VER/2024/REGLAMENTO_EDUCACION_REGULAR.pdf
- Confirmación ministerial de la ponderación 2026: https://www.minedu.gob.bo/index.php?Itemid=854&catid=182&id=8249&option=com_content&view=article

La plantilla conserva la referencia 2026 al copiarse. Dirección debe revisar la normativa de cada nueva gestión antes de utilizarla; copiarla no certifica cambios legales de 2027.

Migraciones: 202610220007_timetables.sql y 202610220008_annual_academics.sql. Los módulos usan el canal Realtime existente con permisos en Supabase. La demo mantiene datos en el navegador sin escribir en producción. Android se actualiza en código fuente; esta entrega no genera ni instala APK.
