# Seguridad

## Reportar una vulnerabilidad

Usá [Report a vulnerability en GitHub](https://github.com/svlucero/mobile-developer-mcp/security/advisories/new)
si está habilitado. Si no está disponible, contactá al mantenedor mediante un
canal privado indicado en su [perfil](https://github.com/svlucero). Podés abrir
un issue solicitando un canal privado, sin detalles de explotación, credenciales
ni datos de cuentas. No hay plazo de respuesta garantizado.

Incluí versión o commit, impacto y pasos reproducibles con datos sintéticos.
No envíes claves ni reportes reales. Si una credencial se expuso, revocala o
rotala: borrarla del archivo o último commit no la invalida ni elimina copias
del historial.

## Estado y alcance

El proyecto es experimental. Se mantiene el estado actual de `main`; no hay
política de backports. Las pruebas con fixtures no constituyen una auditoría de
seguridad ni validan permisos reales.

MCP usa stdio local; las consultas y autenticación requieren conexiones salientes
a Google y Apple. Los datos privados que se consultan llegan al cliente MCP.
Usá clientes y asistentes de confianza y evaluá cómo manejan esos datos.

Guardá credenciales fuera del repo y asigná permisos mínimos por recurso.
Aunque el servidor solo consulta datos de negocio, algunos scopes o credenciales
pueden permitir otras acciones en el proveedor. Los límites de descarga no
garantizan límites de memoria al descomprimir reportes. No uses claves o archivos
de origen desconocido.

Los ejemplos contienen placeholders. `.gitignore` reduce inclusiones accidentales,
pero no evita publicar archivos previamente versionados ni detecta todos los
secretos. Revisá el diff y el historial antes de publicar.

Los tests generan claves efímeras. Revisiones anteriores contienen una clave
de fixture pública con IDs sintéticos; no debe reutilizarse como credencial.
