# Plan: requisitos del cliente (2026-11-03)

Análisis de los pedidos de la reunión, contrastados con el código de la rama `joaco-ciclo-2` (commit `e5584d8`), con las respuestas del cliente del mismo día. Para cada uno: qué se pide, qué existe hoy, la propuesta, los cambios de BD y el tamaño (S: menos de un día; M: 1–3 días; L: más de 3 días).

**Forma de trabajo (pedida por el equipo):** se avanza paso a paso, no todo de una. Cada paso se implementa, se verifica (`npm run test`, `typecheck`, `lint`, build) y se muestra antes de empezar el siguiente. Las migraciones las aplica el equipo en el SQL Editor, cada una con rollback y test de contrato. Al cerrar un paso se actualizan los contextos (documentación del sistema, READMEs de Supabase, `AGENTS.md`, `src/config/faq.ts`, memoria).

---

## Resumen

| # | Requisito | Tamaño | BD | Estado |
|---|---|---|---|---|
| E1 | La sesión se cierra a veces al volver atrás | M | No | **Hecho (paso 1)**; confirmar en los logs `[sesion]` |
| E2 | No se pudo recuperar la clave (`audit@hmotores.cl`) | M | No | **Hecho (paso 1)**: envío por Brevo |
| R1 | Venta de un vehículo que ya está en la sucursal | M | Sí | **Hecho (paso 8)**; solo ventas, no eventos |
| R2 | Notificación con enlace directo a la acción | S | No | **Hecho (paso 3)** |
| R3 | Logística con varias zonas | M | Sí | **Hecho (paso 11)** |
| R4 | Ver los vehículos de cada sucursal desde Slots | S | No | **Hecho (paso 9)** |
| R5 | Ver los vehículos en tránsito | S | No | **Hecho (paso 9)** |
| R6 | Vehículo sin ubicación no se puede pedir | S | No | **Hecho (paso 4)** |
| R7 | Torquemada Acopio / Torquemada Vitrina | S | Datos | Bloqueado: falta el Excel |
| R8 | Nuevas sucursales y sus códigos | S | Datos | Bloqueado: falta el Excel |
| R9 | Congelar cuenta de Logística y traspasar a un sustituto | L | Sí | **Hecho (paso 12)** |
| R10 | Empresas de transporte (RUT, transportista, patente) | M | Sí | **Hecho (paso 6)** |
| R11 | Documentos permitidos: Excel, PDF e imágenes | S | Sí | **Hecho (paso 4)**; migración del bucket |
| R12 | Traslados internos con selección múltiple | M | No | **Hecho (paso 7)** |
| R14 | Logística corrige el chasis de un vehículo reservado | S | No | Decidido: caso eventual, prioridad baja |
| R18 | Asignar ubicación en bloque con casillas | S | No | **Hecho (paso 4)** |
| R15 | Número de guía obligatorio al despachar | M | Sí | **Hecho (paso 5)** |
| R16 | Reportería y trackeo de empresas de transporte | L | No | **Hecho (paso 10)**: pestañas en Movimientos |
| R17 | Todos entran como ejecutivo activo | S | No | **Hecho (paso 2)** |

(R13, "al volver atrás", resultó ser el error E1.)

---

## E1. La sesión se cierra a veces al volver atrás

**Reporte.** Al volver atrás, algunas veces se pierde la sesión y hay que entrar de nuevo.

**Hoy.** El middleware (`src/lib/supabase/middleware.ts`) refresca la sesión y lee `usuario.activo/aprobado/requiere_cambio_clave` en cada petición. Dos problemas:
1. Si esa lectura falla por cualquier motivo transitorio (red, token recién rotado, límite de conexiones), `cuenta` queda `null`, `motivoCuentaBloqueada` lo trata como "cuenta desactivada" y el middleware llama `supabase.auth.signOut()`. Además `signOut()` usa el alcance global por defecto: **cierra la sesión del usuario en todos sus dispositivos**.
2. Al volver atrás el navegador y Next.js disparan varias peticiones a la vez (página, datos RSC, prefetch). Los logs de Auth del 2026-11-02 muestran 5 refrescos del mismo token en el mismo segundo desde instancias distintas. Supabase tolera esa carrera dentro del intervalo de reutilización, pero si una petición llega con un token ya rotado fuera de ese intervalo, la sesión se revoca.

