'use client';

import { useState, useEffect, useMemo, useTransition } from 'react';
import { VehiculoConDisponibilidad } from '@/types/vehiculo.types';
import { DESCRIPCION_DISPONIBILIDAD, ETIQUETA_DISPONIBILIDAD } from '@/lib/vehiculo';
import {
  FILTRO_EN_VIAJE,
  FILTRO_TODAS,
  FILTROS_INICIALES,
  contarPorDisponibilidad,
  filtrarVehiculos,
  hayFiltrosActivos,
  FILTRO_EN_TRANSITO,
} from '@/lib/filtrosVehiculos';
import {
  createVehiculoAction,
  updateVehiculoAction,
  deleteVehiculoAction,
  importVehiculosAction,
  cambiarUbicacionMasivaAction,
} from '@/app/actions/vehiculo.actions';
import { esSeleccionableParaMover } from '@/lib/ubicacionMasiva';
import {
  Car,
  Plus,
  Search,
  X,
  AlertCircle,
  CheckCircle2,
  Edit3,
  Trash2,
  Lock,
  Unlock,
  Truck,
  Upload,
  ChevronLeft,
  ChevronRight,
  MapPin,
} from 'lucide-react';

interface Props {
  vehiculos: VehiculoConDisponibilidad[];
  marcas: string[];
  sucursales: { id: number; nombre: string | null }[];
  userRole: string;
}

