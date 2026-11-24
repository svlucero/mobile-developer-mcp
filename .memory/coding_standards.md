# Convenciones

- TypeScript/Node.js estricto y módulos ESM.
- El protocolo MCP usa exclusivamente stdout; logs y diagnósticos van a stderr.
- Validar toda entrada externa en el borde; limitar paginación y volumen.
- No versionar, registrar ni devolver secretos. Sanitizar los errores antes de
  enviarlos por MCP.
- Distinguir configuración, autorización, datos ausentes y fallos de proveedor.
- Mantener adaptadores separados por proveedor y no introducir mutaciones de
  negocio en V1.
- Usar `McpDomainError` y sus códigos `CONFIGURATION`, `AUTHORIZATION`,
  `NOT_FOUND` o `PROVIDER` al convertir fallos de dominio a una respuesta MCP.
- La configuración se lee desde la ruta en `MOBILE_DEVELOPER_MCP_CONFIG_PATH`;
  ejemplos sí se versionan, archivos reales y claves no.

Las pruebas deben incluir protocolo stdio, validación, redacción de secretos y
errores estructurados. `npm test` compila y ejecuta Vitest. Usar mensajes de
commit convencionales y acotados.

Ver [arquitectura](architecture.md) y [contratos](api_contracts.md).
