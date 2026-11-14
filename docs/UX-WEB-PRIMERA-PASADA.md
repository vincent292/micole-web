# Primera pasada de UX web · 14 de noviembre de 2026

Se aplicaron Web Design Guidelines y React Best Practices a los componentes
compartidos y al listado de estudiantes, preservando colores, logos y plantillas
institucionales.

## Hallazgos corregidos

- `src/features/Pages.tsx`: búsqueda, aula, estado y página se conservan en la URL;
  el regreso desde el expediente recupera la selección anterior.
- `src/features/Pages.tsx`: páginas de 50 filas, cantidad de resultados, búsqueda
  por nombre/RUDE/CI sin depender de tildes, limpieza de filtros y estados vacíos
  con una acción que corresponde al contexto.
- `src/features/Pages.tsx`: índices por ID para consultar las aulas y nombres
  accesibles explícitos en los botones de acciones.
- `src/components/UI.tsx`: asociación de etiquetas con campos y selectores;
  los indicadores visuales de obligatoriedad y los iconos decorativos quedan
  separados del nombre accesible.
- `src/WorkspaceApp.tsx`: acceso para saltar al contenido con teclado y un título
  principal accesible en las pantallas con encabezado propio.
- `src/WorkspaceApp.tsx`: claves distintas para avisos y asistente; afiliación
  ficticia de Dirección en la vista local, conservando las comprobaciones de
  acceso de las cuentas reales.

La paginación limita las filas renderizadas; no modifica la API ni la cantidad
de registros autorizados que devuelve el servidor. Los estilos nuevos contienen
únicamente disposición y visibilidad, sin redefinir la paleta.

## Validación

- Compilación de producción y 648 pruebas existentes.
- Playwright CLI con 105 alumnos ficticios: páginas 50/50/5, búsqueda sin tilde y
  por CI, retorno al filtro desde el expediente y vista móvil sin desbordamiento.
- Etiquetas de formularios, foco del acceso de teclado y conservación del color
  institucional de la muestra.
- Los casos de asistencia del kárdex declaran explícitamente una jornada ficticia
  de clases para poder ejecutarse también en fin de semana. No se alteran las
  reglas de asistencia de la aplicación.

Evidencia local en `output/playwright/2026-11-14-web-ux/`.