**Propuesta.**
- Distinguir "error al leer la cuenta" de "la cuenta no existe o está bloqueada": ante un error se deja pasar la petición (o se reintenta una vez) y nunca se cierra la sesión.
- Cuando sí corresponde cerrar sesión (cuenta desactivada), usar `signOut({ scope: 'local' })` para no afectar otros dispositivos.
- Registrar en el log el motivo cada vez que el middleware cierra una sesión, para confirmar la causa en producción.
- Revisar que las páginas no refresquen el token desde Server Components (donde no se pueden guardar las cookies nuevas) y evaluar excluir del middleware las peticiones de prefetch.
- Tests de `decidirAcceso` y del middleware con lectura fallida.

## E2. No se pudo recuperar la clave de una cuenta

**Evidencia (2026-11-03).** La cuenta `audit@hmotores.cl` está activa y aprobada (administrador, con contraseña temporal sin usar: nunca inició sesión), pero en `auth.users` su `recovery_sent_at` es nulo: Supabase nunca le envió el correo. **Ninguno de los 10 usuarios tiene un envío de recuperación registrado**, así que la recuperación nunca ha funcionado en este proyecto. Los logs de Auth solo guardan 24 horas y no muestran el intento.

**Hoy** (`AuthService.sendPasswordResetEmail`, `auth.service.ts:448`): usa `resetPasswordForEmail` de Supabase. Causas, de la más a la menos probable (la 1 calza con la evidencia):
1. **El correo lo envía el SMTP por defecto de Supabase**, porque la fase I (SMTP propio con Brevo) no se hizo. Ese servicio solo entrega a direcciones del equipo del proyecto y tiene un límite de pocos correos por hora: a los usuarios reales no les llega.
2. El enlace usa el flujo PKCE: el código solo funciona en el mismo navegador donde se pidió. Si se pide en el computador y se abre en el celular, el callback falla y muestra "enlace expirado".
3. Por diseño (brecha 012), una cuenta inactiva o pendiente de aprobación no recibe el correo y la pantalla igual dice que se envió. Con R17 las cuentas nuevas quedan activas, pero las que hoy están pendientes siguen sin poder recuperar.

**Propuesta.**
- Generar el enlace en el servidor con `admin.auth.admin.generateLink({ type: 'recovery' })` y enviarlo con Brevo (`EmailService`, ya usado para las credenciales). El enlace lleva `token_hash` al callback existente, que funciona en cualquier navegador o dispositivo.
- Plantilla de correo propia en español, con el aviso de vigencia del enlace.
- Mensaje claro en la pantalla de "enlace expirado" con botón para pedir otro.
- Independiente de esto, la fase I (SMTP de Brevo en Supabase Auth) sigue recomendada para cualquier otro correo de Auth.
- Tests del servicio con el envío mockeado.

---

## R1. Venta de un vehículo que ya está en la sucursal

**Pedido.** Si el vehículo ya está en la sucursal del vendedor, no hay traslado ni pasa por Logística: el ejecutivo crea la solicitud, el jefe de local la aprueba y el paso siguiente es la entrega al cliente.

**Decisión (2026-11-03).** No se pueden mezclar en una solicitud vehículos que están en la sucursal con otros que no.

**Hoy.** Toda solicitud recorre `pendiente_aprobacion → aprobada → priorizada → calendarizada → en_transito → entregada (Recepcionada) → finalizada (Entregado a cliente)`. `aprobarSolicitud` (`solicitudes.service.ts:1260`) siempre deja `aprobada`, y `finalizarSolicitud` (`:2236`) exige `entregada`. La sucursal donde se entrega es `sucursalDeRecepcion` (`:280`).

