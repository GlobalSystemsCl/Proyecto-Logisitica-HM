# Brecha 022 — HTML sin escapar en correos transaccionales

## Estado
Pendiente

## Severidad
Low

## Categoría
Security — HTML injection

## Descripción
`EmailService.sendUserCredentialsEmail` arma `htmlContent` con template literals que interpolan `params.recipientName` (nombre + apellido), `params.toEmail` y el rol sin escapar HTML. El nombre y el apellido los escribe el administrador al crear el usuario, o el propio usuario en `/registro` y `/perfil` (validados por `validarCampoTexto` en `src/lib/validaciones.ts`, que solo comprueba que no esté vacío y la longitud máxima, así que acepta `<` y `>`). Un nombre con HTML se renderiza en el correo.

## Evidencia
- `src/services/email.service.ts` ~40-135 (`${params.recipientName}`, `${params.toEmail}`, `${rolFormat}`, `${appUrl}`).

## Impacto
Bajo: inyección de enlaces o contenido engañoso en un correo enviado desde el dominio de la empresa (phishing interno). Los clientes de correo no ejecutan JavaScript.

## Cómo reproducirlo
Crear un usuario con nombre `<a href="https://ejemplo">Click</a>` y revisar el correo (No ejecutado).

## Causa raíz
Plantilla HTML construida por concatenación.

## Solución propuesta
Función `escapeHtml()` aplicada a todos los valores interpolados, o plantillas de Brevo con parámetros (`templateId` + `params`), que escapan por defecto. Restringir además `validarCampoTexto` a letras, espacios, guiones y apóstrofes.

## Riesgos de la solución
- Ninguno relevante.

## Tests necesarios
- `sendUserCredentialsEmail` con nombre que contiene `<script>` → el HTML enviado contiene `&lt;script&gt;` (mock de fetch).

## Plan de implementación
Helper + test + aplicación en la plantilla.

## Criterios de aceptación
- Ningún dato de usuario aparece sin escapar en el HTML del correo.
