# Prompt: prueba de flujos completa — Logística H.Motores

> Pega este prompt a un agente con control del navegador (o úsalo como guion de QA manual).
> Completa antes la tabla de cuentas con las contraseñas de cada usuario.

---

## Rol y objetivo

Eres un tester funcional. Vas a recorrer **todo el sistema de traslados de vehículos de H.Motores**
con cada rol, usando los datos de prueba ya cargados en la base. El objetivo es encontrar errores
de flujo, permisos, validaciones, notificaciones y visualización, y entregar un informe con
evidencia. No corriges código: solo pruebas y reportas.

URL de la app: `<URL>` (local: `http://localhost:3000`).

## Reglas (obligatorias)

1. **Es la base de producción.** Opera solo sobre solicitudes y traslados de prueba: su id empieza
   con `5eed` y en pantalla aparecen como `#5EED…`. No avances, canceles ni elimines nada que no
   empiece así.
2. **Los correos son reales.** Cada cambio de estado envía correos (Brevo) a los usuarios
   involucrados. Hazlo con moderación: no más de 2 veces por tipo de acción.
3. No crees, desactives ni edites usuarios reales, salvo la activación de la cuenta pendiente
   (sección 6.1). No cambies contraseñas.
4. **No pruebes el bloqueo por 5 intentos fallidos** con cuentas reales. Pide antes una cuenta
   desechable.
5. No borres sucursales, zonas, marcas ni vehículos. Puedes crear y editar un vehículo de prueba
   con chasis `TEST-QA-…` y eliminarlo al final.
6. Si algo falla, registra el hallazgo y sigue. No repitas una acción destructiva para "confirmar".

## Cuentas de prueba

| Alias | Usuario | Rol | Sucursal base / alcance | Correo | Contraseña |
|---|---|---|---|---|---|
| ADM | maria veronica palacios | Administrador | Todas | `<correo>` | `<clave>` |
| JL6 | Joaquin Lepe | Jefe de Local | 15 Norte (6) + a cargo de Santiago Centro (8) y Valparaíso (9) | `<correo>` | `<clave>` |
| JL7 | maickol concon | Jefe de Local | Concón (7) | `<correo>` | `<clave>` |
| EJ9 | almendra 15 norte | Ejecutivo | Valparaíso (9) | `<correo>` | `<clave>` |
| EJ6 | global systems | Ejecutivo | 15 Norte (6) | `<correo>` | `<clave>` |
| LG | joaquin logistica | Logística | Zona 1 (sucursales 6, 7 y 9) | `<correo>` | `<clave>` |
| LG0 | flowcode soluciones / maickol logistic | Logística | **Sin zona** | `<correo>` | `<clave>` |
| PEND | OSCAR PEREZ | Cuenta registrada pendiente de activar | — | `<correo>` | — |

No hay usuarios de **Operaciones** ni de Logística de la **zona 2**: esos casos quedan fuera.
Anótalos como "no cubiertos".

## Datos cargados (al 2026-10-14)

- **130 solicitudes de prueba en todos los estados:**

  | Estado | Cantidad |
  |---|---|
  | Pendiente de aprobación | 13 |
  | Aprobada | 9 |
  | Priorizada | 15 |
  | Asignada | 9 |
  | Programada (calendarizada) | 13 |
  | En tránsito (4 atrasadas) | 12 |
  | Recepcionada (entregada) | 10 |
  | Finalizada | 29 |
  | Rechazada | 8 |
  | Cancelada (incluye canceladas en tránsito) | 12 |

- **Incluyen:**
  - 14 eventos;
  - solicitudes creadas por un jefe de local y delegadas a un ejecutivo;
  - aprobaciones del administrador;
  - reprogramaciones y despachos revertidos;
  - recepciones con novedades;
  - entregas fuera de plazo;
  - insistencias (6 en las últimas 24 h, con el cooldown activo).
- **10 traslados internos:** pendiente, en tránsito (hacia 15 Norte y hacia Concón), recepcionado y cancelado.
- **513 notificaciones en la campana** (eventos de los últimos 14 días). Las de más de 2 días están leídas.
  - Por usuario: JL6 172 (26 sin leer), EJ9 112 (12), LG 108 (14), EJ6 103 (12), JL7 18 (0).
  - El administrador no recibe notificaciones.
- **Colas de prioridad:** 15 Norte 12, Valparaíso 10, Concón 3, Santiago Centro 1.
- **Slots:** Valparaíso y 15 Norte tienen capacidad 2 y están muy sobre ese límite. Es la "marcha blanca": solo se avisa, no se bloquea.
- **Conocido:** todas las solicitudes de prueba muestran el mismo código `#5EED0001`, porque solo se ven los primeros 8 caracteres del id. Para ubicarlas, usa la ruta, los vehículos o el título del evento. Reporta igual cómo afecta a la búsqueda por N°.

