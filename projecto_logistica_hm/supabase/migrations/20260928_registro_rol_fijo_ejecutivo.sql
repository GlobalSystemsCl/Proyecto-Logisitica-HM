-- Migracion: Registro autogestionado SIEMPRE crea el usuario como EJECUTIVO
--
-- Descripcion:
--   Cierra el hueco por el cual un cliente podria auto-asignarse el rol que
--   quisiera via user_metadata en el signUp (antes el trigger leia
--   NEW.raw_user_meta_data->>'rol' y lo respetaba).
--
--   Nueva regla:
--     1. Todo usuario nuevo ingresa con rol 'ejecutivo' (fijo).
--     2. El rol empresarial SOLO lo puede cambiar posteriormente un
--        administrador desde el panel de administracion (/admin/usuarios).
--     3. Sucursal de ingreso (opcional): se toma de user_metadata
--        (sucursal_id), elegida por el colaborador en /registro.
--     4. Unica excepcion: el email del administrador principal
--        (maic.hernandez.dev@gmail.com), que se fuerza como 'administrador'.
--
--   No afecta a los usuarios creados por el admin: UsersService.createUser
--   sobrescribe el perfil con el rol elegido por el admin justo despues de
--   crear el auth user. No modifica filas existentes (conserva roles ya
--   asignados en produccion).

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
DECLARE
    v_nombre TEXT;
    v_apellido TEXT;
    v_rol TEXT;
    v_sucursal_id INTEGER;
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

    -- Unica excepcion: email del administrador principal del sistema.
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
        COALESCE((NEW.raw_user_meta_data->>'requiere_cambio_clave')::boolean, false),
        v_sucursal_id
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        nombre = CASE WHEN public.usuario.nombre = 'Usuario' THEN EXCLUDED.nombre ELSE public.usuario.nombre END,
        apellido = CASE WHEN public.usuario.apellido = '' THEN EXCLUDED.apellido ELSE public.usuario.apellido END,
        rol = CASE WHEN LOWER(EXCLUDED.email) = 'maic.hernandez.dev@gmail.com' THEN 'administrador' ELSE public.usuario.rol END,
        activo = true,
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