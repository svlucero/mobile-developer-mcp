# Contratos de APIs

## MCP local

El servidor expondrá herramientas de consulta. Cada resultado deberá conservar
el proveedor/fuente, período, unidad y metadatos de límite o paginación.
Entradas comunes: proveedor, identificador de app, período y un límite acotado.

Los fallos usarán categorías sanitizadas: `CONFIGURATION`, `AUTHORIZATION`,
`NOT_FOUND` y `PROVIDER`. Datos ausentes no equivalen a cero.

## Proveedores previstos

- Google Play: configuración por `packageName` y tracks; credenciales locales
  opcionales para el adaptador de Google.
- App Store Connect: configuración por App Store app ID; credenciales locales
  opcionales para el adaptador de Apple.

La versión inicial no llama recursos de negocio. Los issues posteriores añaden
las herramientas concretas, conservando el alcance de solo lectura.

Ver [arquitectura](architecture.md) y [convenciones](coding_standards.md).
