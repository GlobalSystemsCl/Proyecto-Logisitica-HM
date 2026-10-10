import Link from 'next/link';
import {
  ArrowRight,
  ArrowUp,
  BarChart3,
  Building2,
  CalendarClock,
  CalendarDays,
  Car,
  CarFront,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  FileText,
  Grid2x2,
  History,
  LayoutGrid,
  ListOrdered,
  PackageCheck,
  Truck,
  User,
  UserRound,
  Users,
  Warehouse,
} from 'lucide-react';
import type { UserRole } from '@/types/auth.types';
import {
  LINKS_SOPORTE,
  cardsPorRol,
  tituloDeCard,
  type DashboardCard,
  type DashboardCardGrupo,
} from '@/config/dashboard-cards';

/**
 * Resuelve el icono por nombre con un `switch` explícito: un `Record` con
 * componentes produciría tipos de componente creados durante el render, lo que
 * el plugin `react-hooks/static-components` rechaza.
 */
function renderIcono(nombre: string, className: string) {
  switch (nombre) {
    case 'ArrowUp':
      return <ArrowUp className={className} />;
    case 'BarChart3':
      return <BarChart3 className={className} />;
    case 'Building2':
      return <Building2 className={className} />;
    case 'CalendarClock':
      return <CalendarClock className={className} />;
    case 'CalendarDays':
      return <CalendarDays className={className} />;
    case 'Car':
      return <Car className={className} />;
    case 'CarFront':
      return <CarFront className={className} />;
    case 'CheckCircle2':
      return <CheckCircle2 className={className} />;
    case 'CircleHelp':
    case 'HelpCircle':
      return <CircleHelp className={className} />;
    case 'ClipboardList':
      return <ClipboardList className={className} />;
    case 'FileText':
      return <FileText className={className} />;
    case 'Grid2x2':
    case 'Grid2X2':
      return <Grid2x2 className={className} />;
    case 'History':
      return <History className={className} />;
    case 'LayoutGrid':
      return <LayoutGrid className={className} />;
    case 'ListOrdered':
      return <ListOrdered className={className} />;
    case 'PackageCheck':
      return <PackageCheck className={className} />;
    case 'Truck':
      return <Truck className={className} />;
    case 'User':
    case 'UserRound':
      return <User className={className} />;
    case 'Users':
      return <Users className={className} />;
    case 'Warehouse':
      return <Warehouse className={className} />;
    default:
      return <LayoutGrid className={className} />;
  }
}

const GRUPO_LABEL: Record<DashboardCardGrupo, string> = {
  gestion: 'Gestión',
  operacion: 'Operación',
  soporte: 'Soporte',
};

function ModuleCard({ card, rol }: { card: DashboardCard; rol: UserRole }) {
  const titulo = tituloDeCard(card, rol);

  return (
    <Link
      href={card.href}
      className="group relative flex flex-col justify-between h-full rounded-xl border border-neutral-200/90 bg-white p-5 transition-all duration-200 hover:border-blue-400/60 hover:shadow-[0_4px_16px_rgba(26,43,75,0.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
    >
      <div className="flex flex-col flex-1">
        {/* Cabecera: Icono con contenedor consistente e indicador de categoría */}
        <div className="flex items-center justify-between gap-3 mb-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-neutral-200/90 bg-neutral-50 text-[#1a2b4b] transition-all duration-200 group-hover:border-[#1a2b4b] group-hover:bg-[#1a2b4b] group-hover:text-white">
            {renderIcono(card.icono, 'w-5 h-5 transition-transform duration-200 group-hover:scale-105')}
          </div>

          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium tracking-wide bg-neutral-50 text-neutral-500 border border-neutral-200/70">
            {card.soloAdmin ? 'Admin' : GRUPO_LABEL[card.grupo]}
          </span>
        </div>

        {/* Jerarquía: Etiqueta secundaria 'Módulo', Título principal y Descripción */}
        <div className="flex-1 flex flex-col">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-1">
            Módulo
          </span>
          <h3 className="text-base sm:text-lg font-bold text-[#1a2b4b] tracking-tight leading-snug group-hover:text-blue-600 transition-colors duration-200">
            {titulo}
          </h3>
          <p
            title={card.descripcion}
            className="mt-1.5 text-xs sm:text-sm leading-relaxed text-neutral-500 line-clamp-2 min-h-[2.6rem]"
          >
            {card.descripcion}
          </p>
        </div>
      </div>

      {/* Zona inferior: Separador y CTA elegante siempre alineado */}
      <div className="mt-4 pt-3 border-t border-neutral-100 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-neutral-500 transition-colors duration-200 group-hover:text-blue-600">
          Abrir módulo
        </span>
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-100/80 text-neutral-400 transition-all duration-200 group-hover:bg-blue-50 group-hover:text-blue-600 group-hover:translate-x-0.5">
          <ArrowRight className="h-3.5 w-3.5" />
        </div>
      </div>
    </Link>
  );
}

/** Componente compacto tipo Quick Action para accesos secundarios (Perfil, FAQ). */
function QuickActionCard({
  href,
  titulo,
  descripcion,
  icono,
}: {
  href: string;
  titulo: string;
  descripcion: string;
  icono: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center justify-between gap-4 rounded-xl border border-neutral-200/80 bg-white p-3.5 sm:p-4 transition-all duration-200 hover:border-blue-400/50 hover:shadow-[0_2px_10px_rgba(26,43,75,0.05)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
    >
      <div className="flex items-center gap-3.5 min-w-0">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-neutral-200/80 bg-neutral-50 text-[#1a2b4b] transition-all duration-200 group-hover:border-[#1a2b4b] group-hover:bg-[#1a2b4b] group-hover:text-white">
          {renderIcono(icono, 'w-5 h-5')}
        </div>
        <div className="min-w-0">
          <h4 className="text-sm sm:text-base font-bold text-[#1a2b4b] tracking-tight group-hover:text-blue-600 transition-colors duration-200 truncate">
            {titulo}
          </h4>
          <p className="text-xs sm:text-[13px] text-neutral-500 truncate mt-0.5">
            {descripcion}
          </p>
        </div>
      </div>
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-100/70 text-neutral-400 transition-all duration-200 group-hover:bg-blue-50 group-hover:text-blue-600 group-hover:translate-x-0.5">
        <ChevronRight className="w-3.5 h-3.5" />
      </div>
    </Link>
  );
}

/** Grid de cards del dashboard con separación visual de módulos principales y acciones secundarias. */
export default function DashboardCardGrid({ rol }: { rol: UserRole }) {
  const cards = cardsPorRol(rol);

  return (
    <div className="space-y-6">
      {/* Grilla de módulos principales: 3 columnas en desktop, 2 en tablet, 1 en móvil */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
        {cards.map((card) => (
          <ModuleCard key={card.clave} card={card} rol={rol} />
        ))}
      </div>

      {/* Acciones secundarias diferenciadas (Mi perfil, Preguntas frecuentes) */}
      {LINKS_SOPORTE.length > 0 && (
        <div className="pt-2">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
              Acciones secundarias y ayuda
            </span>
            <div className="h-px flex-1 bg-neutral-200/70" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {LINKS_SOPORTE.map((link) => (
              <QuickActionCard
                key={link.href}
                href={link.href}
                titulo={link.titulo}
                descripcion={
                  link.href === '/perfil'
                    ? 'Actualiza tus datos de contacto'
                    : 'Guía rápida del flujo de solicitudes'
                }
                icono={link.icono}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
