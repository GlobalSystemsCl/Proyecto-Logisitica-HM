-- Normalizar todas las fechas a TIMESTAMPTZ (Chile: America/Santiago)
ALTER TABLE public.usuario ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'America/Santiago';
ALTER TABLE public.usuario ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'America/Santiago';

ALTER TABLE public.solicitud ALTER COLUMN fecha_creacion TYPE timestamptz USING fecha_creacion AT TIME ZONE 'America/Santiago';
ALTER TABLE public.solicitud ALTER COLUMN fecha_actualizacion TYPE timestamptz USING fecha_actualizacion AT TIME ZONE 'America/Santiago';

ALTER TABLE public.vehiculo ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'America/Santiago';
ALTER TABLE public.vehiculo ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'America/Santiago';

ALTER TABLE public.solicitud_vehiculo ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'America/Santiago';

ALTER TABLE public.auditoria ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'America/Santiago';

ALTER TABLE public.observacion ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'America/Santiago';
ALTER TABLE public.observacion ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'America/Santiago';

ALTER TABLE public.notificacion ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'America/Santiago';
