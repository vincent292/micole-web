# Demostración privada de MiCole

URL para compartir a personas invitadas: **https://micole-demo.vercel.app/**

La landing permite solicitar una demo; las solicitudes llegan al superadmin. El enlace de acceso abre un formulario vacío. MiCole entrega el correo y la clave de manera privada; no hay selección de cuentas, credenciales visibles, autocompletado de la aplicación ni envío de OTP.

## Acceso y secretos

La autenticación se verifica en el servidor de Vercel antes de servir páginas, JavaScript o archivos de la demo. Modificar `sessionStorage` o conocer una ruta interna no permite saltar la validación.

Configurar únicamente en el proyecto **micole-demo**, como variables de servidor:

- `DEMO_ACCESS_CREDENTIAL_HASH`: SHA-256 hexadecimal de `correo.trim().toLowerCase() + "\0" + clave` (el separador es un byte cero).
- `DEMO_SESSION_SECRET`: secreto aleatorio de al menos 32 caracteres.

No usar prefijos `VITE_` ni incluir credenciales en Git, URLs o el paquete del navegador. La clave anteriormente pública fue retirada y debe reemplazarse; nunca reutilizarla para accesos privados o cuentas reales. Las credenciales nuevas se conservan en el archivo privado del propietario, fuera del repositorio.

La sesión usa una cookie firmada `HttpOnly`, `Secure`, `SameSite=Lax`, dura 8 horas y se elimina al salir. Cambiar el hash o el secreto invalida las cookies anteriores. Es un acceso compartido para demostraciones: quien reciba la clave podrá compartirla; para accesos individuales se necesitan invitaciones por persona. No se registran visitantes ni conversaciones en Supabase.

## Recorridos y aislamiento

Tras iniciar sesión se puede cambiar entre Dirección, Docente, Familia y Estudiante. Los correos que aparecen dentro de la demo pertenecen a datos ficticios y no son las credenciales de acceso.

- Dirección: aulas, inscripción, cuotas, cobros, reportes, formularios, calendarios, avisos, sedes e historial.
- Docente: tareas, agenda, cuidados, evaluaciones y confirmaciones.
- Familia: hijos de ejemplo, calendario, notas, permisos y pagos simulados.
- Estudiante: tareas, entregas y agenda.

Los cambios y archivos quedan en `localStorage` de cada navegador. El perfil se conserva en `sessionStorage`; no sustituye la sesión firmada del servidor. No se conecta a Supabase, R2, Firebase, SMTP, Gemini ni Baneco. Solo el acceso consulta endpoints del mismo dominio. El QR es simulado. No cargar datos personales reales.

La demo conserva CSP estricta, `noindex` y `Cache-Control: private, no-store`; no incorpora analítica de visitantes.

## Compilar y verificar

```sh
npm run demo:build
npm run test:demo
```

`demo:build` fuerza modo demo, desactiva servicios reales y prepara `dist/` y `.vercel/output/` con el middleware de acceso. **No publicar solo `dist/`**: la protección está en la función y las rutas de Build Output API.

Las pruebas locales usan `scripts/serve-demo.mjs` con `MICOLE_DEMO_LOCAL_TEST=1` y credenciales exclusivas de pruebas, que no sirven en la demo publicada. Las pruebas contra producción necesitan `MICOLE_DEMO_TEST_URL`, `MICOLE_DEMO_TEST_EMAIL` y `MICOLE_DEMO_TEST_PASSWORD` privados.

Publicar únicamente en el proyecto `micole-demo` con las variables de servidor ya configuradas. `scripts/prepare-demo-output.mjs` puede preparar un directorio de despliegue separado. La web principal continúa en modo live y no utiliza este middleware. No se generan APK.
