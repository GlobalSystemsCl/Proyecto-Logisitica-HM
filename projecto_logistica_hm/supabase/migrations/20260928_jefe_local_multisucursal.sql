-- Migracion: Jefe de Local multi-sucursal (relacion 1:N en la BD)
--
-- Descripcion:
--   La relacion "jefe de local <-> sucursales" pasa a ser 1:N real:
--     - Un Jefe de Local (o Administrador) puede ser encargado de VARIAS sucursales.
--     - Cada sucursal tiene UN SOLO encargado (sucursal.usuario_id).
--
--   Cambios:
--     1. Backfill: las sucursales asignadas via `usuario_sucursal` (N:M) migran
--        a `sucursal.usuario_id`. Las que ya tenian encargado se respetan.
--     2. Regla de rol retroactiva: solo `jefe_local` / `administrador` pueden
--        quedar como encargado (usuario_id = NULL en caso contrario).
--     3. FK segura: `sucursal.usuario_id` pasa de ON DELETE CASCADE (que al
--        borrar un jefe BORRABA sus sucursales) a ON DELETE SET NULL.
--     4. Se elimina la tabla N:M `usuario_sucursal` (fuente dual de verdad).
--     5. RPC `usuario_tiene_sucursal`: valida principal + encargado.
--     6. Trigger que impone en BD que el encargado sea jefe/administrador.
--
--   Idempotente y retrocompatible con datos existentes.

-- 1. Backfill usuario_sucursal -> sucursal.usuario_id (respeta encargados actuales)
UPDATE public.sucursal s
SET usuario_id = us.usuario_id
FROM public.usuario_sucursal us
WHERE us.sucursal_id = s.id
  AND s.usuario_id IS NULL;

-- 2. Regla de rol: solo jefes/administradores pueden ser encargados
UPDATE public.sucursal s
SET usuario_id = NULL
FROM public.usuario u
WHERE u.id = s.usuario_id
  AND u.rol NOT IN ('jefe_local', 'administrador');

-- 3. FK segura: SET NULL en lugar de CASCADE
DO $$
DECLARE
    v_constraint TEXT;
BEGIN
    SELECT conname INTO v_constraint
    FROM pg_constraint
    WHERE conrelid = 'public.sucursal'::regclass
      AND contype = 'f'
      AND confrelid = 'public.usuario'::regclass
    ORDER BY conname
    LIMIT 1;

    IF v_constraint IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.sucursal DROP CONSTRAINT %I', v_constraint);
    END IF;
END $$;

ALTER TABLE public.sucursal
    ADD CONSTRAINT sucursal_usuario_id_fkey
    FOREIGN KEY (usuario_id) REFERENCES public.usuario(id)
    ON UPDATE CASCADE ON DELETE SET NULL;

-- 4. Se elimina la tabla N:M usuario_sucursal (indice y politicas RLS incluidos)
DROP TABLE IF EXISTS public.usuario_sucursal;

-- 5. RPC usuario_tiene_sucursal: principal + encargado (sucursal.usuario_id)
CREATE OR REPLACE FUNCTION public.usuario_tiene_sucursal(
    p_usuario_id uuid,
    p_sucursal_id bigint
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.usuario u
        WHERE u.id = p_usuario_id AND u.sucursal_id = p_sucursal_id
        UNION ALL
        SELECT 1 FROM public.sucursal s
        WHERE s.id = p_sucursal_id AND s.usuario_id = p_usuario_id
    );
$$;

-- 6. Trigger: el encargado de una sucursal debe ser jefe_local o administrador
CREATE OR REPLACE FUNCTION public.validar_encargado_sucursal()
RETURNS TRIGGER AS $$
DECLARE
    v_rol TEXT;
BEGIN
    IF NEW.usuario_id IS NOT NULL THEN
        SELECT rol INTO v_rol FROM public.usuario WHERE id = NEW.usuario_id;

        IF v_rol IS NULL OR (v_rol <> 'jefe_local' AND v_rol <> 'administrador') THEN
            RAISE EXCEPTION
                'El encargado de la sucursal debe tener rol Jefe de Local o Administrador.'
                USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validar_encargado_sucursal ON public.sucursal;
CREATE TRIGGER trg_validar_encargado_sucursal
    BEFORE INSERT OR UPDATE OF usuario_id ON public.sucursal
    FOR EACH ROW
    EXECUTE FUNCTION public.validar_encargado_sucursal();