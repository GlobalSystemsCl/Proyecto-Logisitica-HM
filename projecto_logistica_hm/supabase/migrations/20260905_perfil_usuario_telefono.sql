-- Migración: Perfil de usuario usable — columna telefono
-- Fecha: 2026-09-05
-- Descripción: Agrega el teléfono de contacto al perfil del usuario para
-- utilizarlo en el módulo de Perfil, en el "Contacto responsable" del detalle
-- de solicitud y en los popups de datos de usuario (historial/observaciones).

ALTER TABLE public.usuario ADD COLUMN IF NOT EXISTS telefono VARCHAR(30);