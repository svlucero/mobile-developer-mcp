# Arquitectura

## Propósito

Servidor MCP local de solo lectura para consultar datos de negocio de Google
Play y App Store Connect. El issue #2 establece la infraestructura compartida;
las consultas por proveedor se incorporan después.

## Base inicial

- Node.js/TypeScript con transporte MCP por `stdio`.
- Los módulos previstos separan el servidor, contratos compartidos,
  configuración local segura y adaptadores de Google/Apple.
- Los adaptadores son opcionales e independientes: una configuración válida de
  un proveedor no exige credenciales del otro.

## Límites

- Solo lectura de recursos de negocio; autenticación puede intercambiar tokens.
- No publicar releases, editar tracks, responder reviews ni generar reportes.
- Conservar fuente, período, unidad, límites y paginación en los contratos.

Ver [convenciones](coding_standards.md) y [contratos](api_contracts.md).