**Propuesta.**
- Al crear: si todos los vehículos tienen `ubicacion = sucursalDeRecepcion`, la solicitud es "sin traslado"; si solo algunos, se rechaza ("No puedes mezclar vehículos que están en tu sucursal con otros que vienen de otra: crea dos solicitudes"). Validación en servidor y aviso en el formulario.
- Al aprobar una solicitud sin traslado, pasa directo a `entregada` ("Lista para entregar"), sin cola de Logística ni calendario, y queda "Entregar a cliente" para el ejecutivo y el jefe de local.
- `solicitud.sin_traslado boolean` para que reportes, prioridades y calendario la excluyan y el detalle lo explique.
- Slots: `fn_reservar_slots_solicitud_vehiculo` no debe reservar un slot en la sucursal donde el vehículo ya está.
- Notificaciones: la aprobación avisa al ejecutivo "lista para entregar"; Logística no recibe nada.

**BD.** Columna `sin_traslado`, ajuste de `fn_reservar_slots_solicitud_vehiculo` y de `tr_registrar_fechas_flujo` (salto `aprobada → entregada`).

---

## R2. Notificación con enlace directo a la acción

**Hoy.** `rutaNotificacion` (`lib/notificaciones-app.ts:208`) lleva siempre a `/solicitudes?solicitud=<id>` o a `/solicitudes/traslados`.

**Propuesta.** Ruta según el evento y el rol del destinatario, abriendo el detalle en la pantalla donde se hace la acción:

| Evento | Destinatario | Enlace |
|---|---|---|
| Solicitud creada | Jefe de local | `/solicitudes/aprobaciones?solicitud=<id>` |
| Aprobada | Logística de la zona | `/logistica/calendarizaciones?solicitud=<id>` (Prioridades es solo del jefe de local) |
| Asignada | Logística encargada | `/logistica/calendarizaciones?solicitud=<id>` |
| En tránsito | Jefe de local destino | `/solicitudes/recepciones?solicitud=<id>` |
| Recepcionada / lista para entregar | Ejecutivo | `/solicitudes?solicitud=<id>` (botón "Entregar a cliente") |
| Traslado interno | Origen / destino | `/solicitudes/traslados?traslado=<id>` |
| Nuevo usuario | Administrador | `/admin/usuarios?usuario=<id>` |

Cada pantalla destino lee el parámetro y abre el detalle. Función pura `rutaAccion(evento, rol, entidadId)` con tests.

**BD.** No.

---

## R3. Logística con varias zonas

**Hoy.** La migración `20261013155000` creó el índice único `usuario_zona_una_por_usuario`, y `lib/asignaciones.ts:55` exige exactamente una zona. Las lecturas (`getSucursalIdsDeZonasUsuario`, notificaciones por zona) ya trabajan con listas.

**Propuesta.** Migración que elimina el índice único; `asignaciones.ts` acepta una o más zonas; formulario de usuarios y edición masiva con selección múltiple de zonas; revisar las pantallas que muestran "la zona" del usuario.

**BD.** `drop index usuario_zona_una_por_usuario`.

---

## R4. Ver los vehículos de cada sucursal desde Slots

**Hoy.** `/logistica/slots` muestra capacidad, ocupados y reservados por sucursal, sin el detalle.

**Propuesta.** Clic en una sucursal → panel con los vehículos cuya `ubicacion` es esa sucursal (chasis, marca, modelo, color, estado) y los que van en camino hacia ella, con exporte a Excel. Consulta filtrada en el servidor.

---

## R5. Ver los vehículos en tránsito

**Decisión (2026-11-03).** No hay estados intermedios: el vehículo pasa de despachado a recepcionado como hoy.

**Propuesta.** Vista "En tránsito" para Logística con todas las solicitudes y traslados despachados y aún no recepcionados: origen, destino, chasis, guía (R15), empresa y patente (R10), fecha de despacho, días en camino y si va atrasado contra la fecha límite. Exporte a Excel. Sin cambios de BD.

---

## R6. Vehículo sin ubicación no se puede pedir

