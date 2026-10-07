# Brecha 020 — Mensajes de error internos expuestos y parámetro `next` sin lista blanca

## Estado
Pendiente

## Severidad
Low

## Categoría
Security — Information disclosure, Open redirect (limitado)

## Descripción
1. Services y actions devuelven `error.message` de Postgres, PostgREST y Storage directamente al cliente (por ejemplo, `No se pudo reservar los vehículos: ${svError.message}`, `Usuario creado en Auth pero falló el registro en base de datos: ${dbError.message}`, y el genérico `catch → err.message`). Revelan nombres de tablas, columnas, constraints y triggers.
2. `/auth/callback` usa `searchParams.get('next')` como `pathname` sin validar. Al asignarlo a `URL.pathname` el host se mantiene, así que no es un open redirect a otro dominio. Aun así, permite redirigir a cualquier ruta interna tras verificar un OTP (por ejemplo, un enlace de recuperación manipulado que lleve a una acción concreta). Impacto bajo.
3. `console.error` registra objetos de error completos. En `getCurrentUserProfile` el objeto puede incluir datos del usuario. Sin logger estructurado ni redacción.

## Evidencia
- `src/services/solicitudes.service.ts` (~639, ~674 y numerosos `return { success:false, error: error.message }`).
- `src/services/users.service.ts` (~150, ~183).
- `src/app/actions/*.ts`: `catch (err) { … error: err.message }`.
- `src/app/auth/callback/route.ts` (~11-14).

## Impacto
Facilita el reconocimiento del esquema a un atacante (útil para las brechas 001/005). Fuga menor.

## Cómo reproducirlo
Provocar un error de restricción (por ejemplo, un chasis duplicado por una vía no validada) y observar el mensaje.

## Causa raíz
No existe una capa de traducción de errores.

## Solución propuesta
1. Helper `toUserError(err, fallback)` que registre el detalle en el servidor y devuelva un mensaje genérico, con traducción explícita de códigos conocidos (23505 → "ya existe", P0001 → mensaje de negocio del trigger).
2. Callback: lista blanca de `next` (`['/establecer-clave', '/dashboard']`) o exigir que empiece por `/` y no por `//`.
3. Logger estructurado con redacción de campos sensibles.

## Riesgos de la solución
- Mensajes genéricos dificultan el soporte: incluir un ID de correlación en el mensaje y en el log.

## Tests necesarios
- Action con error de BD → mensaje genérico sin nombres de tabla.
- Callback con `next=/admin/usuarios` → redirige al valor por defecto.

## Plan de implementación
Helper + reemplazo progresivo por service.

## Criterios de aceptación
- Ningún mensaje al cliente contiene texto de error de Postgres o PostgREST.
