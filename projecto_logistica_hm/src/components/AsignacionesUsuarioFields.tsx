import { ROLES_CON_SUCURSAL_BASE } from '@/lib/asignaciones';
import type { UserRole } from '@/types/auth.types';
import type { Sucursal, Zona } from '@/types/sucursal.types';

/*
 * Campos de sucursal base, sucursales a cargo y zona según el rol. Los usan
 * el modal de usuarios (/admin/usuarios) y la activación de cuentas del
 * dashboard del administrador.
 */

function toggleId(list: number[], id: number): number[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

function MultiCheckSelector({
  title,
  options,
  selected,
  onToggle,
  ayuda,
}: {
  title: string;
  /** `bloqueadaPor`: la opción no se puede elegir y se indica por qué. */
  options: { id: number; label: string; bloqueadaPor?: string }[];
  selected: number[];
  onToggle: (id: number) => void;
  ayuda?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">
        {title}
      </label>
      {ayuda && <p className="text-[11px] text-neutral-400">{ayuda}</p>}
      {options.length === 0 ? (
        <p className="text-xs text-neutral-400 italic">Sin opciones disponibles.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {options.map((o) => {
            const active = selected.includes(o.id);
            const bloqueada = Boolean(o.bloqueadaPor) && !active;
            return (
              <button
                type="button"
                key={o.id}
                onClick={() => onToggle(o.id)}
                disabled={bloqueada}
                title={bloqueada ? `A cargo de ${o.bloqueadaPor}` : undefined}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  active
                    ? 'bg-neutral-900 text-white border-neutral-900 cursor-pointer'
                    : bloqueada
                      ? 'bg-neutral-50 text-neutral-400 border-neutral-200 cursor-not-allowed'
                      : 'bg-white text-neutral-600 border-neutral-300 hover:border-neutral-900 cursor-pointer'
                }`}
              >
                {o.label}
                {bloqueada && <span className="ml-1 text-[10px]">· {o.bloqueadaPor}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const ROTULO_SUCURSAL_BASE: Record<UserRole, string> = {
  ejecutivo: 'Sucursal *',
  jefe_local: 'Sucursal base *',
  logistica: 'Sucursal base *',
  administrador: 'Sucursal (opcional)',
  operaciones: 'Sucursal (opcional)',
};

/**
 * Campos de asignación según el rol (ver `lib/asignaciones.ts`):
 * ejecutivo → una sucursal; logística → sucursal base y una zona; jefe de
 * local → sucursal base y sucursales adicionales a su cargo. Las sucursales
 * que ya tiene otro jefe de local aparecen bloqueadas.
 */
export default function AsignacionesFields({
  rol,
  sucursales,
  zonas,
  ocupadas,
  sucursalId,
  onSucursalId,
  sucursalesIds,
  onSucursalesIds,
  zonasIds,
  onZonasIds,
  error,
}: {
  rol: UserRole;
  sucursales: Sucursal[];
  zonas: Zona[];
  ocupadas: Map<number, string>;
  sucursalId: number | null;
  onSucursalId: (id: number | null) => void;
  sucursalesIds: number[];
  onSucursalesIds: (ids: number[]) => void;
  zonasIds: number[];
  onZonasIds: (ids: number[]) => void;
  error: string | null;
}) {
  const esJefe = rol === 'jefe_local';
  const requiereBase = ROLES_CON_SUCURSAL_BASE.includes(rol);
  const selectCls =
    'w-full px-3 py-2 bg-white border border-neutral-300 rounded-xl text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900';

  return (
    <>
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">
          {ROTULO_SUCURSAL_BASE[rol]}
        </label>
        <select
          required={requiereBase}
          value={sucursalId ?? ''}
          onChange={(e) => {
            const id = e.target.value ? Number(e.target.value) : null;
            onSucursalId(id);
            if (id !== null) onSucursalesIds(sucursalesIds.filter((s) => s !== id));
          }}
          className={selectCls}
        >
          <option value="">Seleccionar sucursal...</option>
          {sucursales.map((s) => {
            const jefe = esJefe ? ocupadas.get(s.id) : undefined;
            return (
              <option key={s.id} value={s.id} disabled={Boolean(jefe) && s.id !== sucursalId}>
                {s.nombre}{s.direccion ? ` - ${s.direccion}` : ''}{jefe ? ` (a cargo de ${jefe})` : ''}
              </option>
            );
          })}
        </select>
      </div>

      {esJefe && (
        <MultiCheckSelector
          title="Sucursales adicionales a su cargo"
          ayuda="Cada sucursal tiene un solo jefe de local. Las que ya tienen jefe aparecen bloqueadas."
          options={sucursales
            .filter((s) => s.id !== sucursalId)
            .map((s) => ({ id: s.id, label: s.nombre ?? `Sucursal #${s.id}`, bloqueadaPor: ocupadas.get(s.id) }))}
          selected={sucursalesIds}
          onToggle={(id) => onSucursalesIds(toggleId(sucursalesIds, id))}
        />
      )}

      {rol === 'logistica' && (
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">
            Zona de logística *
          </label>
          <select
            required
            value={zonasIds[0] ?? ''}
            onChange={(e) => onZonasIds(e.target.value ? [Number(e.target.value)] : [])}
            className={selectCls}
          >
            <option value="">Seleccionar zona...</option>
            {zonas.map((z) => (
              <option key={z.id} value={z.id}>{z.nombre}</option>
            ))}
          </select>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl border border-red-200 bg-red-50 text-xs text-red-800">
          <span>{error}</span>
        </div>
      )}
    </>
  );
}
