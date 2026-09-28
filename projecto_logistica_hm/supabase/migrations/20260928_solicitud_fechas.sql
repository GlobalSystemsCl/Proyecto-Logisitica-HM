-- =============================================================================
-- Migración: 20260928_solicitud_fechas.sql
-- Fase 1 / Paso 1 — Trazabilidad de fechas del flujo de solicitudes
-- -----------------------------------------------------------------------------
-- Agrega 4 timestamps de trazabilidad al flujo:
--   fecha_confirmacion    -> momento en que el Jefe Local aprueba
--   fecha_inicio_transito -> momento en que Logística despacha
--   fecha_recepcion       -> momento en que el JL destino recepciona
--   fecha_entrega_cliente -> momento en que se entrega al cliente final
--
-- Los valores se registran desde TypeScript (servicio) y ademas se respaldan
-- con el trigger BEFORE UPDATE `tr_registrar_fechas_flujo` (migracion 3).
--
-- Ejecutar en: Supabase SQL Editor -> public
-- =============================================================================

ALTER TABLE public.solicitud
  ADD COLUMN IF NOT EXISTS fecha_confirmacion    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fecha_inicio_transito TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fecha_recepcion       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fecha_entrega_cliente TIMESTAMPTZ;

COMMENT ON COLUMN public.solicitud.fecha_confirmacion IS
  'Momento en que la solicitud fue aprobada/confirmada por el Jefe Local';
COMMENT ON COLUMN public.solicitud.fecha_inicio_transito IS
  'Momento en que la solicitud paso a estado despachada (inicio del transito)';
COMMENT ON COLUMN public.solicitud.fecha_recepcion IS
  'Momento en que el Jefe Local destino recepciono la solicitud (estado entregada)';
COMMENT ON COLUMN public.solicitud.fecha_entrega_cliente IS
  'Momento en que la solicitud fue entregada al cliente final (estado finalizada)';

-- -----------------------------------------------------------------------------
-- Backfill historico (idempotente: solo completa columnas vacias)
-- -----------------------------------------------------------------------------

-- `entregada` (UI: "Recepcionada") -> fecha_recepcion desde la entrega original
UPDATE public.solicitud
   SET fecha_recepcion = fecha_entrega
 WHERE estado = 'entregada'
   AND fecha_recepcion IS NULL
   AND fecha_entrega IS NOT NULL;

-- `finalizada` (UI: "Entregado a cliente") -> fecha_entrega_cliente desde la actualizacion
UPDATE public.solicitud
   SET fecha_entrega_cliente = fecha_actualizacion
 WHERE estado = 'finalizada'
   AND fecha_entrega_cliente IS NULL;

-- `aprobada` sin fecha de creacion posterior al despacho -> no hay dato fiable, se deja NULL
-- `despachada`/`en_transito` -> se deriva fecha_inicio_transito de fecha_despacho
UPDATE public.solicitud
   SET fecha_inicio_transito = fecha_despacho
 WHERE estado IN ('despachada', 'en_transito')
   AND fecha_inicio_transito IS NULL
   AND fecha_despacho IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Verificación (P1.1)
-- -----------------------------------------------------------------------------
-- SELECT column_name, data_type
--   FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'solicitud'
--    AND column_name IN ('fecha_confirmacion','fecha_inicio_transito',
--                        'fecha_recepcion','fecha_entrega_cliente')
--  ORDER BY column_name;
-- ESPERADO: 4 filas
