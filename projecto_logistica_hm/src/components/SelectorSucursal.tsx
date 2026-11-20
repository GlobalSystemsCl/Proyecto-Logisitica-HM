'use client';

import { useId, useRef, useState } from 'react';
import { ChevronDown, MapPin, X } from 'lucide-react';
import { codigoVisibleSucursal, filtrarSucursales, moverIndiceLista } from '@/lib/busqueda';

export interface OpcionSucursal {
  id: number;
  codigo?: string | null;
  nombre: string | null;
}

interface Props {
  sucursales: OpcionSucursal[];
  /** Nombre del campo que recibe el formulario (el id de la sucursal). */
  name: string;
  required?: boolean;
  placeholder?: string;
}

/**
 * Buscador y lista de sucursales en un solo campo: se escribe el código o el
 * nombre y los resultados aparecen justo debajo, cada uno con su código
 * destacado (los usuarios conocen su sucursal por el código, "101", "119B").
 * El formulario recibe el id en un campo oculto.
 */
export default function SelectorSucursal({
  sucursales,
  name,
  required = false,
  placeholder = 'Escribe el código o el nombre (ej. 101)',
}: Props) {
  const idLista = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLUListElement>(null);
  const valorRef = useRef<HTMLInputElement>(null);
  const [texto, setTexto] = useState('');
  const [abierta, setAbierta] = useState(false);
  const [resaltado, setResaltado] = useState(0);
  const [elegida, setElegida] = useState<OpcionSucursal | null>(null);

  const resultados = filtrarSucursales(sucursales, texto);

  function elegir(s: OpcionSucursal) {
    valorRef.current?.setCustomValidity('');
    setElegida(s);
    setTexto('');
    setAbierta(false);
  }

  function cambiar() {
    setElegida(null);
    setTexto('');
    setResaltado(0);
    setAbierta(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function mover(paso: 1 | -1) {
    setAbierta(true);
    setResaltado((i) => {
      const nuevo = moverIndiceLista(i, resultados.length, paso);
      listaRef.current?.children[nuevo]?.scrollIntoView({ block: 'nearest' });
      return nuevo;
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      mover(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      mover(-1);
    } else if (e.key === 'Enter') {
      // Enter elige la sucursal resaltada; no envía el formulario a medias.
      if (abierta && resultados[resaltado]) {
        e.preventDefault();
        elegir(resultados[resaltado]);
      }
    } else if (e.key === 'Escape') {
      setAbierta(false);
    }
  }

  return (
    <div className="relative">
      {/* Valor que recibe el formulario. Es un input real (invisible) para que
          el navegador exija elegir una sucursal antes de enviar. */}
      <input
        ref={valorRef}
        tabIndex={-1}
        aria-hidden="true"
        name={name}
        required={required}
        value={elegida ? String(elegida.id) : ''}
        onChange={() => {}}
        onInvalid={(e) => {
          e.currentTarget.setCustomValidity('Busca y elige tu sucursal.');
          setAbierta(true);
          inputRef.current?.focus();
        }}
        className="absolute bottom-0 left-1/2 h-px w-px opacity-0 pointer-events-none"
      />

      {elegida ? (
        <div className="flex items-center gap-3 w-full px-3 py-2.5 bg-white border border-neutral-300 rounded-xl shadow-sm">
          <span className="shrink-0 inline-flex items-center justify-center min-w-[3rem] px-2 py-1 rounded-lg bg-neutral-900 text-white text-sm font-bold font-mono">
            {codigoVisibleSucursal(elegida)}
          </span>
          <span className="flex-1 min-w-0 text-sm text-neutral-900 truncate">{elegida.nombre}</span>
          <button
            type="button"
            onClick={cambiar}
            className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-neutral-600 hover:text-neutral-900 px-2 py-1 rounded-lg hover:bg-neutral-100"
          >
            <X className="h-3.5 w-3.5" /> Cambiar
          </button>
        </div>
      ) : (
        <div className="relative rounded-xl shadow-sm">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-400">
            <MapPin className="h-4 w-4" />
          </div>
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={abierta}
            aria-controls={idLista}
            aria-autocomplete="list"
            aria-label="Buscar sucursal por código o nombre"
            aria-activedescendant={abierta && resultados[resaltado] ? `${idLista}-${resultados[resaltado].id}` : undefined}
            autoComplete="off"
            value={texto}
            placeholder={placeholder}
            onChange={(e) => {
              setTexto(e.target.value);
              setResaltado(0);
              setAbierta(true);
            }}
            onFocus={() => setAbierta(true)}
            onBlur={() => setAbierta(false)}
            onKeyDown={onKeyDown}
            className="block w-full pl-10 pr-9 py-2.5 bg-white border border-neutral-300 rounded-xl text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-transparent transition-all"
          />
          <button
            type="button"
            tabIndex={-1}
            aria-label="Ver sucursales"
            onMouseDown={(e) => {
              e.preventDefault();
              setAbierta((v) => !v);
              inputRef.current?.focus();
            }}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-neutral-400 hover:text-neutral-700"
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${abierta ? 'rotate-180' : ''}`} />
          </button>
        </div>
      )}

      {!elegida && abierta && (
        <ul
          ref={listaRef}
          id={idLista}
          role="listbox"
          className="absolute z-20 mt-1 w-full max-h-64 overflow-auto bg-white border border-neutral-200 rounded-xl shadow-lg py-1"
        >
          {resultados.length === 0 ? (
            <li className="px-3 py-3 text-sm text-neutral-500">Ninguna sucursal coincide con “{texto.trim()}”.</li>
          ) : (
            resultados.map((s, i) => (
              <li
                key={s.id}
                id={`${idLista}-${s.id}`}
                role="option"
                aria-selected={i === resaltado}
                // mousedown (no click) para elegir antes de que el input pierda el foco.
                onMouseDown={(e) => {
                  e.preventDefault();
                  elegir(s);
                }}
                onMouseEnter={() => setResaltado(i)}
                className={`flex items-center gap-3 px-3 py-2 cursor-pointer ${
                  i === resaltado ? 'bg-neutral-100' : ''
                }`}
              >
                <span className="shrink-0 inline-flex items-center justify-center min-w-[3rem] px-2 py-0.5 rounded-md bg-neutral-900 text-white text-xs font-bold font-mono">
                  {codigoVisibleSucursal(s)}
                </span>
                <span className="flex-1 min-w-0 text-sm text-neutral-800 truncate">{s.nombre}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
