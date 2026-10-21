import { SucursalesService } from '@/services/sucursales.service';
import RegistroForm from './RegistroForm';
import { getDominiosPermitidos } from '@/lib/dominios';

export default async function RegistroPage() {
  const sucursales = await SucursalesService.getSucursales();

  return (
    <RegistroForm
      sucursales={sucursales.map((s) => ({ id: s.id, nombre: s.nombre ?? 'Sucursal sin nombre' }))}
      dominios={getDominiosPermitidos()}
    />
  );
}