-- =============================================================================
-- Migración: 20260928_insistencia.sql
-- Fase 1 / Paso 5 — Registro de insistencias del Ejecutivo
-- -----------------------------------------------------------------------------
-- Cuando un ejecutivo detecta que su solicitud lleva demasiado tiempo detenida,
-- puede "insistir": se registra aquí y el Jefe Local / Logística reciben el aviso.
-- Restricción: 1 insistencia cada 24 h por (solicitud, usuario).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.insistencia (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id UUID NOT NULL REFERENCES public.solicitud(id) ON UPDATE CASCADE ON DELETE CASCADE,
  usuario_id   UUID NOT NULL REFERENCES public.usuario(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  mensaje      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.insistencia IS
  'Insistencias del Ejecutivo sobre el avance de su solicitud (cooldown 24h)';

CREATE INDEX IF NOT EXISTS idx_insistencia_solicitud ON public.insistencia(solicitud_id);
CREATE INDEX IF NOT EXISTS idx_insistencia_usuario   ON public.insistencia(usuario_id);
CREATE INDEX IF NOT EXISTS idx_insistencia_created   ON public.insistencia(solicitud_id, created_at DESC);

ALTER TABLE public.insistencia ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- Cooldown 24 h a nivel de base de datos (evita Carreras entre inserts)
-- La validación en el servicio sigue existiendo como feedback rápido, pero la
-- garantía real se aplica aquí con un lock por (solicitud, usuario).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_insistencia_cooldown()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ultima TIMESTAMPTZ;
BEGIN
  IF NEW.solicitud_id IS NULL OR NEW.usuario_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- advisory lock estable por par (solicitud, usuario) -> serializa inserts
  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.solicitud_id::text || ':' || NEW.usuario_id::text, 0)
  );

  SELECT max(created_at) INTO ultima
  FROM public.insistencia i
  WHERE i.solicitud_id = NEW.solicitud_id
    AND i.usuario_id = NEW.usuario_id;

  IF ultima IS NOT NULL AND ultima > (now() - INTERVAL '24 hours') THEN
    RAISE EXCEPTION
      'Ya registraste una insistencia en esta solicitud. Podés insistir nuevamente a partir del % (hora de Chile).',
      to_char(ultima + INTERVAL '24 hours', 'DD/MM/YYYY HH24:MI')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_insistencia_cooldown ON public.insistencia;
CREATE TRIGGER tr_insistencia_cooldown
  BEFORE INSERT ON public.insistencia
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_insistencia_cooldown();

-- -----------------------------------------------------------------------------
-- Verificación (P1.4 / P1.6)
-- -----------------------------------------------------------------------------
-- SELECT table_name FROM information_schema.tables
--  WHERE table_schema = 'public' AND table_name = 'insistencia';
-- SELECT tablename, rowsecurity FROM pg_tables
--  WHERE schemaname = 'public' AND tablename = 'insistencia';
