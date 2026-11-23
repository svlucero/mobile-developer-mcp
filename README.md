# mobile-developer-mcp

Servidor MCP local, de solo lectura, para datos de negocio de Google Play y
App Store Connect. Esta primera base no consulta aún APIs de las tiendas: define
el transporte seguro, la configuración y los contratos sobre los que se añaden
las consultas por proveedor.

## Inicio local

Requiere Node.js 18 o superior.

```sh
npm install
cp mobile-developer-mcp.config.example.json mobile-developer-mcp.config.json
npm run build
npm start
```

El archivo local de configuración está ignorado por Git. Puede usar otra ruta
con `MOBILE_DEVELOPER_MCP_CONFIG_PATH`. Copie `.env.example` únicamente como
referencia; nunca agregue claves, tokens o archivos de cuenta al repositorio.

Ejemplo de cliente MCP:

```json
{
  "mcpServers": {
    "mobile-developer": {
      "command": "node",
      "args": ["/ruta/al/mobile-developer-mcp/dist/index.js"],
      "env": {
        "MOBILE_DEVELOPER_MCP_CONFIG_PATH": "/ruta/privada/apps.json"
      }
    }
  }
}
```

## Herramientas iniciales

- `mobile_developer_list_apps`: lista identificadores y configuración no
  secreta de apps, con filtro opcional `provider` y `limit` entre 1 y 100.
- `mobile_developer_provider_status`: indica solamente si las credenciales de
  cada proveedor están presentes localmente, sin mostrar valores.

Las futuras herramientas comparten contratos para `source`, `period` (`start`
y `end` ISO), `unit`, límites y paginación. Los errores de dominio son
estructurados y usan `CONFIGURATION`, `AUTHORIZATION`, `NOT_FOUND` o
`PROVIDER`; los detalles sensibles se redactan.

El servidor reserva stdout para JSON-RPC/MCP. Cualquier diagnóstico va a
stderr. No existen herramientas de publicación, edición de tracks, respuestas
a reviews ni generación de reportes.

## Desarrollo

```sh
npm run build
npm test
```
