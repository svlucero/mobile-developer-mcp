# Contratos de APIs

## MCP local implementado

`mobile_developer_list_apps` lista configuración no secreta y acepta `provider`
(`google-play` o `app-store`) y `limit` (1–100). Su resultado incluye metadatos
de límite y truncamiento. `mobile_developer_provider_status` expone solamente
booleanos de presencia de credenciales.

Ambas herramientas son de solo lectura. Cada futura consulta debe conservar
proveedor/fuente, período, unidad y metadatos de límite o paginación. Los
esquemas compartidos ya validan `period`, `unit` y `pagination`.

Los fallos usarán categorías sanitizadas: `CONFIGURATION`, `AUTHORIZATION`,
`NOT_FOUND` y `PROVIDER`. Datos ausentes no equivalen a cero.

## Proveedores previstos

- Google Play: configuración por `packageName` y tracks; credenciales locales
  opcionales para el adaptador de Google.
- App Store Connect: configuración por App Store app ID; credenciales locales
  opcionales para el adaptador de Apple.

La versión inicial no llama recursos de negocio. Los issues posteriores añaden
las herramientas concretas, conservando el alcance de solo lectura y usando
los contratos existentes.

Ver [arquitectura](architecture.md) y [convenciones](coding_standards.md).
