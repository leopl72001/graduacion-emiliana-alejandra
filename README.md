# Graduación de Emiliana y Alejandra 💙

Invitación digital con panel de administración independiente, cuatro galerías de fotografías, música por grupos, seguimiento de envíos y confirmaciones.

- **Emiliana:** graduación de 5.º
- **Alejandra:** graduación de 11.º
- **Sitio:** https://leopl72001.github.io/graduacion-emiliana-alejandra/

Aplicación React + Vite con Supabase y GitHub Pages. La información de este evento se almacena en tablas `sisters_*`, independientes de las del proyecto GradoPro.

## Publicación

GitHub Pages configurado mediante GitHub Actions. La aplicación se publica desde `main` con el flujo `.github/workflows/deploy.yml`.


## Panel de ajustes (cualquier navegador o red)

**Panel permanente:** https://leopl72001.github.io/graduacion-emiliana-alejandra/#/settings

La información real se almacena en **Supabase**, no en el dispositivo:
invitados, grupos, fotos, música, marcación de envíos y respuestas RSVP. La app
consulta siempre el mismo evento: `0c4ed031-16e9-44b6-a0ec-30721a9eeccf`.

### Acceder desde otro celular o computador

1. En el navegador que ya tiene acceso, abre **Ajustes y dispositivos**.
2. Haz clic en **Crear enlace y QR de vinculación**.
3. Escanea el QR en el otro dispositivo o copia el enlace privado.
4. El segundo dispositivo se vinculará automáticamente, sin introducir contraseña.
5. Desde entonces, entra al enlace permanente del panel en cualquiera de los dos equipos.

**Seguridad:** el QR de *vinculación* es un permiso de administración de un solo uso
y caduca en 10 minutos. No se debe compartir con invitados. El propietario puede
revocar el acceso de otros dispositivos. Las sesiones se conservan en cada
navegador; si se borran sus datos, habrá que volver a vincularlo.

El enlace de una invitación y su código QR público son distintos:
`/#/invitacion/<token-personal>` solo permiten ver esa invitación y responder asistencia,
no editar el panel.

### Crear invitaciones familiares con QR

En **Invitaciones** crea una entrada con nombre `Familia ...`, define cupos y grupo;
en la tabla pulsa el ícono **QR** para descargar el código en formato SVG (listo para
compartir o imprimir). **Marcar enviada** registra la fecha en Supabase. Las
confirmaciones pueden filtrarse por **Confirmaron**, **No han confirmado** o
**No asistirán**. Con Internet, la lista se vuelve a consultar automáticamente
cada 15 segundos mientras se navega por los listados.

### Instalación de base de datos

Para otra instalación de Supabase, ejecuta en el SQL Editor
`supabase/schema.sql` y después `supabase/multidispositivo.sql`.
El evento canónico ya existe en el proyecto conectado. Las claves secretas
(service_role) **nunca** deben usarse en el navegador.
