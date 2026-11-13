# Registro institucional por niveles

El alta pública y el formulario administrativo permiten elegir Inicial/kínder,
Primaria y Secundaria, individualmente o en cualquier combinación. Guardería,
Educación especial y Otros se conservan como servicios opcionales.

La selección es obligatoria en los formularios web. Se guarda en la solicitud,
se muestra a plataforma para su revisión y se conserva en la institución al
aprobarla. Los niveles también pueden actualizarse desde Editar identidad.

La configuración se deriva de los niveles, sin un selector contradictorio:

| Niveles | Configuración guardada |
| --- | --- |
| Solo Inicial y/o Guardería | `kinder` |
| Primaria y/o Secundaria, sin Inicial/Guardería | `school` |
| Niveles infantiles y colegio | `auto`, con herramientas según cada aula |
| Otros servicios | `auto` |

No se crean grados, aulas ni alumnos ficticios al seleccionar niveles. Las
instituciones existentes conservan sus datos. Las solicitudes anteriores y los
clientes antiguos sin este campo pueden seguir procesándose; no se les asignan
niveles inventados.

Aplicar `202611120005_institution_registration_levels.sql` antes de publicar la web:

```sh
node scripts/migrate-institution-levels.mjs
node scripts/migrate-institution-levels.mjs --apply
```

La primera orden valida en una transacción que se revierte. La segunda registra
la migración y actualiza la caché de PostgREST. Se mantienen las políticas de
privacidad, la verificación del correo, la prohibición de solicitudes desde
cuentas de estudiantes y la aprobación exclusiva de plataforma.

Validación: pruebas de los siete conjuntos de niveles hasta la aprobación,
rechazo de datos malformados, privacidad, idempotencia de aprobación, solicitudes
anteriores y formularios públicos/administrativos en escritorio y celular.
