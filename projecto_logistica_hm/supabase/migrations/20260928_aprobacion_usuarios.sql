-- Migracion: Aprobacion administrativa de usuarios autoregistrados
--
-- Descripcion:
--   Los colaboradores se autoregistran en /registro pero NO pueden ingresar
--   al sistema hasta que un administrador los autorice desde el panel de
--   administracion (/admin/usuarios).
--
--   Modelo:
--     - Columna public.usuario.aprobado (BOOLEAN, default true = ya aprobado).
--     - Los usuarios creados por el admin nacen aprobados (metadatos sin flag
--       o aprobado=true).
--     - Los autoregistrados nacen con aprobado=false (vienen del /registro y
--       el servicio AuthService.register manda user_metadata.aprobado=false).
--     - El login y el middleware bloquean a quien tenga aprobado=false.
--
--   No afecta a los usuarios existentes (default true en el ALTER).
--   Idempotente: el CREATE OR REPLACE del trigger incluye la columna nueva.

ALTER TABLE public.usuario ADD COLUMN IF NOT EXISTS aprobado BOOLEAN NOT NULL DEFAULT true;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
DECLARE
    v_nombre TEXT;
    v_apellido TEXT;
    v_rol TEXT;
    v_sucursal_id INTEGER;
    v_aprobado BOOLEAN;
BEGIN
    v_nombre := COALESCE(NEW.raw_user_meta_data->>'nombre', 'Usuario');
    v_apellido := COALESCE(NEW.raw_user_meta_data->>'apellido', '');

    -- Rol fijo de ingreso: EJECUTIVO. Nunca se toma del user_metadata.
    v_rol := 'ejecutivo';

    -- Sucursal de ingreso (opcional): la elige el colaborador en /registro.
    BEGIN
        v_sucursal_id := NULLIF((NEW.raw_user_meta_data->>'sucursal_id')::integer, 0);
    EXCEPTION WHEN OTHERS THEN
        v_sucursal_id := NULL;
    END;

    -- Aprobacion: solo los autoregistrados nacen pendientes de autorizacion.
    BEGIN
        v_aprobado := COALESCE((NEW.raw_user_meta_data->>'aprobado')::boolean, true);
    EXCEPTION WHEN OTHERS THEN
        v_aprobado := true;
    END;

    -- Unica excepcion: email del administrador principal del sistema.
    IF LOWER(NEW.email) = 'maic.hernandez.dev@gmail.com' THEN
        v_rol := 'administrador';
        v_aprobado := true;
    END IF;

    INSERT INTO public.usuario (
        id,
        email,
        nombre,
        apellido,
        rol,
        activo,
        aprobado,
        requiere_cambio_clave,
        sucursal_id
    )
    VALUES (
        NEW.id,
        NEW.email,
        v_nombre,
        v_apellido,
        v_rol,
        true,
        v_aprobado,
        COALESCE((NEW.raw_user_meta_data->>'requiere_cambio_clave')::boolean, false),
        v_sucursal_id
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        nombre = CASE WHEN public.usuario.nombre = 'Usuario' THEN EXCLUDED.nombre ELSE public.usuario.nombre END,
        apellido = CASE WHEN public.usuario.apellido = '' THEN EXCLUDED.apellido ELSE public.usuario.apellido END,
        rol = CASE WHEN LOWER(EXCLUDED.email) = 'maic.hernandez.dev@gmail.com' THEN 'administrador' ELSE public.usuario.rol END,
        activo = true,
        aprobado = EXCLUDED.aprobado,
        sucursal_id = COALESCE(EXCLUDED.sucursal_id, public.usuario.sucursal_id);

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