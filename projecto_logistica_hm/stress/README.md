# Prueba de estrés — H.Motores

Kit aislado para medir capacidad bajo carga. No forma parte de la app: nada aquí se importa desde `src/`.

## Reglas de seguridad (decididas el 2026-11-17)

- **Base de datos:** es la de producción (`yaqbccvlenouqmtqrlrq`, la única que existe). Todos los scripts se detienen si `.env.local` apunta a otro proyecto.
- **Datos ficticios marcados:** zona 9001 (`STRESS - Prueba de carga`), sucursales 9001–9029 (`STRESS Sucursal NN`), usuarios `stress.*@prueba-carga.invalid` (apellido con `[STRESS]`), vehículos con chasis `STRESS*` (modelo `PRUEBA DE CARGA - NO SOLICITAR`) y transportista RUT `99999990-1`. Las sucursales reales (101–145), sus correlativos y sus estacionamientos no se tocan.
- **Correo:** la carga va contra el deploy de **preview de la rama `stress-test`**, nunca contra producción. Ahí el correo queda bloqueado por dos barreras:
  1. `CORREO_SIMULADO=1` (o rama `stress-test`): `EmailService.enviarCorreo` devuelve un fallo antes de llamar a Brevo (`src/lib/correoSimulado.ts`).
  2. `BREVO_API_KEY` de esa rama es inválida a propósito.
  Ese fallo queda en `correo_envio` como `fallido`, así que no consume el tope diario compartido con producción.
  Las cuentas ficticias se crean con `auth.admin.createUser` y `email_confirm: true`, que no envía correos.
- **Corte automático:** errores HTTP > 5 %, p95 > 5 s o más de 50 conexiones a la BD.
- **Limpieza:** `04-limpieza.mjs` borra solo lo marcado y se niega a borrar si algún dato real depende de algo ficticio.

## Requisitos

- Node 20+, `.env.local` con las claves de Supabase.
- k6 (`winget install GrafanaLabs.k6`).
- Secreto de **Protection Bypass for Automation** del proyecto en Vercel (Settings → Deployment Protection), en `STRESS_VERCEL_BYPASS` o en `stress/out/vercel-bypass.txt`.

## Pasos

```bash
# 0. Inventario de protección: ejecutar stress/sql/inventario.sql (SQL editor) y guardar el resultado.
# 1. Zona ficticia (sin gastar la secuencia real de zona.id)
#    -> ejecutar stress/sql/crear-zona.sql
# 2. Datos: 114 cuentas, 29 sucursales, ~15.600 vehículos, 10.800 solicitudes con historial
node stress/01-generar-datos.mjs --plan    # solo muestra el plan
node stress/01-generar-datos.mjs           # idempotente: salta lo que ya existe
#    -> ejecutar stress/sql/recalcular-slots.sql
# 3. Carga progresiva (prepara sesiones y colas antes de cada nivel)
node stress/03-ejecutar.mjs                # 20, 40, 80, 122, 150, 200 VU
node stress/03-ejecutar.mjs 20             # un solo nivel
# 4. Limpieza
node stress/04-limpieza.mjs                # simulacro
node stress/04-limpieza.mjs --ejecutar
# 5. Inventario final: stress/sql/inventario.sql y comparar con el inicial.
```

Resultados en `stress/out/` (no se versiona: tiene sesiones, la contraseña de las cuentas ficticias y correos reales del inventario):

| Archivo | Contenido |
| --- | --- |
| `generacion.json` | Tiempo y filas/s de cada tabla en la carga masiva |
| `k6-<N>vus.json` | Resumen de k6: p50/p95/p99 por operación, errores, req/s |
| `monitor-<N>vus.json` | Serie de CPU, RAM, carga, conexiones, TPS, deadlocks y esperas del pool cada 5 s |
| `preparacion.json` | Colas disponibles y logins directos a Auth |
| `limpieza.json` | Qué se borró |

## Qué simula cada perfil

| Perfil | Lecturas | Escrituras (Server Actions reales) |
| --- | --- | --- |
| Ejecutivo | `/solicitudes`, detalle, historial, observaciones, campana | crear venta / evento, finalizar |
| Jefe de local | dashboard, aprobaciones, prioridades, recepciones, vehículos de su sucursal | aprobar, rechazar (con motivo), priorizar, recibir |
| Logística | dashboard, calendarizaciones, tránsito, slots, reportes | asignar, calendarizar (con camión), despachar (con guías) |
| Administrador | dashboard, usuarios, historial, vehículos, sucursales, reportes | — |

Cada usuario virtual espera de 2 a 8 s entre acciones. Uno de cada cuatro inicia sesión por el formulario de la app (`loginAction`); el resto reutiliza sesiones creadas con `@supabase/ssr`. El 10 % de las ventas pide un vehículo de un pozo compartido para medir conflictos de reserva. Sobre 122 VU, varios usuarios virtuales comparten cuenta, como si una persona abriera varias pestañas.