## 1. Matriz de permisos por rol

Para cada rol, entra y verifica **qué ve** y **qué puede hacer**. También prueba lo que **no debe poder hacer**: entra por URL directa a rutas ajenas, por ejemplo `/admin/usuarios` como ejecutivo.

| Capacidad | ADM | JL | EJ | LG | LG sin zona |
|---|---|---|---|---|---|
| Dashboard | Paneles: cuentas por activar + pendientes JL | Paneles: por aprobar / recepciones / por priorizar | Redirige a `/solicitudes` | Paneles: por programar / por despachar / traslados internos + indicadores | Sin datos |
| Crear solicitud | Sí | Sí, en sus sucursales; queda aprobada; puede delegar | Sí, solo su sucursal; queda pendiente | No | No |
| Aprobar / rechazar | Sí | Sus sucursales | No | No | No |
| Priorizar / reordenar cola (arrastrar) | Sí | Sus sucursales | No | No | No |
| Asignar encargado, programar, reprogramar, quitar programación | Programar sí | Programar sí | No | Sí (su zona) | No |
| Despachar / revertir despacho | Sí | No | No | Sí | No |
| Cancelar en tránsito | No | No | No | Sí | No |
| Recibir (con novedades y fotos) | Sí | Sucursal de destino | No | No | No |
| Finalizar (entregar al cliente) | Sí | Destino | Solo las propias | No | No |
| Cancelar antes del despacho | Sí | Su sucursal | Las propias | Su zona | No |
| Insistir (1 cada 24 h) | No | No | Las propias | No | No |
| Traslados internos | Sí | Solo recibir (destino) | No | Crear / despachar / cancelar | No |
| Vehículos: crear / editar / importar | Sí | Sí | No | Sí | — |
| Eliminar vehículo | Sí | No | No | No | No |
| Usuarios, sucursales/zonas, historial, reportería | Sí | No | No | No | No |

## 2. Flujos de punta a punta (crea solicitudes nuevas)

Crea solicitudes nuevas para recorrer el ciclo completo. Así ves tus propias notificaciones y
correos en tiempo real. Anota el id completo de cada una (está en la URL del detalle,
`/solicitudes?solicitud=<id>`).

1. **Venta completa.** Recorrido:
   - EJ9 crea una venta en Valparaíso con 1 vehículo;
   - JL6 la aprueba ajustando la fecha límite y la prioriza (arrastrándola);
   - LG asigna el encargado, la programa (arrastrando al calendario), la reprograma con motivo y la despacha;
   - JL6 la recibe **con novedades y una foto**;
   - EJ9 la finaliza.

   En cada paso verifica: el estado, el historial (incluida la primera entrada "Solicitud creada" con autor y fecha), la campana de cada destinatario y el contador de slots.
2. **Evento.** JL7 crea un evento en Concón. Verifica:
   - el distintivo **EVENTO** fucsia en la lista, las aprobaciones, las prioridades, el calendario y el detalle;
   - que exige título y dirección;
   - que, al recibirlo, los vehículos vuelven al stock.
3. **Delegación.** JL6 crea una solicitud y la delega a EJ6. EJ6 debe verla como propia y el historial debe mostrar la delegación.
4. **Rechazo.** JL6 rechaza una solicitud pendiente:
   - el motivo exige al menos 5 caracteres;
   - EJ ve el motivo arriba del detalle y la opción de crear una nueva.
5. **Cancelaciones.** Cancela:
   - como EJ, una solicitud pendiente;
   - como JL, una solicitud en la cola (la cola se debe compactar a 1..N);
   - como LG, una solicitud en tránsito, indicando la ubicación final.
6. **Despacho revertido.** LG despacha y luego usa "Deshacer despacho". La solicitud debe volver a Programada.
7. **Quitar programación.** LG quita la programación de una solicitud: vuelve a la cola, al final.
8. **Traslado interno.** LG crea un traslado (1 vehículo) Valparaíso → 15 Norte y lo despacha. JL6 lo recibe desde el dashboard. Crea otro y cancélalo en tránsito.
9. **Insistencia.** EJ insiste en una solicitud propia. Un segundo intento antes de 24 h debe estar bloqueado.

## 3. Límites y validaciones

Prueba el valor válido, el límite y el inválido. El mensaje de error debe ser claro y en español.

- **Motivo de rechazo y de cancelación:** 4 caracteres (debe fallar) y 5 (debe pasar).
- **Fechas:**
  - la fecha límite y la de despacho no pueden ser anteriores a hoy;
  - programar después de la fecha límite muestra la advertencia "Programar igual";
  - reprogramar a la misma fecha debe fallar.
- **Vehículos de una solicitud:**
  - al crear, se exige al menos 1;
  - no se puede quitar el último;
  - un vehículo reservado en otra solicitud activa no debe aparecer disponible.
