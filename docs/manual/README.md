# Manual de uso de MiCole

Edición 1.2, 29 de octubre de 2026. Referencia: web publicada y APK Android 16 a 18. La asistencia de alumnos corresponde a la APK 17; los avisos importantes y de pagos, a la APK 18.

- PDF para entregar: `output/pdf/MiCole-Manual-Completo-Roles.pdf`.
- Contenido editable: `docs/manual/contenido.py`.
- Texto de consulta generado: `docs/manual/Manual-MiCole.md`.
- Inventario de figuras y huella del PDF: `output/pdf/MiCole-Manual-Metadatos.json`.
- Resultado de la revisión: `output/pdf/MiCole-Manual-Verificacion.json`.

El PDF tiene 60 páginas, seis roles y 32 figuras provenientes de 29 capturas originales de las pruebas. Los diagramas se identifican expresamente. Incluye índice navegable, solución de problemas, plan de piloto y hoja de comprobación imprimible.

## Regenerar

Se necesitan las dependencias del proyecto instaladas (`@fontsource/inter` y `@fontsource/poppins`) y Python con ReportLab 4.5.1, Pillow, fontTools, PyMuPDF y pypdf. Para revisar texto también puede usarse pdfplumber.

```sh
python scripts/build-user-manual.py
python scripts/review-user-manual.py
```

El primer comando genera el PDF y sus metadatos; el segundo comprueba la huella, texto y destinos internos y renderiza las páginas en `tmp/pdfs/manual/render/`. Después de un cambio debe revisarse visualmente la nueva versión y actualizarse el informe de verificación; la aprobación guardada corresponde únicamente a la huella indicada en ese informe.

Las capturas originales se conservan en `output/qa/`. La composición del PDF recorta los márgenes del teléfono sin modificar esos archivos. No se incluyen credenciales ni datos de niños reales.

## Alcance de la entrega

La revisión general de las 60 páginas renderizadas, la revisión ampliada de las páginas nuevas/modificadas y las comprobaciones automáticas terminaron correctamente. La edición 1.2 incluye los trece correos de test (página 7), la lectura explícita de avisos (página 9) y pagos desde cinco días antes (página 10), además de la asistencia exclusiva del docente. Esto no reemplaza las pruebas operativas pendientes: restauración de respaldo, primer cobro bancario real coordinado si se ofrece QR automático, más dispositivos y seguimiento de cambios de versión. El cierre de privacidad y su última lectura física pendiente se documentan en `output/qa/2026-10-28-privacidad/INFORME.md`.
