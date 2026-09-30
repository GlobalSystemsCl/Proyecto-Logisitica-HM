import { AuthService } from '@/services/auth.service';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { HelpCircle, ChevronRight, Circle } from 'lucide-react';
import PageHeader from '@/components/PageHeader';

export const dynamic = 'force-dynamic';

const CATEGORIAS = [
  {
    titulo: 'Solicitudes',
    preguntas: [
      {
        p: '¿Qué es una solicitud de traslado?',
        r: 'Es el pedido formal que realiza un ejecutivo para mover uno o más vehículos desde una sucursal (origen) hacia otra o hacia un evento (destino). Una vez creada, pasa por un flujo controlado: aprobación, priorización, asignación, calendarización, despacho, tránsito y entrega.',
      },
      {
        p: '¿Quién puede crear una solicitud?',
        r: 'El Ejecutivo crea solicitudes para su sucursal y el Jefe de Local puede crearlas para cualquiera de sus sucursales asignadas. Logística no crea solicitudes: recibe las que ya pasaron la aprobación.',
      },
      {
        p: '¿Cómo funciona la aprobación?',
        r: 'El Jefe de Local (o el Administrador) aprueba o rechaza la solicitud y define la fecha/hora límite de entrega. Al aprobarse se registra automáticamente la fecha de confirmación.',
      },
      {
        p: '¿Puedo cancelar una solicitud?',
        r: 'Sí. El Ejecutivo puede cancelar su propia solicitud antes del despacho; el Jefe de Local puede cancelar solicitudes de sus sucursales; Logística y Administrador pueden cancelar en cualquier momento previo a la recepción. Al cancelar, los slots reservados se liberan.',
      },
    ],
  },
  {
    titulo: 'Estados del flujo',
    preguntas: [
      {
        p: '¿Qué significa el estado "Despachada"?',
        r: 'Logística ya preparó los vehículos y los marcó como despachados desde la sucursal origen. Aún no se confirma el inicio de ruta. Es el paso intermedio entre Calendarizada y En tránsito.',
      },
      {
        p: '¿Por qué "Entregada" se muestra como "Recepcionada"?',
        r: 'Es la nueva nomenclatura: cuando el Jefe de Local del destino recibe los vehículos, el sistema registra el estado "entregada" en la base de datos pero en pantalla se muestra como "Recepcionada" para ser más claro.',
      },
      {
        p: '¿Qué diferencia hay entre "Recepcionada" y "Entregado a cliente"?',
        r: 'Recepcionada significa que los vehículos llegaron a la sucursal destino. Entregado a cliente es el cierre final del proceso, cuando el ejecutivo o el jefe de local confirman que el vehículo fue entregado al cliente final.',
      },
      {
        p: '¿Puedo revolver el despacho de una solicitud?',
        r: 'Logística y el Administrador pueden cancelar el despacho mientras la solicitud esté "Despachada" o "En tránsito", lo que la devuelve a "Calendarizada".',
      },
    ],
  },
  {
    titulo: 'Vehículos y slots',
    preguntas: [
      {
        p: '¿Qué es un slot en la sucursal destino?',
        r: 'Es la capacidad de almacenamiento disponible en una sucursal (cuántos vehículos puede recibir). Al crear una solicitud o traslado se reserva un slot; al recepcionar se libera la reserva.',
      },
      {
        p: '¿Qué vehículos pueden trasladarse?',
        r: 'Solo vehículos vendidos pueden moverse vía traslado interno entre sucursales. Los vehículos en reserva para una solicitud normal se liberan al recepcionar la solicitud en destino.',
      },
      {
        p: '¿Dónde veo la disponibilidad de slots?',
        r: 'El Jefe de Local y el Administrador ven un badge de slots libres en el encabezado de cada página, y el detalle por sucursal en la card "Slots de Estacionamiento" del dashboard (ruta /logistica/slots).',
      },
    ],
  },
  {
    titulo: 'Insistencias y trazabilidad',
    preguntas: [
      {
        p: '¿Qué es "Insistir" en una solicitud?',
        r: 'Es la herramienta del Ejecutivo para marcar que su solicitud lleva demasiado tiempo sin avanzar. Solo aplica a solicitudes propias y está limitada a 1 vez cada 24 horas por solicitud.',
      },
      {
        p: '¿Dónde puedo ver el historial con fechas?',
        r: 'En el detalle de cada solicitud, la sección de trazabilidad muestra los timestamps de confirmación, despacho, inicio de tránsito, recepción y entrega al cliente, además de la auditoría completa de acciones.',
      },
    ],
  },
];

export default async function FaqPage() {
  const profile = await AuthService.getCurrentUserProfile();

  if (!profile) {
    redirect('/login');
  }

  if (!profile.activo) {
    redirect('/dashboard?error=unauthorized');
  }

  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900 flex flex-col">
      <PageHeader
        nombre={profile.nombre}
        apellido={profile.apellido}
        rol={profile.rol}
        sucursalNombre={profile.sucursal_nombre}
        backHref="/dashboard"
      />

      <main className="flex-1 w-full px-4 sm:px-8 lg:px-12 py-8">
        <div className="max-w-3xl mx-auto space-y-8">
          <header className="text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-neutral-900 text-white mb-4">
              <HelpCircle className="w-7 h-7" />
            </div>
            <h1 className="text-3xl font-bold text-neutral-900">Preguntas Frecuentes</h1>
            <p className="text-neutral-500 text-sm mt-2">
              Respuestas sobre el flujo de solicitudes, estados, vehículos y slots del sistema.
            </p>
          </header>

          {CATEGORIAS.map((cat) => (
            <section key={cat.titulo} className="bg-white border border-neutral-200 rounded-2xl overflow-hidden shadow-sm">
              <h2 className="px-5 py-3.5 border-b border-neutral-200 bg-neutral-50 text-xs font-semibold text-neutral-500 uppercase tracking-wider flex items-center gap-2">
                <Circle className="w-3 h-3 text-neutral-400" />
                {cat.titulo}
              </h2>
              <div className="divide-y divide-neutral-100">
                {cat.preguntas.map((item) => (
                  <details key={item.p} className="group px-5 py-4">
                    <summary className="flex items-center justify-between gap-3 cursor-pointer list-none text-sm font-semibold text-neutral-900 hover:text-neutral-600 transition-colors">
                      {item.p}
                      <ChevronRight className="w-4 h-4 text-neutral-400 group-open:rotate-90 transition-transform shrink-0" />
                    </summary>
                    <p className="mt-2 text-sm text-neutral-600 leading-relaxed">{item.r}</p>
                  </details>
                ))}
              </div>
            </section>
          ))}

          <footer className="text-center pb-4">
            <p className="text-sm text-neutral-500">
              ¿Necesitas más ayuda? Consulta a tu Jefe de Local o al equipo de Logística.
            </p>
            <Link href="/solicitudes" className="inline-block mt-2 text-sm font-semibold text-neutral-900 underline underline-offset-4 hover:text-neutral-600">
              Ir al módulo de solicitudes
            </Link>
          </footer>
        </div>
      </main>
    </div>
  );
}