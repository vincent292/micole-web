# Métricas de colegios para Superadministración

Abre **Métricas de colegios** en el menú del superadmin. En la web también hay un acceso desde Inicio. La ruta web es `/app/schoolMetrics`; Android incorpora el módulo en la APK 19. El reporte de ingresos de MiCole conserva su función anterior.

Usa **Esta semana**, **Este mes** o **Últimos 6 meses**. En **Filtrar por colegio y curso** (web) o **Cambiar filtros** (APK) puedes elegir entorno, colegio, curso, fechas y agrupación por semanas o meses. Las semanas empiezan el lunes; la primera y la última pueden ser parciales. Todas las fechas se interpretan en Bolivia. Rango máximo: 367 días inclusive.

## Entornos

El valor inicial es **Colegios reales**. Cualquier institución registrada como de prueba se excluye de ese conjunto, incluso si se desactivó su modo de prueba. **Solo pruebas** permite demostrar las funciones sin mezclar cifras reales. **Todos** indica expresamente que incluye pruebas.

Al verificar el 29 de octubre de 2026, las tres instituciones existentes estaban registradas como pruebas; por eso el entorno real todavía estaba vacío. No se cambiaron sus etiquetas ni se cargaron nuevos alumnos, pagos o notas para llenar el panel.

## Vistas

- **Panorama:** alumnos activos, altas, cobrado, saldo, media de resultados completos, señal de riesgo, asistencia confirmada y evolución semanal o mensual.
- **Por colegio:** comparación de matrícula, altas, alumnos con pagos, cobros, saldo, alumnos con pendientes y resultados académicos.
- **Materias y riesgo:** colegio, curso, materia y periodo; media sobre 100, resultados completos, incompletos o cualitativos y cantidad bajo mínimo entre los evaluables.
- **Uso y registros:** altas y cambios auditados por tipo de registro, además de consultas instrumentadas. Se ordena por cantidad de actividad registrada.

La exportación CSV incluye todas las filas de la vista seleccionada, aunque la pantalla esté paginada. Los nombres de alumnos, familiares, sus correos y las notas individuales no forman parte de la respuesta ni de la exportación.

## Definiciones y límites

**Matrícula:** activos es una foto del estado actual. Altas cuenta la primera creación auditada de cada alumno dentro del rango, no la fecha de inscripción declarada ni todos sus movimientos. Al filtrar curso, matrícula, pagos y altas usan su asignación actual. La asistencia y las notas se vinculan al curso donde se registraron.

**Pagos:** cobrado suma únicamente abonos verificados con fecha de pago dentro del rango; puede incluir pagos de cuotas de meses anteriores. «Alumnos con pago» cuenta alumnos únicos; varios abonos del mismo alumno no lo duplican. No se presenta esa cantidad como «papás que pagaron»: un cobro registrado por Dirección no siempre identifica cuál familiar entregó el dinero.

**Pendientes:** el saldo corresponde a cuotas no anuladas cuyo vencimiento está dentro del rango, descontando los abonos verificados actuales. Vencido compara sus vencimientos con hoy. No se reconstruye el saldo contable histórico. Un alumno puede tener abonos y también saldo pendiente.

**Academia:** se reutiliza `aulanexo_private.grade_total`, con sus reglas de promedio, ponderación, suma, dimensiones y reforzamientos aprobados. Se incluyen los periodos que se superponen con el rango y se normaliza cada resultado completo sobre 100. La media asigna igual peso a cada resultado alumno–materia–periodo completo; no es la nota anual. No representa exclusivamente evaluaciones de esa semana ni una fotografía histórica de las notas.

**Riesgo:** se cuenta un alumno si tiene al menos un resultado completo inferior a 51 en un aula configurada con Bolivia 2026. El denominador de alumnos evaluables también es único. Por materia se muestran cantidades de resultados bajo mínimo y evaluables. Los esquemas flexibles no tienen un mínimo universal configurado y muestran «No aplica». Los registros incompletos o cualitativos se muestran aparte; nunca se convierten en cero ni en reprobación. Es una señal observada que requiere seguimiento, no una predicción.

**Asistencia:** solo listas confirmadas y su estado efectivo con las correcciones justificadas vigentes. Se cuentan marcas (un alumno puede tener muchas), no niños distintos. Una lista sin confirmar o la ausencia de una marca no genera una falta.

**Uso:** eventos existentes en `audit_events` y `content_view_events`. Pueden incluir procesos automáticos; no todo evento implica una persona usando una pantalla. Usuarios con actividad son actores identificados distintos dentro de esas fuentes, no sesiones ni visitantes. Las consultas solo cubren contenido instrumentado. No se mide tiempo de uso ni se afirma falta de uso por ausencia de eventos. El uso se agrega por colegio completo: no se aplica el filtro de curso.

## Acceso y actualización

La RPC `platform_school_metrics` es de lectura, agregada en PostgreSQL sin truncamiento REST de mil filas. Exige un propietario autenticado reconocido como superadmin y ninguna cabecera de soporte; también deniega sesiones de prueba por suplantación de rol. Otros roles no reciben permiso de navegación ni pueden recuperar agregados llamando directamente la RPC.

**Actualizar** vuelve a consultar los datos. No hay seguimiento permanente ni actualización automática de este panel. Ante un cambio de filtros o un error, no se muestran las cifras de una consulta anterior como si fueran actuales.

Migración: `202610290004_platform_school_metrics.sql`. Comprobación: `node scripts/qa-school-metrics.mjs`. Evidencia y límites de las verificaciones: `output/qa/2026-10-29-metricas-superadmin/INFORME.md`.
