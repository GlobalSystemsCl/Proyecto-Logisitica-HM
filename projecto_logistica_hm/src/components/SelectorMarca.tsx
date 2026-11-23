'use client';

import { useId, useRef, useState } from 'react';
import { ChevronDown, Loader2, Plus, Tag, X } from 'lucide-react';
import { moverIndiceLista } from '@/lib/busqueda';
import {
  existeMarca,
  filtrarMarcas,
  propuestaMarcaNueva,
  validarMarcaNueva,
  type MarcaCatalogo,
} from '@/lib/marcasVehiculo';

interface Props {
  marcas: MarcaCatalogo[];
  /** Marca elegida (nombre vacío = ninguna). */
  valor: { codigo: string; nombre: string };
  onChange: (marca: { codigo: string; nombre: string }) => void;
  /** Crea la marca en el catálogo; devuelve la creada o el error. */
  onCrear: (marca: MarcaCatalogo) => Promise<{ marca?: MarcaCatalogo; error?: string }>;
  error?: string;
}

/**
 * Marca del vehículo: se busca por código o nombre en el catálogo y, si no
 * está, se crea ahí mismo (código + nombre).
 */
export default function SelectorMarca({ marcas, valor, onChange, onCrear, error }: Props) {
  const idLista = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [texto, setTexto] = useState('');
  const [abierta, setAbierta] = useState(false);
  const [resaltado, setResaltado] = useState(0);
  const [nueva, setNueva] = useState<MarcaCatalogo | null>(null);
  const [errorNueva, setErrorNueva] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);

  const resultados = filtrarMarcas(marcas, texto);
  const ofrecerCrear = texto.trim() !== '' && !existeMarca(marcas, texto);
  const total = resultados.length + (ofrecerCrear ? 1 : 0);

  function elegir(m: MarcaCatalogo) {
    onChange({ codigo: m.codigo, nombre: m.nombre });
    setTexto('');
    setAbierta(false);
  }

  function empezarCrear() {
    setNueva(propuestaMarcaNueva(texto));
    setErrorNueva(null);
    setAbierta(false);
  }

  async function crear() {
    if (!nueva) return;
    const err = validarMarcaNueva(nueva);
    if (err) {
      setErrorNueva(err);
      return;
    }
    setCreando(true);
    try {
      const res = await onCrear({ codigo: nueva.codigo.trim().toUpperCase(), nombre: nueva.nombre.trim() });
      if (res.error || !res.marca) {
        setErrorNueva(res.error ?? 'No se pudo crear la marca.');
        return;
      }
      elegir(res.marca);
      setNueva(null);
    } finally {
      setCreando(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setAbierta(true);
      setResaltado((i) => moverIndiceLista(i, total, e.key === 'ArrowDown' ? 1 : -1));
    } else if (e.key === 'Enter') {
      if (!abierta) return;
      e.preventDefault();
      if (resultados[resaltado]) elegir(resultados[resaltado]);
      else if (ofrecerCrear && resaltado === resultados.length) empezarCrear();
    } else if (e.key === 'Escape') {
      setAbierta(false);
    }
  }

  const claseBorde = error ? 'border-red-400 focus:ring-red-400' : 'border-neutral-300 focus:ring-neutral-900';

  if (nueva) {
    return (
      <div className="p-3 border border-neutral-300 rounded-xl bg-neutral-50 space-y-2">
        <p className="text-xs font-semibold text-neutral-700">Nueva marca</p>
        <div className="grid grid-cols-3 gap-2">
          <input
            type="text"
            value={nueva.codigo}
            onChange={(e) => setNueva({ ...nueva, codigo: e.target.value.toUpperCase() })}
            placeholder="Código (HY)"
            aria-label="Código de la marca nueva"
            maxLength={10}
            className="col-span-1 px-3 py-2 bg-white border border-neutral-300 rounded-xl text-sm font-mono text-neutral-900 placeholder-neutral-300 focus:outline-none focus:ring-2 focus:ring-neutral-900"
          />
          <input
            type="text"
            value={nueva.nombre}
            onChange={(e) => setNueva({ ...nueva, nombre: e.target.value.toUpperCase() })}
            placeholder="Nombre (HYUNDAI)"
            aria-label="Nombre de la marca nueva"
            maxLength={60}
            className="col-span-2 px-3 py-2 bg-white border border-neutral-300 rounded-xl text-sm text-neutral-900 placeholder-neutral-300 focus:outline-none focus:ring-2 focus:ring-neutral-900"
          />
        </div>
        {errorNueva && <p className="text-[11px] text-red-600">{errorNueva}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setNueva(null)}
            disabled={creando}
            className="px-3 py-1.5 text-xs font-semibold text-neutral-600 hover:text-neutral-900 rounded-lg hover:bg-neutral-100 cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void crear()}
            disabled={creando}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-700 rounded-lg cursor-pointer disabled:opacity-50"
          >
            {creando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Crear marca
          </button>
        </div>
      </div>
    );
  }

  if (valor.nombre) {
    return (
      <div className={`flex items-center gap-2 w-full px-3 py-2 bg-white border rounded-xl ${claseBorde}`}>
        {valor.codigo && (
          <span className="shrink-0 px-2 py-0.5 rounded-md bg-neutral-900 text-white text-xs font-bold font-mono">{valor.codigo}</span>
        )}
        <span className="flex-1 min-w-0 text-sm text-neutral-900 truncate">{valor.nombre}</span>
        <button
          type="button"
          onClick={() => {
            onChange({ codigo: '', nombre: '' });
            setAbierta(true);
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
          className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-neutral-600 hover:text-neutral-900 px-2 py-0.5 rounded-lg hover:bg-neutral-100 cursor-pointer"
        >
          <X className="h-3.5 w-3.5" /> Cambiar
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={abierta}
          aria-controls={idLista}
          aria-autocomplete="list"
          aria-label="Buscar marca por código o nombre"
          autoComplete="off"
          value={texto}
          placeholder="Busca la marca: HY, TOYOTA..."
          onChange={(e) => {
            setTexto(e.target.value);
            setResaltado(0);
            setAbierta(true);
          }}
          onFocus={() => setAbierta(true)}
          onBlur={() => setAbierta(false)}
          onKeyDown={onKeyDown}
          className={`w-full pl-9 pr-8 py-2 bg-white border rounded-xl text-sm text-neutral-900 placeholder-neutral-300 focus:outline-none focus:ring-2 ${claseBorde}`}
        />
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
      </div>
      {abierta && (
        <ul
          id={idLista}
          role="listbox"
          className="absolute z-30 mt-1 w-full max-h-56 overflow-auto bg-white border border-neutral-200 rounded-xl shadow-lg py-1"
        >
          {resultados.map((m, i) => (
            <li
              key={`${m.codigo}-${m.nombre}`}
              role="option"
              aria-selected={i === resaltado}
              onMouseDown={(e) => {
                e.preventDefault();
                elegir(m);
              }}
              onMouseEnter={() => setResaltado(i)}
              className={`flex items-center gap-2 px-3 py-2 cursor-pointer ${i === resaltado ? 'bg-neutral-100' : ''}`}
            >
              <span className="shrink-0 min-w-[2.5rem] text-center px-1.5 py-0.5 rounded-md bg-neutral-900 text-white text-[11px] font-bold font-mono">
                {m.codigo}
              </span>
              <span className="text-sm text-neutral-800 truncate">{m.nombre}</span>
            </li>
          ))}
          {ofrecerCrear && (
            <li
              role="option"
              aria-selected={resaltado === resultados.length}
              onMouseDown={(e) => {
                e.preventDefault();
                empezarCrear();
              }}
              onMouseEnter={() => setResaltado(resultados.length)}
              className={`flex items-center gap-2 px-3 py-2 cursor-pointer text-sm font-semibold text-neutral-900 border-t border-neutral-100 ${
                resaltado === resultados.length ? 'bg-neutral-100' : ''
              }`}
            >
              <Plus className="w-4 h-4" /> Crear marca “{texto.trim().toUpperCase()}”
            </li>
          )}
          {resultados.length === 0 && !ofrecerCrear && (
            <li className="px-3 py-2 text-sm text-neutral-500">No hay marcas en el catálogo.</li>
          )}
        </ul>
      )}
    </div>
  );
}
