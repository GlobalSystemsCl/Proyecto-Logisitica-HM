-- Inventario de protección (solo lectura). Se ejecuta antes y después de la prueba.
-- "Real" = todo lo que NO tiene la marca de simulación:
--   usuarios con correo @prueba-carga.invalid, sucursales >= 9001, zona 9001,
--   vehículos con chasis 'STRESS%', transportista con RUT 99999990-1.
-- Excluye columnas que cambian por uso normal (last_sign_in_at, updated_at).
with
u_real as (
  select u.id, u.email, u.nombre, u.apellido, u.rol::text rol, u.sucursal_id, u.activo, u.aprobado,
         u.requiere_cambio_clave, u.telefono, u.bloqueado_hasta, u.intentos_fallidos
  from public.usuario u where u.email not like '%@prueba-carga.invalid'
),
a_real as (
  select a.id, a.email, md5(coalesce(a.encrypted_password, '')) clave_md5, a.banned_until, a.deleted_at,
         a.raw_app_meta_data, a.raw_user_meta_data, a.email_confirmed_at, a.is_sso_user
  from auth.users a where a.email not like '%@prueba-carga.invalid'
)
select json_build_object(
  'tomado_en', now(),
  'usuarios', (select json_agg(json_build_object(
      'id', id, 'email', email, 'rol', rol, 'sucursal_id', sucursal_id, 'activo', activo,
      'hash', md5(row(u_real.*)::text)) order by email) from u_real),
  'usuarios_por_rol', (select json_object_agg(rol, n) from (select rol, count(*) n from u_real group by rol) t),
  'auth', (select json_agg(json_build_object('id', id, 'email', email, 'clave_md5', clave_md5,
      'hash', md5(row(a_real.*)::text)) order by email) from a_real),
  'usuario_zona', (select json_agg(json_build_object('usuario_id', usuario_id, 'zona_id', zona_id, 'ausencia_id', ausencia_id)
      order by usuario_id, zona_id) from public.usuario_zona where zona_id <> 9001),
  'zonas', (select json_agg(json_build_object('id', id, 'nombre', nombre) order by id) from public.zona where id <> 9001),
  'sucursales', (select json_agg(json_build_object('id', id, 'usuario_id', usuario_id, 'zona_id', zona_id,
      'hash_config', md5(row(id, nombre, direccion, slots, zona_id, usuario_id)::text),
      'slots_ocupados', slots_ocupados, 'slots_reservados', slots_reservados,
      'ultimo_numero_solicitud', ultimo_numero_solicitud) order by id) from public.sucursal where id < 9001),
  'vehiculos', (select json_build_object('n', count(*),
      'hash', md5(string_agg(md5(row(v.id, v.chasis, v.patente, v.marca, v.modelo, v.ubicacion, v.precio)::text), '' order by v.id)))
      from public.vehiculo v where v.chasis not like 'STRESS%'),
  'solicitudes', (select json_build_object('n', count(*),
      'por_estado', (select json_object_agg(estado, n) from (select estado::text, count(*) n from public.solicitud where coalesce(sucursal, 0) < 9001 group by 1) t),
      'hash', md5(string_agg(md5(row(s.id, s.estado, s.sucursal, s.numero, s.ejecutivo_id, s.jefe_local_id, s.logistica_id, s.fecha_actualizacion)::text), '' order by s.id)))
      from public.solicitud s where coalesce(s.sucursal, 0) < 9001),
  'solicitud_vehiculo', (select count(*) from public.solicitud_vehiculo sv join public.solicitud s on s.id = sv.solicitud_id where coalesce(s.sucursal, 0) < 9001),
  'auditoria', (select count(*) from public.auditoria a join public.usuario u on u.id = a.usuario_id where u.email not like '%@prueba-carga.invalid'),
  'notificacion', (select count(*) from public.notificacion n join public.usuario u on u.id = n.usuario_id where u.email not like '%@prueba-carga.invalid'),
  'observacion', (select count(*) from public.observacion o join public.usuario u on u.id = o.usuario_id where u.email not like '%@prueba-carga.invalid'),
  'correo_envio', (select json_build_object('n', count(*), 'enviados', count(*) filter (where estado = 'enviado'))
      from public.correo_envio where email not like '%@prueba-carga.invalid'),
  'transportistas', (select count(*) from public.transportista where rut <> '99999990-1'),
  'camiones', (select count(*) from public.camion c join public.transportista t on t.id = c.transportista_id where t.rut <> '99999990-1'),
  'traslados', (select count(*) from public.traslado_interno where origen_id < 9001 and destino_id < 9001)
) inventario;