**Decisión del cliente (2026-11-03).** En las solicitudes que crean el jefe de local, el ejecutivo y Logística solo se pueden pedir vehículos que tengan un local de origen. Los vehículos en tránsito o en container (sin `ubicacion`) **nunca** se pueden pedir en una solicitud.

**Hoy.** El selector de vehículos muestra los que no tienen ubicación como "Sin sucursal" y deja elegirlos (`SolicitudesClient.tsx:1326`); `createSolicitud` no valida la ubicación.

**Propuesta.**
- Selector: se excluyen los vehículos sin ubicación.
- Servidor: `createSolicitud` rechaza la solicitud si algún vehículo tiene `ubicacion` nula ("El vehículo X está en tránsito o en container: asígnale una sucursal antes de pedirlo"), para todos los roles.
- Los vehículos que van en camino dentro de un traslado o una solicitud ya están bloqueados por su reserva; no cambian.
- Traslados internos: misma validación en `crearTraslado` por consistencia.
- Inventario: "No se puede pedir: sin sucursal de origen".
- Tests y pregunta frecuente.

**Antes de activarla (decidido 2026-11-03).** Los Excel de STOCK y COMPRAS vienen con Ubicación vacía. Logística asigna la ubicación a mano, en bloque, con casillas (R18). La regla puede activarse igual: mientras un vehículo no tenga ubicación simplemente no aparece para pedir.

---

## R7 y R8. Nuevas sucursales y Torquemada

**Pedido.** Torquemada se divide en "Torquemada Acopio" y "Torquemada Vitrina", con IDs nuevos; se espera el Excel con las sucursales nuevas.

**Propuesta.** Script de datos en `supabase/scripts/` que inserta las sucursales, mueve vehículos y usuarios de Torquemada y solo entonces da de baja la antigua (sin `DROP` ni `CASCADE`). Ensayo previo con lecturas.

**Bloqueado** hasta recibir el Excel.

---

## R9. Congelar una cuenta de Logística y traspasar a un sustituto

**Decisión (2026-11-03).** Las solicitudes del titular se traspasan al sustituto.

**Hoy.** Solo existe activar o desactivar la cuenta (`toggleUserStatus`, `users.service.ts:384`). Las solicitudes y traslados guardan `logistica_id`.

**Propuesta.** "Ausencia" desde Usuarios: titular, sustituto, desde y hasta.
- Al iniciar: la cuenta del titular queda congelada (no inicia sesión); sus solicitudes y traslados en curso pasan a `logistica_id = sustituto`; el sustituto suma las zonas del titular (depende de R3) y recibe las notificaciones de esas zonas.
- Al terminar: la cuenta se descongela, las zonas temporales se quitan al sustituto y **las solicitudes y traslados traspasados que sigan abiertos vuelven solos al titular** (decidido 2026-11-03). Los que el sustituto cerró se quedan a su nombre, para que la reportería refleje quién hizo el trabajo.
- Se guarda qué se traspasó (`ausencia_traspaso(ausencia_id, entidad, entidad_id)`) para devolver solo eso.
- El fin de la ausencia se aplica al primer ingreso o lectura después de la fecha "hasta" (o con un cron de Supabase), sin intervención del administrador.
- Todo queda en la auditoría.

**BD.** Tablas `ausencia_usuario(titular_id, sustituto_id, desde, hasta, creada_por)` y `ausencia_traspaso`, y marca de zona temporal en `usuario_zona`.

---

## R10. Empresas de transporte

**Decisión (2026-11-03).** En lugar de "transportista" se registra la **empresa** de transporte con su RUT, el **nombre del transportista** (conductor) y la **patente del camión**. Al calendarizar Logística solo ingresa la patente; filtros por RUT o patente.

**Hoy.** Tabla `transportista(nombre, rut, activo)` (fase C), elegida en el modal de calendarización y en el formulario de traslado; sin pantalla de gestión ni patente.

