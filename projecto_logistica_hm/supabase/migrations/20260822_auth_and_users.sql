-- Migración: Sistema de Autenticación y Gestión de Usuarios
-- Fecha: 2026-08-22
-- Descripción: Creación/actualización de tabla public.usuario, RLS, triggers y configuración del administrador inicial.

-- 1. Crear tabla public.usuario si no existe
CREATE TABLE IF NOT EXISTS public.usuario (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    nombre TEXT NOT NULL DEFAULT 'Usuario',
    apellido TEXT NOT NULL DEFAULT '',
    rol TEXT NOT NULL DEFAULT 'ejecutivo',
    activo BOOLEAN NOT NULL DEFAULT true,
    requiere_cambio_clave BOOLEAN NOT NULL DEFAULT false,
    intentos_fallidos INTEGER NOT NULL DEFAULT 0,
    bloqueado_hasta TIMESTAMPTZ,
    sucursal_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. Asegurar todas las columnas si la tabla ya existía previamente
ALTER TABLE public.usuario ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.usuario ADD COLUMN IF NOT EXISTS nombre TEXT DEFAULT 'Usuario';
ALTER TABLE public.usuario ADD COLUMN IF NOT EXISTS apellido TEXT DEFAULT '';
ALTER TABLE public.usuario ADD COLUMN IF NOT EXISTS rol TEXT DEFAULT 'ejecutivo';
ALTER TABLE public.usuario ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT true;
ALTER TABLE public.usuario ADD COLUMN IF NOT EXISTS requiere_cambio_clave BOOLEAN DEFAULT false;
ALTER TABLE public.usuario ADD COLUMN IF NOT EXISTS intentos_fallidos INTEGER DEFAULT 0;
ALTER TABLE public.usuario ADD COLUMN IF NOT EXISTS bloqueado_hasta TIMESTAMPTZ;
ALTER TABLE public.usuario ADD COLUMN IF NOT EXISTS sucursal_id UUID;
ALTER TABLE public.usuario ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
ALTER TABLE public.usuario ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());

-- Asegurar valores por defecto en registros existentes
UPDATE public.usuario SET activo = true WHERE activo IS NULL;
UPDATE public.usuario SET requiere_cambio_clave = false WHERE requiere_cambio_clave IS NULL;
UPDATE public.usuario SET intentos_fallidos = 0 WHERE intentos_fallidos IS NULL;
UPDATE public.usuario SET rol = 'ejecutivo' WHERE rol IS NULL;

-- 3. Índices de optimización
CREATE INDEX IF NOT EXISTS idx_usuario_email ON public.usuario(email);
CREATE INDEX IF NOT EXISTS idx_usuario_rol ON public.usuario(rol);
CREATE INDEX IF NOT EXISTS idx_usuario_activo ON public.usuario(activo);

-- 4. Función trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_usuario_updated_at ON public.usuario;
CREATE TRIGGER tr_usuario_updated_at
    BEFORE UPDATE ON public.usuario
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- 5. Función de seguridad para comprobar si el usuario autenticado es Administrador
CREATE OR REPLACE FUNCTION public.es_administrador()
RETURNS BOOLEAN AS $$
DECLARE
    v_rol TEXT;
    v_activo BOOLEAN;
BEGIN
    SELECT rol, activo INTO v_rol, v_activo
    FROM public.usuario
    WHERE id = auth.uid();

    RETURN (v_rol = 'administrador' AND COALESCE(v_activo, true) = true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Habilitar Row Level Security (RLS)
ALTER TABLE public.usuario ENABLE ROW LEVEL SECURITY;

-- 7. Políticas RLS
DROP POLICY IF EXISTS "Usuarios pueden ver su propio perfil" ON public.usuario;
CREATE POLICY "Usuarios pueden ver su propio perfil"
    ON public.usuario
    FOR SELECT
    USING (auth.uid() = id);

DROP POLICY IF EXISTS "Administradores pueden ver todos los usuarios" ON public.usuario;
CREATE POLICY "Administradores pueden ver todos los usuarios"
    ON public.usuario
    FOR SELECT
    USING (public.es_administrador());

DROP POLICY IF EXISTS "Administradores pueden insertar usuarios" ON public.usuario;
CREATE POLICY "Administradores pueden insertar usuarios"
    ON public.usuario
    FOR INSERT
    WITH CHECK (public.es_administrador() OR auth.uid() = id);

DROP POLICY IF EXISTS "Administradores pueden actualizar usuarios" ON public.usuario;
CREATE POLICY "Administradores pueden actualizar usuarios"
    ON public.usuario
    FOR UPDATE
    USING (public.es_administrador() OR auth.uid() = id);

DROP POLICY IF EXISTS "Administradores pueden eliminar usuarios" ON public.usuario;
CREATE POLICY "Administradores pueden eliminar usuarios"
    ON public.usuario
    FOR DELETE
    USING (public.es_administrador());

-- 8. Trigger seguro para sincronizar creación desde auth.users a public.usuario
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_auth_user();

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
DECLARE
    v_nombre TEXT;
    v_apellido TEXT;
    v_rol TEXT;
BEGIN
    v_nombre := COALESCE(NEW.raw_user_meta_data->>'nombre', 'Usuario');
    v_apellido := COALESCE(NEW.raw_user_meta_data->>'apellido', '');
    v_rol := COALESCE(NEW.raw_user_meta_data->>'rol', 'ejecutivo');

    -- Si es el email del administrador principal, asegurar rol administrador
    IF LOWER(NEW.email) = 'maic.hernandez.dev@gmail.com' THEN
        v_rol := 'administrador';
    END IF;

    INSERT INTO public.usuario (
        id,
        email,
        nombre,
        apellido,
        rol,
        activo,
        requiere_cambio_clave
    )
    VALUES (
        NEW.id,
        NEW.email,
        v_nombre,
        v_apellido,
        v_rol,
        true,
        COALESCE((NEW.raw_user_meta_data->>'requiere_cambio_clave')::boolean, false)
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        nombre = CASE WHEN public.usuario.nombre = 'Usuario' THEN EXCLUDED.nombre ELSE public.usuario.nombre END,
        apellido = CASE WHEN public.usuario.apellido = '' THEN EXCLUDED.apellido ELSE public.usuario.apellido END,
        rol = CASE WHEN LOWER(EXCLUDED.email) = 'maic.hernandez.dev@gmail.com' THEN 'administrador' ELSE public.usuario.rol END,
        activo = true;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Evitar que errores secundarios bloqueen auth.users
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_auth_user();

-- 9. Sincronizar usuarios ya existentes en auth.users a public.usuario
INSERT INTO public.usuario (id, email, nombre, apellido, rol, activo, requiere_cambio_clave)
SELECT 
    id, 
    email, 
    COALESCE(raw_user_meta_data->>'nombre', 'Usuario'),
    COALESCE(raw_user_meta_data->>'apellido', ''),
    CASE WHEN LOWER(email) = 'maic.hernandez.dev@gmail.com' THEN 'administrador' ELSE 'ejecutivo' END,
    true,
    false
FROM auth.users
ON CONFLICT (id) DO UPDATE SET
    rol = CASE WHEN LOWER(public.usuario.email) = 'maic.hernandez.dev@gmail.com' THEN 'administrador' ELSE public.usuario.rol END,
    activo = true;
