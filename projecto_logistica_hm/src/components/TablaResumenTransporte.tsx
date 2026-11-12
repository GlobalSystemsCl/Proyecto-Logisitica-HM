import { formatoHoras } from '@/lib/reporteLogistica';
import { textoATiempo, type ResumenTransporte } from '@/lib/reporteTransportes';

interface Props {
  filas: ResumenTransporte[];
  /** Encabezado de la primera columna: Empresa, Camión o Tramo. */
  titulo: string;
}

/**
 * R16: resumen de transporte (por empresa, camión o tramo) para la pantalla de
 * Movimientos. Tabla en escritorio y tarjetas en el celular.
 */
export default function TablaResumenTransporte({ filas, titulo }: Props) {
  if (filas.length === 0) {
    return <p className="p-10 text-center text-sm text-neutral-500">No hay movimientos con esos filtros en el período.</p>;
  }
  return (
    <>
      <ul className="md:hidden divide-y divide-neutral-100">
        {filas.map((r) => (
          <li key={r.clave} className="px-5 py-3 space-y-1">
            <p className="text-sm font-semibold text-neutral-900">{r.nombre}</p>
            {r.detalle && <p className="text-xs text-neutral-500">{r.detalle}</p>}
            <p className="text-xs text-neutral-700">
              {r.viajes} viaje(s) · {r.vehiculos} vehículo(s) · llegada promedio {formatoHoras(r.horasPromedio)} · a tiempo {textoATiempo(r)}
              {r.atrasadosEnCamino > 0 && <span className="text-red-700 font-semibold"> · {r.atrasadosEnCamino} atrasado(s) en camino</span>}
            </p>
          </li>
        ))}
      </ul>
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-[11px] uppercase tracking-wider text-neutral-500">
            <tr>
              <th className="text-left px-4 py-2 font-semibold">{titulo}</th>
              <th className="text-right px-4 py-2 font-semibold">Viajes</th>
              <th className="text-right px-4 py-2 font-semibold">Vehículos</th>
              <th className="text-right px-4 py-2 font-semibold">Recibidos</th>
              <th className="text-right px-4 py-2 font-semibold">Llegada promedio</th>
              <th className="text-right px-4 py-2 font-semibold">Llegada mediana</th>
              <th className="text-right px-4 py-2 font-semibold">A tiempo</th>
              <th className="text-right px-4 py-2 font-semibold">Atrasados en camino</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {filas.map((r) => (
              <tr key={r.clave}>
                <td className="px-4 py-2">
                  <span className="font-medium text-neutral-900">{r.nombre}</span>
                  {r.detalle && <span className="block text-xs text-neutral-500">{r.detalle}</span>}
                </td>
                <td className="px-4 py-2 text-right">{r.viajes}</td>
                <td className="px-4 py-2 text-right">{r.vehiculos}</td>
                <td className="px-4 py-2 text-right">{r.recibidos}</td>
                <td className="px-4 py-2 text-right">{formatoHoras(r.horasPromedio)}</td>
                <td className="px-4 py-2 text-right">{formatoHoras(r.horasMediana)}</td>
                <td className="px-4 py-2 text-right" title={r.conPlazo > 0 ? `${r.aTiempo} de ${r.conPlazo} con fecha límite` : 'Sin fecha límite'}>
                  {textoATiempo(r)}
                </td>
                <td className={`px-4 py-2 text-right ${r.atrasadosEnCamino > 0 ? 'text-red-700 font-semibold' : ''}`}>{r.atrasadosEnCamino}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