**Propuesta.**
- La tabla `transportista` pasa a representar la empresa (`nombre` = razón social, `rut` = RUT de la empresa).
- Tabla `camion(patente unique, empresa_id, conductor_nombre, activo)`: cada patente pertenece a una empresa y tiene su transportista habitual.
- Pantalla `/logistica/transportistas` (Logística y admin): empresas y sus camiones, activar/desactivar.
- Al calendarizar, reprogramar o crear un traslado se escribe la patente: se completan empresa, RUT y transportista; si no existe se ofrece crearla.
- La solicitud y el traslado guardan la patente y el conductor usados (`patente_camion`, `conductor_nombre`), aunque después cambien.
- Filtros por RUT o patente en calendario, movimientos y reportes; columnas nuevas en los Excel.

**BD.** Tabla `camion`, columnas `patente_camion` y `conductor_nombre` en `solicitud` y `traslado_interno`.

---

## R11. Documentos permitidos en la subida

**Hoy** (`lib/archivos.ts`): PDF, PNG, JPG/JPEG, WEBP, DOCX, XLSX, PPTX, TXT, CSV y ZIP; máximo 10 MB; se valida MIME, extensión y firma.

**Decisión (2026-11-03).** Se suben Excel, PDF e imágenes.

**Propuesta.**
- Permitidos: PDF; Excel `.xlsx` y `.xls` (el antiguo, con su firma OLE `D0 CF 11 E0`); imágenes PNG, JPG/JPEG y WEBP. HEIC no se acepta (decidido 2026-11-03).
- Se quitan DOCX, PPTX, TXT, CSV y ZIP de `TIPOS_DOCUMENTO` y del `accept` del selector. Los documentos ya subidos no se tocan.
- Mensaje junto al botón: "PDF, Excel o imagen, hasta 10 MB", y pregunta frecuente.
- Tests de `archivos.ts` (aceptados y rechazados).

---

## R12. Traslados internos con selección múltiple

**Hoy.** El formulario exige un vehículo (`TrasladosClient.tsx:129`) y la BD lo fuerza (`fn_validar_un_vehiculo_por_traslado`).

**Propuesta.** Casillas para elegir uno o muchos vehículos (con "seleccionar todos los del filtro"). Al confirmar se crea un traslado por vehículo con el mismo origen, destino, fecha, empresa, patente y conductor (R10), en una sola acción con resumen de creados y omitidos. Se mantiene la regla de la BD y la recepción y cancelación por vehículo.

---

## R14. Logística modifica el chasis

**Hoy.** Logística ya puede editar el chasis en el inventario; se rechaza si el vehículo está reservado o entregado (`updateVehiculo`).

**Propuesta.** Si el caso real es corregir el chasis de un vehículo reservado, permitir a Logística y admin editar solo el chasis con motivo obligatorio y registro en la auditoría.

**Decisión (2026-11-03).** Sí, eventualmente puede pasar (es raro): se implementa la corrección del chasis de un vehículo reservado, con prioridad baja.

---

## R18. Asignar ubicación en bloque con casillas

**Pedido (2026-11-03).** Logística asigna a mano la ubicación de los vehículos importados; conviene hacerlo con casillas para mover muchos autos a un local de una vez, con la misma lógica que los traslados internos (R12).

**Hoy.** Ya existe desde la fase G: en el inventario hay casillas, "Seleccionar los N disponibles del filtro" y una barra "Cambiar ubicación" con la sucursal de destino (`cambiarUbicacionMasivaAction`, hasta 500 vehículos, con auditoría por vehículo). Los vehículos sin ubicación son seleccionables (`esSeleccionableParaMover` solo excluye reservados, entregados y en tránsito).

**Propuesta (ajustes chicos).**
- Atajo "Sin ubicación (por asignar)" en el filtro de ubicación y un contador visible "N vehículos sin sucursal: no se pueden pedir" (enlaza con R6).
- Búsqueda por lista de chasis o IDV pegada (para asignar los que llegaron a un local según una guía o un correo).
- Misma experiencia de selección que R12 (componente compartido de casillas + "seleccionar todos los del filtro").
- Diferencia con un traslado: asignar ubicación corrige dónde está físicamente el auto, sin transporte ni recepción; el traslado interno mueve un auto entre locales con transportista y guía.

## R15. Número de guía obligatorio al despachar

