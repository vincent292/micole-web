# Demostración pública de MiCole

URL para compartir: **https://micole-demo.vercel.app/**

En la landing real, **Probar demo ahora** abre `/demo` y dirige a ese sitio. **Solicitar demo para mi institución** lleva al formulario comercial opcional; esas solicitudes llegan al panel del propietario, separadas de los datos ficticios de la demo.
Acceso inmediato: no hay formulario comercial, registro real ni envío de correos.

## Credenciales públicas y ficticias

Clave compartida de todos los perfiles: `MiColeDemo2026!`

| Perfil | Correo de ejemplo |
| --- | --- |
| Dirección | `direccion@micole.test` |
| Docente | `docente@micole.test` |
| Familia | `familia@micole.test` |
| Estudiante | `estudiante@micole.test` |

La clave está visible en el acceso. No representa una barrera de seguridad ni concede acceso a la aplicación real. No utilizarla para cuentas reales.

## Qué permite explorar

- Dirección: identidad institucional, aulas, docentes, inscripción familiar y planes, cobros parciales, recibos, solicitudes de factura, reportes, materias, gestión académica e importación CSV.
- Docente: aulas asignadas, publicaciones, agenda, cuidados, tareas, revisión de entregas, evaluaciones y calificaciones.
- Familia: dos hijos de ejemplo, calendario, tareas y notas de lectura, cuidados, solicitudes y pagos simulados.
- Estudiante: tareas propias, respuesta con archivo local, anuncios y agenda.

El selector superior cambia de rol. El recorrido desplegable sugiere acciones.
Las libretas del segundo trimestre ya están publicadas; el tercer trimestre queda abierto para probar notas, cierre y reapertura.

## Datos y aislamiento

- Institución, personas, correos e importes de ejemplo. Usar exclusivamente datos ficticios.
- Cambios en `localStorage` de cada navegador. El rol se conserva en `sessionStorage` de cada pestaña. Un visitante no modifica la demo de otro navegador.
- No se inicializa Supabase en la build pública, incluso si se reciben accidentalmente sus variables de entorno. Los RPC de demostración se resuelven localmente; una operación desconocida falla sin recurrir al servidor.
- No se consulta ni modifica la base real, Auth, R2, Firebase, SMTP ni Baneco.
- Los archivos de tareas, galería y documentos quedan en el navegador; en demo el máximo por archivo es 1 MB. El espacio disponible depende del navegador. No cargar documentos personales reales.
- El pago QR es una simulación explícita: no genera un QR bancario ni realiza cobros. «Simular pago recibido» actualiza únicamente cuotas y recibos locales.
- Los enlaces familiares y de pagos sirven en el mismo navegador donde se crearon; no son enlaces comerciales compartidos entre dispositivos.
- **Restablecer demo** pide confirmar y restaura datos, archivos, pagos e historial de ejemplo. No toca la sesión o datos de la aplicación real, alojada en otro dominio.
- La publicación de demo tiene CSP que impide conexiones a servicios externos, cabeceras de no indexación y no usa analítica de visitantes.

## Compilar y verificar

```sh
npm ci
npm run demo:build
npm run test:demo
```

`demo:build` fuerza `VITE_PUBLIC_DEMO=true`, `VITE_APP_MODE=demo`, vacía URL/clave de Supabase y deshabilita R2. Produce la web en `dist/`. No genera APK.

`npm test` incluye pruebas del motor local y aislamiento de Supabase.
`test:demo` compila y prueba los recorridos de los cuatro roles, inscripciones, adjuntos, pagos, reinicio y vistas de 360, 390, 768 y 1024 px.

Para repetir los recorridos sobre una demo ya publicada:

```sh
MICOLE_DEMO_TEST_URL=https://micole-demo.vercel.app npx playwright test --config playwright.demo.config.ts
```

## Publicación

Usar **el proyecto separado `micole-demo`**, nunca el proyecto `micole-web`.
`vercel.demo.json` contiene el comando de build, las rutas SPA y cabeceras exclusivas de la demo. Para una configuración de Git en ese proyecto, seleccionar `npm run demo:build` y salida `dist`, aplicando también las cabeceras y rutas de ese archivo.

La publicación actual usa Build Output API con la carpeta `.vercel/output/static` y rutas que conservan los archivos existentes y envían las rutas de la app a `index.html`. La carpeta de despliegue está vinculada exclusivamente al proyecto de demo; no contiene `.env` ni secretos.

La web real sigue usando `npm run build` y modo `live`. `VITE_PUBLIC_DEMO` debe estar ausente o ser `false` allí. `VITE_DEMO_URL` puede cambiar el destino comercial sin tocar las credenciales de Supabase.

Texto sugerido para compartir:

> Puedes explorar MiCole aquí: https://micole-demo.vercel.app/ . Ingresa con direccion@micole.test y la clave MiColeDemo2026! . Dentro puedes cambiar entre Dirección, Docente, Familia y Estudiante. Toda la información es ficticia y tus pruebas solo quedan en tu navegador.
