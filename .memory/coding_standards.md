# Convenciones

- TypeScript/Node.js estricto y módulos ESM.
- El protocolo MCP usa exclusivamente stdout; logs y diagnósticos van a stderr.
- Validar toda entrada externa en el borde; limitar paginación y volumen.
- No versionar, registrar ni devolver secretos. Sanitizar los errores antes de
  enviarlos por MCP.
- Distinguir configuración, autorización, datos ausentes y fallos de proveedor.
- Mantener adaptadores separados por proveedor y no introducir mutaciones de
  negocio en V1.

Las pruebas deben incluir protocolo stdio, validación, redacción de secretos y
errores estructurados. Usar mensajes de commit convencionales y acotados.

Ver [arquitectura](architecture.md) y [contratos](api_contracts.md).
