-- Migracion: Solicitudes V2 - Data Migration
-- Fecha: 2026-08-26
-- Descripcion: Migrar solicitudes existentes de pendiente a pendiente_aprobacion.
-- NOTA: Este archivo debe ejecutarse DESPUES del archivo _v2.sql (schema).
-- Los nuevos valores del enum ya estan commiteados.

UPDATE public.solicitud
SET estado = 'pendiente_aprobacion'
WHERE estado = 'pendiente' AND ejecutivo_id IS NOT NULL;