**Pedido.** Sin número de guía no se despacha. La guía se asocia al chasis y se puede repetir en varios vehículos.

**Hoy.** `despacharSolicitud` (`:1951`) y `despacharTraslado` solo validan el estado.

**Propuesta.** Modal de despacho con una guía por vehículo y "usar la misma para todos". El servidor rechaza el despacho si falta alguna. Se ve en el detalle, recepciones, Excel del calendario, movimientos, vista en tránsito y reportes; se puede buscar por guía. "Revertir despacho" la conserva.

**BD.** `numero_guia text` en `solicitud_vehiculo` y `traslado_interno_vehiculo` (no única) e índice.

---

## R16. Reportería y trackeo de empresas de transporte

**Hoy.** Reportería de Logística por usuario (`lib/reporteLogistica.ts`) y reporte de movimientos (fase D2) con filtro por transportista.

**Propuesta.** Sección "Transportes" en reportería, con el mismo enfoque que la de Logística: filtros por fechas, empresa, RUT o patente; por empresa y por camión: viajes, vehículos, tramos, tiempo promedio de despacho a recepción, porcentaje a tiempo, atrasados; detalle por viaje (fecha, origen, destino, chasis, guía, patente, conductor, tiempos); exporte a Excel. Lógica pura en `lib/reporteTransportes.ts` con tests.

---

## R17. Todos entran como ejecutivo activo

**Decisión (2026-11-03).** Todas las cuentas que se registran quedan **activas** como ejecutivo. El administrador no aprueba una por una: solo cambia el rol (y la sucursal) cuando corresponde. Reemplaza la decisión del 2026-10-20 (registro pendiente de aprobación).

**Hoy.** `AuthService.register` crea la cuenta como ejecutivo con `activo=false, aprobado=false`; el login y el middleware la bloquean hasta que el admin la activa; el mensaje dice que quedó pendiente.

**Propuesta.**
- El registro crea la cuenta activa y aprobada como ejecutivo de la sucursal elegida, con el dominio restringido a `@hmotores.cl`.
- Mensaje: "Tu cuenta está activa como Ejecutivo en la sucursal X. Si este no es tu rol o tu sucursal, contacta al administrador (correo de soporte)". Se muestra al registrarse y como aviso en el primer ingreso.
- El administrador sigue recibiendo `NUEVO_USUARIO`, con el texto "se registró como ejecutivo; revisa si el rol corresponde" y enlace a ese usuario.
- "Cuentas pendientes" pasa a ser "Cuentas nuevas" (últimos registros) y la activación masiva queda como **cambio de rol masivo**.
- Script de datos para activar las cuentas que hoy siguen pendientes.
- Actualizar preguntas frecuentes y la documentación de la fase F.

---

## Orden propuesto (paso a paso)

| Paso | Contenido | Por qué |
|---|---|---|
| 1 | E1 sesión, E2 recuperación de clave | Errores que hoy impiden usar el sistema |
| 2 | R17 registro activo | Decisión cerrada, cambio chico y afecta a todos los usuarios nuevos |
| 3 | R2 enlaces directos | Chico, sin BD |
| 4 | R6 sin ubicación, R18 ubicación en bloque, R11 documentos | Decididos y chicos |
| 5 | R15 guía de despacho | Operación diaria de Logística |
| 6 | R10 empresas de transporte | Base para R12, R5 y R16 |
| 7 | R12 traslados múltiples | Usa la empresa y la patente |
| 8 | R1 venta desde la sucursal | Cambia el flujo principal |
| 9 | R5 vista en tránsito, R4 vehículos por sucursal | Visualización |
| 10 | R16 reportería de transportes | Usa la guía y la patente |
| 11 | R3 multizona, R9 ausencias | R9 se apoya en R3 |
| 12 | R14 | Al recibir la respuesta |
| 13 | R7–R8 sucursales nuevas | Cuando llegue el Excel |

## Pendiente del cliente

1. R7–R8: Excel de sucursales nuevas, incluida la división de Torquemada (aún no está; sin apuro).
