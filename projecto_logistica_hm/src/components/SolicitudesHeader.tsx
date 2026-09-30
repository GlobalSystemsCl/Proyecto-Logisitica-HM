import TopNavbar, { SlotResumen } from './TopNavbar';
import SolicitudesTabBar from './SolicitudesTabBar';
import { UserRole } from '@/types/auth.types';

interface SolicitudesHeaderProps {
  nombre: string;
  apellido: string;
  rol: UserRole;
  sucursalNombre?: string | null;
  slots?: SlotResumen[] | null;
}

export default function SolicitudesHeader({
  nombre,
  apellido,
  rol,
  sucursalNombre,
  slots,
}: SolicitudesHeaderProps) {
  return (
    <div className="sticky top-0 z-30">
      <TopNavbar
        nombre={nombre}
        apellido={apellido}
        rol={rol}
        sucursalNombre={sucursalNombre}
        backHref="/dashboard"
        slots={slots}
      />
      <SolicitudesTabBar rol={rol} />
    </div>
  );
}