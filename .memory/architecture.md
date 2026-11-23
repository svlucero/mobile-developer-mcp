# Arquitectura

## Propósito

Servidor MCP local de solo lectura para consultar datos de negocio de Google
Play y App Store Connect. El issue #2 establece la infraestructura compartida;
las consultas por proveedor se incorporan después.

## Implementación base

- Node.js/TypeScript con transporte MCP por `stdio`.
- `src/index.ts` conecta `McpServer` al transporte; stdout queda reservado para
  JSON-RPC y los diagnósticos van a stderr.
- `src/server.ts` registra las herramientas iniciales de inspección local.
- `src/contracts.ts`, `src/config.ts` y `src/errors.ts` establecen contratos,
  carga validada/redactada de configuración y errores de dominio sanitizados.
- `src/providers/` contiene adaptadores independientes de Google Play y App
  Store Connect; todavía no realizan llamadas a tiendas.
- Los adaptadores son opcionales e independientes: una configuración válida de
  un proveedor no exige credenciales del otro.

Las pruebas de `test/` cubren carga de configuración, redacción y handshake,
listado y llamada MCP reales por stdio.

## Límites

- Solo lectura de recursos de negocio; autenticación puede intercambiar tokens.
- No publicar releases, editar tracks, responder reviews ni generar reportes.
- Conservar fuente, período, unidad, límites y paginación en los contratos.

Ver [convenciones](coding_standards.md) y [contratos](api_contracts.md).