- **Ejecutivo:** solo crea en su sucursal y con destino su sucursal.
- **Cola de prioridad:** posiciones 1..N sin huecos después de priorizar, reordenar, programar o cancelar.
- **Documentos:**
  - archivo de 10 MB, de más de 10 MB y de un tipo no permitido (por ejemplo `.exe`);
  - descarga mediante enlace temporal.
- **Paneles del dashboard:** muestran hasta 7 filas y luego "Ver todas (N más)". La campana muestra 20 notificaciones y el contador de no leídas.
- **Slots sobre capacidad:** se puede seguir operando y el aviso es visible.
- **Registro:** correo duplicado, contraseña de menos de 8 caracteres y correo del administrador principal.
- **Login:** cuenta pendiente de aprobación y cuenta desactivada, cada una con su mensaje.

## 4. Notificaciones

Para cada evento que dispares, verifica que en la **campana** de cada destinatario aparezca la
notificación. También verifica que **no** le llegue a quien hizo la acción, y que al hacer clic
abra el detalle correcto. Revisa "marcar como leída" y "marcar todas". Si tienes acceso a los
correos, confirma los de los hitos críticos.

| Evento | Destinatarios esperados (campana) |
|---|---|
| Creada por ejecutivo | Jefe de local de origen |
| Aprobada (o creada por JL) | Ejecutivo + Logística de la zona |
| Rechazada | Ejecutivo |
| Priorizada | Ejecutivo |
| Asignada | Encargado de Logística + ejecutivo |
| Programada / reprogramada | Ejecutivo + JL origen + JL recepción |
| Programación quitada | Ejecutivo + JL origen |
| Despachada / despacho revertido | JL recepción + ejecutivo |
| Recepcionada | Ejecutivo + encargado de Logística |
| Finalizada | JL origen + encargado de Logística |
| Cancelada | Ejecutivo + JL origen + encargado de Logística |
| Cancelada en tránsito | Ejecutivo + JL origen + JL recepción + encargado de Logística |
| Traslado interno cancelado | JL origen + JL destino + encargado de Logística |

Prueba también el **tiempo real**: con dos navegadores abiertos (actor y destinatario), la
campana del destinatario debe actualizarse sin recargar.

## 5. Visual y usabilidad

- **Calendario de logística** (`/logistica/calendarizaciones`):
  - un clic **sin arrastrar** en una tarjeta abre el detalle;
  - arrastrar sigue programando y reprogramando;
  - cada tarjeta muestra el N° de solicitud;
  - el buscador filtra por N° (con o sin `#`), patente o chasis;
  - vistas mes, semana y día;
  - filtros e indicadores clicables.
- **Detalle de solicitud:**
  - pestañas Información, Historial, Observaciones y Documentos;
  - el historial empieza con quién creó la solicitud y cuándo.
- **Dashboards por rol:** contadores correctos y los botones "Ver" o "Revisar" llevan a la vista de la acción.
- **Pantalla:** revisa en móvil (375 px) y escritorio. Nada se debe desbordar ni montar.

## 6. Administración

1. **Activar cuenta** (PEND) desde el panel "Cuentas por activar" del dashboard:
   - el rol es obligatorio y empieza vacío;
   - la sucursal que indicó el usuario al registrarse aparece completada;
   - para jefe de local se eligen sucursales adicionales (las de otro jefe aparecen bloqueadas), para logística se elige zona y para ejecutivo solo la sucursal;
   - el resumen "Así quedará la cuenta" refleja la elección y hay que marcar la confirmación.

   **Después:** el usuario puede iniciar sesión con ese rol.
2. **Usuarios:** al editar el rol, los campos cambian según el rol. Un jefe de local no puede tomar la sucursal de otro jefe.
3. **Historial global:** filtros y exportación a Excel.
4. **Reportería de logística:** período y exportación a Excel.
5. **Vehículos:** crear, editar, filtrar e importar un CSV pequeño de prueba. El vehículo de prueba se elimina al final.

## Formato del informe

Entrega una tabla de hallazgos y, al final, un resumen.

| # | Severidad (Crítica/Alta/Media/Baja) | Rol | Pantalla / acción | Pasos | Esperado | Obtenido | Evidencia (captura, id) |
|---|---|---|---|---|---|---|---|

**Resumen:**
- cobertura por sección (probado / con fallas / no cubierto);
- lista de ids de solicitudes y traslados que creaste o moviste;
- correos que se enviaron;
- **propuestas para mejorar esta prueba:** datos que faltaron, roles sin usuario, casos que no se pudieron reproducir y validaciones que conviene automatizar.

No limpies los datos al terminar: la limpieza se hace con `supabase/seed/02_limpiar_escenarios.sql`.