export default function VehiculosTableClient({ vehiculos, marcas, sucursales, userRole }: Props) {
  const [isHydrated, setIsHydrated] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMarca, setSelectedMarca] = useState<string>(FILTRO_TODAS);
  const [selectedDisponibilidad, setSelectedDisponibilidad] = useState<string>(FILTRO_TODAS);
  const [selectedUbicacion, setSelectedUbicacion] = useState<string>(FILTRO_TODAS);
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [vehiculoToDelete, setVehiculoToDelete] = useState<VehiculoConDisponibilidad | null>(null);
  const [vehiculoToEdit, setVehiculoToEdit] = useState<VehiculoConDisponibilidad | null>(null);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [isSubmitting, startTransition] = useTransition();

  const PAGE_SIZE = 20;
  // Fase G: cambio de ubicación masivo.
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [destinoMasivo, setDestinoMasivo] = useState('');
  const [moviendo, setMoviendo] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const handleMarcaChange = (value: string) => {
    setSelectedMarca(value);
    setCurrentPage(1);
  };

  const handleDisponibilidadChange = (value: string) => {
    setSelectedDisponibilidad(value);
    setCurrentPage(1);
  };

  const handleUbicacionChange = (value: string) => {
    setSelectedUbicacion(value);
    setCurrentPage(1);
  };

  const handleFechaDesdeChange = (value: string) => {
    setFechaDesde(value);
    setCurrentPage(1);
  };

  const handleFechaHastaChange = (value: string) => {
    setFechaHasta(value);
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setSearchTerm(FILTROS_INICIALES.busqueda);
    setSelectedMarca(FILTROS_INICIALES.marca);
    setSelectedDisponibilidad(FILTROS_INICIALES.disponibilidad);
    setSelectedUbicacion(FILTROS_INICIALES.ubicacion);
    setFechaDesde(FILTROS_INICIALES.fechaDesde);
    setFechaHasta(FILTROS_INICIALES.fechaHasta);
    setCurrentPage(1);
  };

  // Form states
  const [chasis, setChasis] = useState('');
  const [patente, setPatente] = useState('');
  const [marca, setMarca] = useState('');
  const [modelo, setModelo] = useState('');
  const [anio, setAnio] = useState<number>(new Date().getFullYear());
  const [color, setColor] = useState('');
  const [precio, setPrecio] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [tipoVehiculo, setTipoVehiculo] = useState('');
  const [marcaCodigo, setMarcaCodigo] = useState('');
  const [idv, setIdv] = useState('');

  // Field-level validation errors
  const [errors, setErrors] = useState<{
    chasis: string;
    patente: string;
    marca: string;
    modelo: string;
    anio: string;
    precio: string;
    ubicacion: string;
  }>({ chasis: '', patente: '', marca: '', modelo: '', anio: '', precio: '', ubicacion: '' });

  const currentYear = new Date().getFullYear();

  const validateChasis = (value: string): string => {
    if (!value) return 'El chasis es obligatorio.';
    if (!/^[A-Z0-9]+$/i.test(value)) return 'Solo se permiten letras y números.';
    if (value.length < 17) return `Faltan ${17 - value.length} caracteres.`;
    if (value.length > 17) return 'Máximo 17 caracteres.';
    return '';
  };

  const validatePatente = (value: string): string => {
    if (!value) return '';
    if (value.length < 6) return 'Formato: 4 letras, guión, 2-4 números.';
    if (!/^[A-Z]{4}-[0-9]{2,4}$/i.test(value)) return 'Formato requerido: XXXX-XX o XXXX-XXXX.';
    return '';
  };

  const validateMarca = (value: string): string => {
    if (!value.trim()) return 'La marca es obligatoria.';
    if (value.trim().length < 2) return 'Mínimo 2 caracteres.';
    return '';
  };

  const validateModelo = (value: string): string => {
    if (!value.trim()) return 'El modelo es obligatorio.';
    if (value.trim().length < 2) return 'Mínimo 2 caracteres.';
    return '';
  };

  const validateAnio = (value: number): string => {
    if (!value) return '';
    if (value < 1900) return 'Mínimo 1900.';
    if (value > currentYear + 1) return `Máximo ${currentYear + 1}.`;
    return '';
  };

  const validatePrecio = (value: string): string => {
    if (!value) return '';
    const num = Number(value);
    if (Number.isNaN(num)) return 'Ingresa un valor numérico válido.';
    if (num < 0) return 'El precio no puede ser negativo.';
    return '';
  };

  const validateUbicacion = (value: string): string => {
    if (value === '') return 'Selecciona la sucursal de ubicación o "En viaje / Container".';
    return '';
  };

  const hasErrors = Object.values(errors).some((e) => e !== '');

  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  const formatPatente = (raw: string, prev: string): string => {
    const isDeleting = raw.length < prev.length;
    const cleaned = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

    if (cleaned.length <= 4) return cleaned;

    const letters = cleaned.slice(0, 4);
    const numbers = cleaned.slice(4, 8);

    if (isDeleting && numbers.length === 0) {
      return letters;
    }

    return letters + '-' + numbers;
  };

  const [showResultModal, setShowResultModal] = useState(false);
  const [resultModal, setResultModal] = useState<{
    type: 'success' | 'error';
    message: string;
    extra?: { importados?: number; duplicados?: number; errores?: number; marcasProcesadas?: number };
  } | null>(null);

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importCsv, setImportCsv] = useState('');
  const [archivoImport, setArchivoImport] = useState('');
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [isImporting, startImportTransition] = useTransition();

  const closeResultModal = () => {
    setShowResultModal(false);
    setResultModal(null);
  };

  useEffect(() => {
    // Hydration guard: set flag on mount only, avoids SSR/client mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsHydrated(true);
  }, []);

  // Filter vehiculos
  const filteredVehiculos = useMemo(
    () =>
      isHydrated
        ? filtrarVehiculos(vehiculos, {
            busqueda: searchTerm,
            marca: selectedMarca,
            disponibilidad: selectedDisponibilidad,
            ubicacion: selectedUbicacion,
            fechaDesde,
            fechaHasta,
          })
        : vehiculos,
    [vehiculos, isHydrated, searchTerm, selectedMarca, selectedDisponibilidad, selectedUbicacion, fechaDesde, fechaHasta],
  );

  const filtrosActivos = hayFiltrosActivos({
    busqueda: searchTerm,
    marca: selectedMarca,
    disponibilidad: selectedDisponibilidad,
    ubicacion: selectedUbicacion,
    fechaDesde,
    fechaHasta,
  });

  const { total: totalVehiculos, reservados, vendidos, disponibles } = useMemo(
    () => contarPorDisponibilidad(filteredVehiculos),
    [filteredVehiculos],
  );

  const totalPages = Math.max(1, Math.ceil(filteredVehiculos.length / PAGE_SIZE));
  const currentPageClamped = Math.min(currentPage, totalPages);
  const pageStart = (currentPageClamped - 1) * PAGE_SIZE;
  const pageVehiculos = filteredVehiculos.slice(pageStart, pageStart + PAGE_SIZE);

  const seleccionablesFiltrados = filteredVehiculos.filter(esSeleccionableParaMover);
  const seleccionablesPagina = pageVehiculos.filter(esSeleccionableParaMover);
  const paginaSeleccionada =
    seleccionablesPagina.length > 0 && seleccionablesPagina.every((v) => seleccion.has(v.id));

  function alternarSeleccion(id: string) {
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function alternarPagina() {
    setSeleccion((prev) => {
      const next = new Set(prev);
      seleccionablesPagina.forEach((v) => (paginaSeleccionada ? next.delete(v.id) : next.add(v.id)));
      return next;
    });
  }

  async function moverSeleccionados() {
    const sucursalId = Number(destinoMasivo);
    const nombre = sucursales.find((s) => s.id === sucursalId)?.nombre ?? 'la sucursal elegida';
    if (!sucursalId || seleccion.size === 0) return;
    if (!window.confirm(`¿Mover ${seleccion.size} vehículo(s) a ${nombre}?`)) return;
    setMoviendo(true);
    try {
      const res = await cambiarUbicacionMasivaAction([...seleccion], sucursalId);
      if (!res.success) {
        setFeedback({ type: 'error', message: res.error ?? 'No se pudo cambiar la ubicación.' });
        return;
      }
      const detalle = res.omitidos
        .slice(0, 5)
        .map((o) => `${o.chasis || o.id}: ${o.motivo}`)
        .join(' · ');
      const resto = res.omitidos.length > 5 ? ` · y ${res.omitidos.length - 5} más` : '';
      setFeedback({
        type: res.omitidos.length > 0 && res.movidos.length === 0 ? 'error' : 'success',
        message:
          `${res.movidos.length} vehículo(s) movidos a ${nombre}.` +
          (res.omitidos.length > 0 ? ` No se movieron ${res.omitidos.length}: ${detalle}${resto}` : ''),
      });
      setSeleccion(new Set());
      setDestinoMasivo('');
    } finally {
      setMoviendo(false);
    }
  }

  const resetForm = () => {
    setChasis('');
    setPatente('');
    setMarca('');
    setModelo('');
    setAnio(new Date().getFullYear());
    setColor('');
    setPrecio('');
    setUbicacion('');
    setTipoVehiculo('');
    setMarcaCodigo('');
    setIdv('');
    setErrors({ chasis: '', patente: '', marca: '', modelo: '', anio: '', precio: '', ubicacion: '' });
    setAttemptedSubmit(false);
  };

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFeedback(null);
    setAttemptedSubmit(true);

    const newErrors = {
      chasis: validateChasis(chasis),
      patente: validatePatente(patente),
      marca: validateMarca(marca),
      modelo: validateModelo(modelo),
      anio: validateAnio(anio),
      precio: validatePrecio(precio),
      ubicacion: validateUbicacion(ubicacion),
    };
    setErrors(newErrors);
    if (Object.values(newErrors).some((e) => e !== '')) return;

    startTransition(async () => {
      const res = await createVehiculoAction({
        chasis,
        patente,
        tipo_vehiculo: tipoVehiculo || null,
        marca_codigo: marcaCodigo || null,
        marca,
        modelo,
        idv: idv || null,
        anio: anio || null,
        color: color || undefined,
        precio: precio ? Number(precio) : null,
        ubicacion: ubicacion === 'en_viaje' ? null : Number(ubicacion),
      });

      setIsCreateModalOpen(false);

      if (res.success) {
        setResultModal({ type: 'success', message: res.message || 'Vehículo creado exitosamente.' });
        setShowResultModal(true);
        resetForm();
      } else {
        setResultModal({ type: 'error', message: res.error || 'Error al crear vehículo.' });
        setShowResultModal(true);
      }
    });
  };

  const handleEdit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!vehiculoToEdit) return;
    setFeedback(null);
    setAttemptedSubmit(true);

    const newErrors = {
      chasis: validateChasis(chasis),
      patente: validatePatente(patente),
      marca: validateMarca(marca),
      modelo: validateModelo(modelo),
      anio: validateAnio(anio),
      precio: validatePrecio(precio),
      ubicacion: validateUbicacion(ubicacion),
    };
    setErrors(newErrors);
    if (Object.values(newErrors).some((e) => e !== '')) return;

    startTransition(async () => {
      const res = await updateVehiculoAction(vehiculoToEdit.id, {
        chasis,
        patente,
        tipo_vehiculo: tipoVehiculo || null,
        marca_codigo: marcaCodigo || null,
        marca,
        modelo,
        idv: idv || null,
        anio: anio || null,
        color: color || undefined,
        precio: precio ? Number(precio) : null,
        ubicacion: ubicacion === 'en_viaje' ? null : Number(ubicacion),
      });

      setIsEditModalOpen(false);
      setVehiculoToEdit(null);

      if (res.success) {
        setResultModal({ type: 'success', message: res.message || 'Vehículo actualizado exitosamente.' });
        setShowResultModal(true);
        resetForm();
      } else {
        setResultModal({ type: 'error', message: res.error || 'Error al actualizar vehículo.' });
        setShowResultModal(true);
      }
    });
  };

  const handleDelete = async () => {
    if (!vehiculoToDelete) return;
    setFeedback(null);

    startTransition(async () => {
      const res = await deleteVehiculoAction(vehiculoToDelete.id);

      setIsDeleteModalOpen(false);
      setVehiculoToDelete(null);

      if (res.success) {
        setResultModal({ type: 'success', message: res.message || 'Vehículo eliminado exitosamente.' });
        setShowResultModal(true);
      } else {
        setResultModal({ type: 'error', message: res.error || 'Error al eliminar vehículo.' });
        setShowResultModal(true);
      }
    });
  };

  const openEditModal = (vehiculo: VehiculoConDisponibilidad) => {
    setVehiculoToEdit(vehiculo);
    setChasis(vehiculo.chasis);
    setPatente(vehiculo.patente ?? '');
    setMarca(vehiculo.marca);
    setModelo(vehiculo.modelo);
    setAnio(vehiculo.anio ?? 0);
    setTipoVehiculo(vehiculo.tipo_vehiculo ?? '');
    setMarcaCodigo(vehiculo.marca_codigo ?? '');
    setIdv(vehiculo.idv ?? '');
    setColor(vehiculo.color || '');
    setPrecio(vehiculo.precio != null ? String(vehiculo.precio) : '');
    setUbicacion(vehiculo.ubicacion != null ? String(vehiculo.ubicacion) : 'en_viaje');
    setIsEditModalOpen(true);
  };

  const openDeleteModal = (vehiculo: VehiculoConDisponibilidad) => {
    setVehiculoToDelete(vehiculo);
    setIsDeleteModalOpen(true);
  };

  const resetImportModal = () => {
    setImportCsv('');
    setArchivoImport('');
    setIsReadingFile(false);
  };

  const handleImportCsv = async () => {
    const trimmed = importCsv.trim();
    if (!trimmed) return;
    startImportTransition(async () => {
      const res = await importVehiculosAction({ csv: trimmed });
      if (res.success) {
        setResultModal({
          type: 'success',
          message: res.mensaje || 'Importación completada.',
          extra: { importados: res.importados, duplicados: res.duplicados, errores: res.errores, marcasProcesadas: res.marcasProcesadas },
        });
        setShowResultModal(true);
        setIsImportModalOpen(false);
        resetImportModal();
      } else {
        setResultModal({ type: 'error', message: res.error || 'Error al importar.' });
        setShowResultModal(true);
      }
    });
  };

  const handleFileRead = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const esExcel = /\.(xls|xlsx)$/i.test(file.name);
    setArchivoImport(file.name);
    e.target.value = '';

    if (esExcel) {
      setIsReadingFile(true);
      void (async () => {
        try {
          const XLSX = await import('xlsx');
          const data = await file.arrayBuffer();
          const wb = XLSX.read(data, { type: 'array' });
          const hoja = wb.Sheets[wb.SheetNames[0] || ''];
          if (!hoja) {
            setResultModal({ type: 'error', message: 'El archivo Excel no contiene hojas válidas.' });
            setShowResultModal(true);
            setArchivoImport('');
            return;
          }
          const filas: unknown[][] = XLSX.utils.sheet_to_json(hoja, {
            header: 1,
            raw: false,
            defval: '',
          });
          const csv = filas
            .map((fila) =>
              Array.isArray(fila)
                ? fila
                    .map((cell) => {
                      const txt = String(cell ?? '').trim();
                      return /[",\n]/.test(txt) ? `"${txt.replace(/"/g, '""')}"` : txt;
                    })
                    .join(',')
                : ''
            )
            .join('\n');
          setImportCsv(csv);
        } catch {
          setResultModal({
            type: 'error',
            message: 'No se pudo leer el archivo Excel. Verifica que sea un .xls o .xlsx válido.',
          });
          setShowResultModal(true);
          setImportCsv('');
          setArchivoImport('');
        } finally {
          setIsReadingFile(false);
        }
      })();
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setImportCsv((ev.target?.result as string) ?? '');
      };
      reader.readAsText(file);
    }
  };

  /** Ubicación, estado y acciones de un vehículo: los comparten la tabla y las tarjetas móviles. */
  function ubicacionVehiculo(vehiculo: VehiculoConDisponibilidad) {
    const isSold = vehiculo.estado_disponibilidad === 'vendido';
    return (
      <>
        {isSold ? (
          <span className="text-neutral-400">—</span>
        ) : vehiculo.en_transito_hacia ? (
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-sky-50 text-sky-800 border border-sky-200"
            title={`Sale de ${vehiculo.ubicacion_nombre ?? 'sin sucursal'}`}
          >
            <Truck className="w-3 h-3" />
            En camino a {vehiculo.en_transito_hacia}
          </span>
        ) : vehiculo.ubicacion != null ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-neutral-100 text-neutral-900 border border-neutral-200">
            <Car className="w-3 h-3" />
            {vehiculo.ubicacion_nombre || `Sucursal #${vehiculo.ubicacion}`}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
            <Truck className="w-3 h-3" />
            En viaje / Container
          </span>
        )}
      </>
    );
  }

  function estadoVehiculo(vehiculo: VehiculoConDisponibilidad) {
    const isReserved = vehiculo.estado_disponibilidad === 'reservado';
    const isSold = vehiculo.estado_disponibilidad === 'vendido';
    return (
      <>
        {isReserved ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
            <Lock className="w-3 h-3" />
            Reservado
          </span>
        ) : isSold ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-neutral-900 text-white border border-neutral-900">
            <CheckCircle2 className="w-3 h-3" />
            <span title={DESCRIPCION_DISPONIBILIDAD.vendido}>{ETIQUETA_DISPONIBILIDAD.vendido}</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-neutral-100 text-neutral-500 border border-neutral-200">
            <Unlock className="w-3 h-3" />
            {ETIQUETA_DISPONIBILIDAD.liberado}
          </span>
        )}
      </>
    );
  }

  function accionesVehiculo(vehiculo: VehiculoConDisponibilidad) {
    const isReserved = vehiculo.estado_disponibilidad === 'reservado';
    const isSold = vehiculo.estado_disponibilidad === 'vendido';
    return (
      <>
        {isReserved || isSold ? (
          <span
            title={isReserved ? 'No disponible: vehículo reservado en una solicitud' : 'No disponible: vehículo ya entregado al cliente'}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-neutral-400 bg-neutral-50 cursor-not-allowed"
          >
            <Lock className="w-3 h-3" />
            Bloqueado
          </span>
        ) : (
          <>
            <button
              onClick={() => openEditModal(vehiculo)}
              title="Editar vehículo"
              className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 transition-colors cursor-pointer"
            >
              <Edit3 className="w-4 h-4" />
            </button>
            {userRole === 'administrador' && (
              <button
                onClick={() => openDeleteModal(vehiculo)}
                title="Eliminar vehículo"
                className="p-1.5 rounded-lg text-neutral-500 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </>
        )}
      </>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 flex items-center gap-2">
            <Car className="w-7 h-7 text-neutral-900" />
            <span>Gestión de Vehículos</span>
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            Administra el parque automotor de H.Motores
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              resetImportModal();
              setIsImportModalOpen(true);
            }}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-neutral-300 text-neutral-900 text-sm font-semibold rounded-xl transition-all hover:bg-neutral-50 cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            <span>Importar Stock</span>
          </button>
          <button
            onClick={() => {
              resetForm();
              setIsCreateModalOpen(true);
            }}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-neutral-900 hover:bg-neutral-700 text-white text-sm font-semibold rounded-xl transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Registrar Vehículo</span>
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-neutral-200 rounded-2xl p-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Total Vehículos</p>
            <p className="text-3xl font-bold text-neutral-900 mt-1">{totalVehiculos}</p>
            {filtrosActivos && (
              <p className="text-[11px] text-neutral-400 mt-0.5">de {vehiculos.length} en inventario</p>
            )}
          </div>
          <div className="w-11 h-11 rounded-xl border border-neutral-300 flex items-center justify-center text-neutral-900">
            <Car className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-neutral-200 rounded-2xl p-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Disponibles</p>
            <p className="text-3xl font-bold text-neutral-900 mt-1">{disponibles}</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-neutral-100 flex items-center justify-center text-neutral-500">
            <Unlock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-neutral-900 border border-neutral-900 rounded-2xl p-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-neutral-400 uppercase tracking-wider">En Uso (Reservados)</p>
            <p className="text-3xl font-bold text-white mt-1">{reservados}</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center text-white">
            <Lock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-neutral-200 rounded-2xl p-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Entregados al cliente</p>
            <p className="text-3xl font-bold text-neutral-900 mt-1">{vendidos}</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-neutral-100 flex items-center justify-center text-neutral-500">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Feedback banner */}
      {feedback && (
        <div
          className={`p-5 rounded-2xl border transition-all ${
            feedback.type === 'success'
              ? 'bg-neutral-900 border-neutral-900 text-white'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-6 h-6 text-white shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
              )}
              <p className="font-bold text-base">{feedback.message}</p>
            </div>
            <button
              onClick={() => setFeedback(null)}
              className="text-neutral-300 hover:text-white p-1 rounded-lg hover:bg-white/10 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Filters and Search */}
      <div className="bg-white border border-neutral-200 rounded-2xl p-4 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              type="text"
              placeholder="Buscar por chasis, patente, marca..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full pl-10 pr-3 py-2 bg-white border border-neutral-300 rounded-xl text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            <div className="flex items-center gap-2">
              <label
                htmlFor="filtro-marca"
                className="text-xs font-semibold text-neutral-500 uppercase tracking-wider"
              >
                Marca:
              </label>
              <select
                id="filtro-marca"
                value={selectedMarca}
                onChange={(e) => handleMarcaChange(e.target.value)}
                className="bg-white border border-neutral-300 rounded-xl px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
              >
                <option value={FILTRO_TODAS}>Todas</option>
                {marcas.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label
                htmlFor="filtro-estado"
                className="text-xs font-semibold text-neutral-500 uppercase tracking-wider"
              >
                Estado:
              </label>
              <select
                id="filtro-estado"
                value={selectedDisponibilidad}
                onChange={(e) => handleDisponibilidadChange(e.target.value)}
                className="bg-white border border-neutral-300 rounded-xl px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
              >
                <option value={FILTRO_TODAS}>Todos</option>
                <option value="liberado">Disponibles</option>
                <option value="reservado">Reservados</option>
                <option value={FILTRO_EN_TRANSITO}>En tránsito</option>
                <option value="vendido">Entregados al cliente</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label
                htmlFor="filtro-ubicacion"
                className="text-xs font-semibold text-neutral-500 uppercase tracking-wider"
              >
                Ubicación:
              </label>
              <select
                id="filtro-ubicacion"
                value={selectedUbicacion}
                onChange={(e) => handleUbicacionChange(e.target.value)}
                className="bg-white border border-neutral-300 rounded-xl px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
              >
                <option value={FILTRO_TODAS}>Todas</option>
                <option value={FILTRO_EN_VIAJE}>En viaje / Container</option>
                {sucursales.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.nombre || `Sucursal #${s.id}`}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between border-t border-neutral-100 pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                  Registro:
            </span>
            <div className="flex items-center gap-2">
              <label htmlFor="filtro-fecha-desde" className="text-xs text-neutral-500">
                Desde
              </label>
              <input
                id="filtro-fecha-desde"
                type="date"
                value={fechaDesde}
                max={fechaHasta || undefined}
                onChange={(e) => handleFechaDesdeChange(e.target.value)}
                className="bg-white border border-neutral-300 rounded-xl px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
              />
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="filtro-fecha-hasta" className="text-xs text-neutral-500">
                Hasta
              </label>
              <input
                id="filtro-fecha-hasta"
                type="date"
                value={fechaHasta}
                min={fechaDesde || undefined}
                onChange={(e) => handleFechaHastaChange(e.target.value)}
                className="bg-white border border-neutral-300 rounded-xl px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
              />
            </div>
          </div>

          {filtrosActivos && (
            <button
              onClick={clearFilters}
              className="inline-flex items-center gap-1.5 self-start sm:self-auto px-3 py-2 rounded-xl text-xs font-semibold bg-neutral-100 text-neutral-700 border border-neutral-200 hover:bg-neutral-200 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {/* Fase G: cambio de ubicación masivo */}
      {seleccionablesFiltrados.length > 0 && (
        <div className="bg-white border border-neutral-200 rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center gap-3 text-sm">
          <div className="flex flex-wrap items-center gap-3 flex-1">
            <span className="font-semibold text-neutral-900 flex items-center gap-1.5">
              <MapPin className="w-4 h-4" /> Cambiar ubicación
            </span>
            <span className="text-neutral-500">{seleccion.size} seleccionado(s)</span>
            <button
              onClick={() => setSeleccion(new Set(seleccionablesFiltrados.map((v) => v.id)))}
              className="text-xs font-semibold text-neutral-700 hover:underline cursor-pointer"
            >
              Seleccionar los {seleccionablesFiltrados.length} disponibles del filtro
            </button>
            {seleccion.size > 0 && (
              <button onClick={() => setSeleccion(new Set())} className="text-xs font-semibold text-neutral-500 hover:underline cursor-pointer">
                Quitar selección
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <select
              value={destinoMasivo}
              onChange={(e) => setDestinoMasivo(e.target.value)}
              aria-label="Sucursal de destino"
              className="bg-white border border-neutral-300 rounded-xl px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
            >
              <option value="">Sucursal de destino</option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>{s.nombre ?? `Sucursal #${s.id}`}</option>
              ))}
            </select>
            <button
              onClick={moverSeleccionados}
              disabled={moviendo || seleccion.size === 0 || !destinoMasivo}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-neutral-900 hover:bg-neutral-700 rounded-xl cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {moviendo ? 'Moviendo...' : `Mover ${seleccion.size}`}
            </button>
          </div>
        </div>
      )}

      {/* Tarjetas (móvil y tablet): la tabla de 10 columnas deja las acciones fuera de la pantalla */}
      <div className="lg:hidden bg-white border border-neutral-200 rounded-2xl overflow-hidden shadow-sm">
        {seleccionablesPagina.length > 0 && (
          <label className="flex items-center gap-3 px-4 py-3 border-b border-neutral-200 bg-neutral-50 text-xs font-semibold text-neutral-600 cursor-pointer">
            <input type="checkbox" checked={paginaSeleccionada} onChange={alternarPagina} className="w-4 h-4" />
            Seleccionar los disponibles de esta página
          </label>
        )}
        {filteredVehiculos.length === 0 ? (
          <p className="py-8 px-4 text-center text-sm text-neutral-400">
            No se encontraron vehículos que coincidan con la búsqueda.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-200">
            {pageVehiculos.map((vehiculo) => (
              <li key={vehiculo.id} className="p-4 space-y-3">
                <div className="flex items-start gap-3">
                  {esSeleccionableParaMover(vehiculo) && (
                    <input
                      type="checkbox"
                      checked={seleccion.has(vehiculo.id)}
                      onChange={() => alternarSeleccion(vehiculo.id)}
                      aria-label={`Seleccionar ${vehiculo.chasis}`}
                      className="mt-1 w-4 h-4 shrink-0"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-neutral-900 break-words">
                      {vehiculo.marca} {vehiculo.modelo}
                      {(vehiculo.tipo_vehiculo || vehiculo.marca_codigo) && (
                        <span className="font-normal text-neutral-500">
                          {' · '}
                          {[vehiculo.tipo_vehiculo, vehiculo.marca_codigo].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-neutral-600 break-all">{vehiculo.chasis}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 -mr-1">{accionesVehiculo(vehiculo)}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {estadoVehiculo(vehiculo)}
                  {ubicacionVehiculo(vehiculo)}
                </div>
                <dl className="grid grid-cols-3 gap-x-3 text-xs">
                  <div>
                    <dt className="text-neutral-400">Patente</dt>
                    <dd className="text-neutral-800 font-semibold">{vehiculo.patente || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-neutral-400">IDV</dt>
                    <dd className="text-neutral-800 font-mono">{vehiculo.idv || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-neutral-400">Color</dt>
                    <dd className="text-neutral-800 break-words">{vehiculo.color || '—'}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Vehiculos Table */}
      <div className="hidden lg:block bg-white border border-neutral-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase font-semibold text-neutral-500 tracking-wider">
                <th className="py-3.5 pl-4 w-8">
                  {seleccionablesPagina.length > 0 && (
                    <input
                      type="checkbox"
                      checked={paginaSeleccionada}
                      onChange={alternarPagina}
                      title="Seleccionar los disponibles de esta página"
                      aria-label="Seleccionar los disponibles de esta página"
                    />
                  )}
                </th>
                <th className="py-3.5 px-4">Tipo de vehículo</th>
                <th className="py-3.5 px-4">Marca</th>
                <th className="py-3.5 px-4">Marca completa</th>
                <th className="py-3.5 px-4">Modelo</th>
                <th className="py-3.5 px-4">IDV</th>
                <th className="py-3.5 px-4">Chasis</th>
                <th className="py-3.5 px-4">Color</th>
                <th className="py-3.5 px-4">Ubicación</th>
                <th className="py-3.5 px-4">Patente</th>
                <th className="py-3.5 px-4">Estado</th>
                <th className="py-3.5 px-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 text-sm">
              {filteredVehiculos.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-8 text-center text-neutral-400">
                    No se encontraron vehículos que coincidan con la búsqueda.
                  </td>
                </tr>
              ) : (
                pageVehiculos.map((vehiculo) => {
                  return (
                    <tr
                      key={vehiculo.id}
                      className="hover:bg-neutral-50 transition-colors"
                    >
                      <td className="py-3.5 pl-4 w-8">
                        {esSeleccionableParaMover(vehiculo) && (
                          <input
                            type="checkbox"
                            checked={seleccion.has(vehiculo.id)}
                            onChange={() => alternarSeleccion(vehiculo.id)}
                            aria-label={`Seleccionar ${vehiculo.chasis}`}
                          />
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-xs text-neutral-600">
                        {vehiculo.tipo_vehiculo || '—'}
                      </td>
                      <td className="py-3.5 px-4 text-xs font-semibold text-neutral-700">
                        {vehiculo.marca_codigo || '—'}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-neutral-900">
                        {vehiculo.marca}
                      </td>
                      <td className="py-3.5 px-4 text-neutral-700">
                        {vehiculo.modelo}
                      </td>
                      <td className="py-3.5 px-4 text-neutral-600 font-mono text-xs">
                        {vehiculo.idv || '—'}
                      </td>
                      <td className="py-3.5 px-4 text-neutral-600 font-mono text-xs">
                        {vehiculo.chasis}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-neutral-500">
                        {vehiculo.color || '—'}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-neutral-600">
                        {ubicacionVehiculo(vehiculo)}
                      </td>
                      <td className="py-3.5 px-4">
                        {vehiculo.patente ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-neutral-100 text-neutral-900 border border-neutral-200">
                            {vehiculo.patente}
                          </span>
                        ) : (
                          <span className="text-xs text-neutral-400 italic">Sin patente</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        {estadoVehiculo(vehiculo)}
                      </td>

                      {/* Acciones */}
                      <td className="py-3.5 px-4 text-right space-x-2">
                        {accionesVehiculo(vehiculo)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {filteredVehiculos.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white border border-neutral-200 rounded-2xl px-4 py-3">
          <p className="text-xs text-neutral-500">
            Mostrando {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filteredVehiculos.length)} de {filteredVehiculos.length} vehículos
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(currentPageClamped - 1)}
              disabled={currentPageClamped <= 1}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              Anterior
            </button>
            <span className="text-xs font-semibold text-neutral-700 px-2">
              Página {currentPageClamped} de {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(currentPageClamped + 1)}
              disabled={currentPageClamped >= totalPages}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              Siguiente
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Modal: Crear Vehículo */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white border border-neutral-200 rounded-2xl w-full max-w-lg shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-neutral-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-neutral-900 border border-neutral-900 flex items-center justify-center text-white">
                  <Car className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-neutral-900">Registrar Vehículo</h2>
                  <p className="text-xs text-neutral-500">Incorporación manual al sistema</p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-neutral-400 hover:text-neutral-900 p-1 rounded-lg hover:bg-neutral-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-6 space-y-4">
              {/* Error banner */}
              {attemptedSubmit && hasErrors && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>Revisa los campos marcados en rojo antes de continuar.</span>
                </div>
              )}

              {/* Chasis */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">
                    Chasis *
                  </label>
                  <span className={`text-[10px] font-mono font-semibold ${chasis.length === 17 ? 'text-green-600' : chasis.length > 0 ? 'text-red-500' : 'text-neutral-400'}`}>
                    {chasis.length}/17
                  </span>
                </div>
                <input
                  type="text"
                  maxLength={17}
                  placeholder="1HGBH41JXMN109186"
                  value={chasis}
                  onChange={(e) => {
                    const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 17);
                    setChasis(val);
                    setErrors((p) => ({ ...p, chasis: validateChasis(val) }));
                  }}
                  className={`w-full px-3 py-2 bg-white border rounded-xl text-sm text-neutral-900 placeholder-neutral-300 focus:outline-none focus:ring-2 font-mono ${
                    errors.chasis
                      ? 'border-red-400 focus:ring-red-400'
                      : 'border-neutral-300 focus:ring-neutral-900'
                  }`}
                />
                {errors.chasis && (
                  <p className="text-[11px] text-red-600 flex items-center gap-1 mt-0.5">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    {errors.chasis}
                  </p>
                )}
              </div>

              {/* Patente */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">
                    Patente <span className="text-neutral-400 font-medium normal-case">— opcional</span>
                  </label>
                  <span className={`text-[10px] font-mono font-semibold ${/^[A-Z]{4}-[0-9]{2,4}$/i.test(patente) ? 'text-green-600' : patente.length > 0 ? 'text-red-500' : 'text-neutral-400'}`}>
                    {patente || 'XXXX-00'}
                  </span>
                </div>
                <input
                  type="text"
                  placeholder="ABCD-12"
                  value={patente}
                  onChange={(e) => {
                    const val = formatPatente(e.target.value, patente);
                    setPatente(val);
                    setErrors((p) => ({ ...p, patente: validatePatente(val) }));
                  }}
                  className={`w-full px-3 py-2 bg-white border rounded-xl text-sm text-neutral-900 placeholder-neutral-300 focus:outline-none focus:ring-2 font-mono ${
                    errors.patente
                      ? 'border-red-400 focus:ring-red-400'
                      : 'border-neutral-300 focus:ring-neutral-900'
                  }`}
                />
                {errors.patente && (
                  <p className="text-[11px] text-red-600 flex items-center gap-1 mt-0.5">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    {errors.patente}
                  </p>
                )}
              </div>

              {/* Marca & Modelo */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">
                    Marca completa *
                  </label>
                  <input
                    type="text"
                    placeholder="HYUNDAI, TOYOTA..."
                    value={marca}
                    onChange={(e) => {
                      setMarca(e.target.value);
                      setErrors((p) => ({ ...p, marca: validateMarca(e.target.value) }));
                    }}
                    className={`w-full px-3 py-2 bg-white border rounded-xl text-sm text-neutral-900 placeholder-neutral-300 focus:outline-none focus:ring-2 ${
                      errors.marca
                        ? 'border-red-400 focus:ring-red-400'
                        : 'border-neutral-300 focus:ring-neutral-900'
                    }`}
                  />
                  {errors.marca && (
                    <p className="text-[11px] text-red-600 flex items-center gap-1 mt-0.5">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      {errors.marca}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">
                    Modelo *
                  </label>
                  <input
                    type="text"
                    placeholder="Corolla, Spark..."
                    value={modelo}
                    onChange={(e) => {
                      setModelo(e.target.value);
                      setErrors((p) => ({ ...p, modelo: validateModelo(e.target.value) }));
                    }}
                    className={`w-full px-3 py-2 bg-white border rounded-xl text-sm text-neutral-900 placeholder-neutral-300 focus:outline-none focus:ring-2 ${
                      errors.modelo
                        ? 'border-red-400 focus:ring-red-400'
                        : 'border-neutral-300 focus:ring-neutral-900'
                    }`}
                  />
                  {errors.modelo && (
                    <p className="text-[11px] text-red-600 flex items-center gap-1 mt-0.5">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      {errors.modelo}
                    </p>
                  )}
                </div>
              </div>

              {/* Tipo, código de marca e IDV (columnas del Excel de stock) */}
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">
                    Tipo
                  </label>
                  <input
                    type="text"
                    placeholder="VN"
                    value={tipoVehiculo}
                    onChange={(e) => setTipoVehiculo(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-xl text-sm text-neutral-900 placeholder-neutral-300 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">
                    Marca
                  </label>
                  <input
                    type="text"
                    placeholder="HY, TO..."
                    value={marcaCodigo}
                    onChange={(e) => setMarcaCodigo(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-xl text-sm text-neutral-900 placeholder-neutral-300 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">
                    IDV
                  </label>
                  <input
                    type="text"
                    placeholder="157651"
                    value={idv}
                    onChange={(e) => setIdv(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-xl text-sm text-neutral-900 placeholder-neutral-300 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  />
                </div>
              </div>

              {/* Año & Color */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">
                    Año <span className="text-neutral-400 font-medium normal-case">— opcional</span>
                  </label>
                  <input
                    type="number"
                    min={1900}
                    max={currentYear + 1}
                    placeholder={`1900 - ${currentYear + 1}`}
                    value={anio || ''}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 0;
                      setAnio(val);
                      setErrors((p) => ({ ...p, anio: validateAnio(val) }));
                    }}
                    className={`w-full px-3 py-2 bg-white border rounded-xl text-sm text-neutral-900 placeholder-neutral-300 focus:outline-none focus:ring-2 ${
                      errors.anio
                        ? 'border-red-400 focus:ring-red-400'
                        : 'border-neutral-300 focus:ring-neutral-900'
                    }`}
                  />
                  {errors.anio && (
                    <p className="text-[11px] text-red-600 flex items-center gap-1 mt-0.5">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      {errors.anio}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">
                    Color
                  </label>
                  <input
                    type="text"
                    placeholder="Rojo, Azul, Negro..."
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-xl text-sm text-neutral-900 placeholder-neutral-300 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  />
                </div>
              </div>

              {/* Ubicación */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">
                    Ubicación *
                  </label>
                  <span className="text-[10px] text-neutral-400 font-medium normal-case">
                    En viaje / container puede quedar sin asignar
                  </span>
                </div>
                <select
                  value={ubicacion}
                  onChange={(e) => {
                    setUbicacion(e.target.value);
                    setErrors((p) => ({ ...p, ubicacion: validateUbicacion(e.target.value) }));
                  }}
                  className={`w-full px-3 py-2 bg-white border rounded-xl text-sm text-neutral-900 placeholder-neutral-300 focus:outline-none focus:ring-2 ${
                    errors.ubicacion
                      ? 'border-red-400 focus:ring-red-400'
                      : 'border-neutral-300 focus:ring-neutral-900'
                  }`}
                >
                  <option value="" disabled>Selecciona una opción...</option>
                  <option value="en_viaje">En viaje / Container (sin asignar)</option>
                  {sucursales.map((s) => (
                    <option key={s.id} value={String(s.id)}>
                      {s.nombre || `Sucursal #${s.id}`}
                    </option>
                  ))}
                </select>
                {errors.ubicacion && (
                  <p className="text-[11px] text-red-600 flex items-center gap-1 mt-0.5">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    {errors.ubicacion}
                  </p>
                )}
              </div>

              {/* Precio */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">
                  Precio (CLP) <span className="text-neutral-400 font-medium normal-case">— opcional</span>
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="Ej: 15000000"
                  value={precio}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPrecio(val);
                    setErrors((p) => ({ ...p, precio: validatePrecio(val) }));
                  }}
                  className={`w-full px-3 py-2 bg-white border rounded-xl text-sm text-neutral-900 placeholder-neutral-300 focus:outline-none focus:ring-2 ${
                    errors.precio
                      ? 'border-red-400 focus:ring-red-400'
                      : 'border-neutral-300 focus:ring-neutral-900'
                  }`}
                />
                {errors.precio && (
                  <p className="text-[11px] text-red-600 flex items-center gap-1 mt-0.5">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    {errors.precio}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-neutral-600 hover:text-neutral-900 rounded-xl hover:bg-neutral-100 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-sm font-semibold text-white bg-neutral-900 hover:bg-neutral-700 active:bg-black rounded-xl disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? 'Creando...' : 'Registrar Vehículo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Editar Vehículo */}
      {isEditModalOpen && vehiculoToEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white border border-neutral-200 rounded-2xl w-full max-w-lg shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-neutral-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-neutral-900 border border-neutral-900 flex items-center justify-center text-white">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-neutral-900">Editar Vehículo</h2>
                  <p className="text-xs text-neutral-500">{vehiculoToEdit.patente || 'Sin patente registrada'}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsEditModalOpen(false);
                  setVehiculoToEdit(null);
                  resetForm();
                }}
                className="text-neutral-400 hover:text-neutral-900 p-1 rounded-lg hover:bg-neutral-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEdit} className="p-6 space-y-4">
              {/* Error banner */}
              {attemptedSubmit && hasErrors && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>Revisa los campos marcados en rojo antes de continuar.</span>
                </div>
              )}

              {/* Chasis */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">
                    Chasis *
                  </label>
                  <span className={`text-[10px] font-mono font-semibold ${chasis.length === 17 ? 'text-green-600' : chasis.length > 0 ? 'text-red-500' : 'text-neutral-400'}`}>
                    {chasis.length}/17
                  </span>
                </div>
                <input
                  type="text"
                  maxLength={17}
                  placeholder="1HGBH41JXMN109186"
                  value={chasis}
                  onChange={(e) => {
                    const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 17);
                    setChasis(val);
                    setErrors((p) => ({ ...p, chasis: validateChasis(val) }));
                  }}
                  className={`w-full px-3 py-2 bg-white border rounded-xl text-sm text-neutral-900 placeholder-neutral-300 focus:outline-none focus:ring-2 font-mono ${
                    errors.chasis
                      ? 'border-red-400 focus:ring-red-400'
                      : 'border-neutral-300 focus:ring-neutral-900'
                  }`}
                />
                {errors.chasis && (
                  <p className="text-[11px] text-red-600 flex items-center gap-1 mt-0.5">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    {errors.chasis}
                  </p>
                )}
              </div>

              {/* Patente */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">
                    Patente <span className="text-neutral-400 font-medium normal-case">— opcional</span>
                  </label>
                  <span className={`text-[10px] font-mono font-semibold ${/^[A-Z]{4}-[0-9]{2,4}$/i.test(patente) ? 'text-green-600' : patente.length > 0 ? 'text-red-500' : 'text-neutral-400'}`}>
                    {patente || 'XXXX-00'}
                  </span>
                </div>
                <input
                  type="text"
                  placeholder="ABCD-12"
                  value={patente}
                  onChange={(e) => {
                    const val = formatPatente(e.target.value, patente);
                    setPatente(val);
                    setErrors((p) => ({ ...p, patente: validatePatente(val) }));
                  }}
                  className={`w-full px-3 py-2 bg-white border rounded-xl text-sm text-neutral-900 placeholder-neutral-300 focus:outline-none focus:ring-2 font-mono ${
                    errors.patente
                      ? 'border-red-400 focus:ring-red-400'
                      : 'border-neutral-300 focus:ring-neutral-900'
                  }`}
                />
                {errors.patente && (
                  <p className="text-[11px] text-red-600 flex items-center gap-1 mt-0.5">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    {errors.patente}
                  </p>
                )}
              </div>

              {/* Marca & Modelo */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">
                    Marca completa *
                  </label>
                  <input
                    type="text"
                    placeholder="HYUNDAI, TOYOTA..."
                    value={marca}
                    onChange={(e) => {
                      setMarca(e.target.value);
                      setErrors((p) => ({ ...p, marca: validateMarca(e.target.value) }));
                    }}
                    className={`w-full px-3 py-2 bg-white border rounded-xl text-sm text-neutral-900 placeholder-neutral-300 focus:outline-none focus:ring-2 ${
                      errors.marca
                        ? 'border-red-400 focus:ring-red-400'
                        : 'border-neutral-300 focus:ring-neutral-900'
                    }`}
                  />
                  {errors.marca && (
                    <p className="text-[11px] text-red-600 flex items-center gap-1 mt-0.5">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      {errors.marca}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">
                    Modelo *
                  </label>
                  <input
                    type="text"
                    placeholder="Corolla, Spark..."
                    value={modelo}
                    onChange={(e) => {
                      setModelo(e.target.value);
                      setErrors((p) => ({ ...p, modelo: validateModelo(e.target.value) }));
                    }}
                    className={`w-full px-3 py-2 bg-white border rounded-xl text-sm text-neutral-900 placeholder-neutral-300 focus:outline-none focus:ring-2 ${
                      errors.modelo
                        ? 'border-red-400 focus:ring-red-400'
                        : 'border-neutral-300 focus:ring-neutral-900'
                    }`}
                  />
                  {errors.modelo && (
                    <p className="text-[11px] text-red-600 flex items-center gap-1 mt-0.5">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      {errors.modelo}
                    </p>
                  )}
                </div>
              </div>

              {/* Tipo, código de marca e IDV (columnas del Excel de stock) */}
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">
                    Tipo
                  </label>
                  <input
                    type="text"
                    placeholder="VN"
                    value={tipoVehiculo}
                    onChange={(e) => setTipoVehiculo(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-xl text-sm text-neutral-900 placeholder-neutral-300 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">
                    Marca
                  </label>
                  <input
                    type="text"
                    placeholder="HY, TO..."
                    value={marcaCodigo}
                    onChange={(e) => setMarcaCodigo(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-xl text-sm text-neutral-900 placeholder-neutral-300 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">
                    IDV
                  </label>
                  <input
                    type="text"
                    placeholder="157651"
                    value={idv}
                    onChange={(e) => setIdv(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-xl text-sm text-neutral-900 placeholder-neutral-300 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  />
                </div>
              </div>

              {/* Año & Color */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">
                    Año <span className="text-neutral-400 font-medium normal-case">— opcional</span>
                  </label>
                  <input
                    type="number"
                    min={1900}
                    max={currentYear + 1}
                    placeholder={`1900 - ${currentYear + 1}`}
                    value={anio || ''}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 0;
                      setAnio(val);
                      setErrors((p) => ({ ...p, anio: validateAnio(val) }));
                    }}
                    className={`w-full px-3 py-2 bg-white border rounded-xl text-sm text-neutral-900 placeholder-neutral-300 focus:outline-none focus:ring-2 ${
                      errors.anio
                        ? 'border-red-400 focus:ring-red-400'
                        : 'border-neutral-300 focus:ring-neutral-900'
                    }`}
                  />
                  {errors.anio && (
                    <p className="text-[11px] text-red-600 flex items-center gap-1 mt-0.5">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      {errors.anio}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">
                    Color
                  </label>
                  <input
                    type="text"
                    placeholder="Rojo, Azul, Negro..."
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-xl text-sm text-neutral-900 placeholder-neutral-300 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  />
                </div>
              </div>

              {/* Ubicación */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">
                    Ubicación *
                  </label>
                  <span className="text-[10px] text-neutral-400 font-medium normal-case">
                    En viaje / container puede quedar sin asignar
                  </span>
                </div>
                <select
                  value={ubicacion}
                  onChange={(e) => {
                    setUbicacion(e.target.value);
                    setErrors((p) => ({ ...p, ubicacion: validateUbicacion(e.target.value) }));
                  }}
                  className={`w-full px-3 py-2 bg-white border rounded-xl text-sm text-neutral-900 placeholder-neutral-300 focus:outline-none focus:ring-2 ${
                    errors.ubicacion
                      ? 'border-red-400 focus:ring-red-400'
                      : 'border-neutral-300 focus:ring-neutral-900'
                  }`}
                >
                  <option value="" disabled>Selecciona una opción...</option>
                  <option value="en_viaje">En viaje / Container (sin asignar)</option>
                  {sucursales.map((s) => (
                    <option key={s.id} value={String(s.id)}>
                      {s.nombre || `Sucursal #${s.id}`}
                    </option>
                  ))}
                </select>
                {errors.ubicacion && (
                  <p className="text-[11px] text-red-600 flex items-center gap-1 mt-0.5">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    {errors.ubicacion}
                  </p>
                )}
              </div>

              {/* Precio */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">
                  Precio (CLP) <span className="text-neutral-400 font-medium normal-case">— opcional</span>
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="Ej: 15000000"
                  value={precio}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPrecio(val);
                    setErrors((p) => ({ ...p, precio: validatePrecio(val) }));
                  }}
                  className={`w-full px-3 py-2 bg-white border rounded-xl text-sm text-neutral-900 placeholder-neutral-300 focus:outline-none focus:ring-2 ${
                    errors.precio
                      ? 'border-red-400 focus:ring-red-400'
                      : 'border-neutral-300 focus:ring-neutral-900'
                  }`}
                />
                {errors.precio && (
                  <p className="text-[11px] text-red-600 flex items-center gap-1 mt-0.5">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    {errors.precio}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setVehiculoToEdit(null);
                    resetForm();
                  }}
                  className="px-4 py-2 text-sm font-semibold text-neutral-600 hover:text-neutral-900 rounded-xl hover:bg-neutral-100 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-sm font-semibold text-white bg-neutral-900 hover:bg-neutral-700 active:bg-black rounded-xl disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Confirmar Eliminación */}
      {isDeleteModalOpen && vehiculoToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white border border-neutral-200 rounded-2xl w-full max-w-md shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-neutral-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center text-red-600">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-neutral-900">Eliminar Vehículo</h2>
                  <p className="text-xs text-neutral-500">Esta acción no se puede deshacer</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setVehiculoToDelete(null);
                }}
                className="text-neutral-400 hover:text-neutral-900 p-1 rounded-lg hover:bg-neutral-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              <p className="text-sm text-neutral-600">
                ¿Estás seguro de que deseas eliminar el vehículo{' '}
                <strong className="text-neutral-900">
                  {vehiculoToDelete.marca} {vehiculoToDelete.modelo}
                </strong>{' '}
                con patente <strong className="text-neutral-900">{vehiculoToDelete.patente}</strong>?
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-neutral-200 bg-neutral-50">
              <button
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setVehiculoToDelete(null);
                }}
                className="px-4 py-2 text-sm font-semibold text-neutral-600 hover:text-neutral-900 rounded-xl hover:bg-neutral-100 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={isSubmitting}
                className="px-5 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 active:bg-red-800 rounded-xl disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? 'Eliminando...' : 'Eliminar Vehículo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Result Modal - popup encima de todo */}
      {showResultModal && resultModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white border border-neutral-200 rounded-2xl w-full max-w-sm shadow-2xl max-h-[92vh] overflow-y-auto animate-in fade-in zoom-in-95">
            <div className="p-6 text-center space-y-4">
              <div className={`w-14 h-14 rounded-2xl mx-auto flex items-center justify-center ${
                resultModal.type === 'success'
                  ? 'bg-neutral-900 text-white'
                  : 'bg-red-50 border border-red-200 text-red-600'
              }`}>
                {resultModal.type === 'success' ? (
                  <CheckCircle2 className="w-7 h-7" />
                ) : (
                  <AlertCircle className="w-7 h-7" />
                )}
              </div>
              <div>
                <h3 className="text-lg font-bold text-neutral-900">
                  {resultModal.type === 'success' ? 'Operación Exitosa' : 'Error'}
                </h3>
                <p className="text-sm text-neutral-500 mt-1">{resultModal.message}</p>
                {resultModal.extra && (
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-neutral-600">
                    {resultModal.extra.importados !== undefined && (
                      <span className="bg-neutral-100 rounded-lg px-2 py-1 font-medium">Importados: <strong>{resultModal.extra.importados}</strong></span>
                    )}
                    {resultModal.extra.duplicados !== undefined && (
                      <span className="bg-neutral-100 rounded-lg px-2 py-1 font-medium">Duplicados: <strong>{resultModal.extra.duplicados}</strong></span>
                    )}
                    {resultModal.extra.errores !== undefined && (
                      <span className="bg-neutral-100 rounded-lg px-2 py-1 font-medium">Errores: <strong>{resultModal.extra.errores}</strong></span>
                    )}
                    {resultModal.extra.marcasProcesadas !== undefined && (
                      <span className="bg-neutral-100 rounded-lg px-2 py-1 font-medium">Marcas: <strong>{resultModal.extra.marcasProcesadas}</strong></span>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="px-6 pb-6">
              <button
                onClick={closeResultModal}
                className={`w-full py-2.5 text-sm font-semibold rounded-xl transition-colors cursor-pointer ${
                  resultModal.type === 'success'
                    ? 'bg-neutral-900 text-white hover:bg-neutral-700'
                    : 'bg-red-600 text-white hover:bg-red-700'
                }`}
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Importar CSV */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white border border-neutral-200 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-neutral-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-neutral-900 border border-neutral-900 flex items-center justify-center text-white">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-neutral-900">Importar Stock CSV o Excel</h2>
                  <p className="text-xs text-neutral-500">
                    Columnas del Excel de stock o compras: Tipo de vehículo, Marca, Marca completa, Modelo, IDV, Chasis, Color, Ubicación, Patente.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="text-neutral-400 hover:text-neutral-900 p-1 rounded-lg hover:bg-neutral-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">
                  Seleccionar archivo CSV / Excel
                </label>
                <input
                  type="file"
                  accept=".csv,.tsv,.txt,.xls,.xlsx"
                  onChange={handleFileRead}
                  className="block w-full text-sm text-neutral-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-neutral-100 file:text-neutral-900 hover:file:bg-neutral-200 cursor-pointer"
                />
                {archivoImport && (
                  <p className="text-[11px] text-neutral-500 flex items-center gap-1.5">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-neutral-900" />
                    {archivoImport}
                    {isReadingFile ? ' — leyendo…' : ' — listo para importar'}
                  </p>
                )}
                <p className="text-[11px] text-neutral-400">
                  Archivos Excel (.xls/.xlsx): se lee la primera hoja tal cual viene. También se aceptan .csv, .tsv y pegar texto.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">
                  O pegar contenido CSV directamente
                </label>
                <textarea
                  rows={6}
                  placeholder={"Tipo de vehículo\tMarca\tMarca completa\tModelo\tIDV\tChasis\tColor\tUbicación\tPatente\nVN\tHY\tHYUNDAI\tGRAND I-10 A\t157686\tMALB251CAVM746960\tPLATA\t\t"}
                  value={importCsv}
                  onChange={(e) => setImportCsv(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-xl text-xs text-neutral-900 placeholder-neutral-300 focus:outline-none focus:ring-2 focus:ring-neutral-900 font-mono whitespace-pre resize-y"
                />
              </div>

              <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl flex items-start gap-2.5 text-xs text-neutral-600">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-neutral-900" />
                <span>
                  Se procesan <strong>todas las filas</strong> con chasis de 17 caracteres. Los chasis que ya están en el
                  inventario se omiten (duplicados). Con la Ubicación vacía, el vehículo queda <strong>en viaje</strong>; se
                  acepta el código de sucursal (101) o su nombre.
                </span>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-neutral-600 hover:text-neutral-900 rounded-xl hover:bg-neutral-100 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleImportCsv}
                  disabled={!importCsv.trim() || isReadingFile || isImporting}
                  className="px-5 py-2 text-sm font-semibold text-white bg-neutral-900 hover:bg-neutral-700 active:bg-black rounded-xl disabled:opacity-50 cursor-pointer inline-flex items-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  {isImporting ? 'Importando...' : 'Importar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
