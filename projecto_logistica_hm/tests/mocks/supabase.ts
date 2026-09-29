import { vi } from 'vitest';

export interface MockError {
  message: string;
  code?: string;
}

export interface MockResult {
  data: unknown;
  error: MockError | null;
  /** Presente solo en consultas de conteo (`select({ head: true, count: 'exact' })`). */
  count?: number;
}

/** Resultados encolados por tabla. Cada `await` encadenado consume el siguiente. */
export type ResultsByTable = Record<string, MockResult[]>;

export interface SupabaseMock {
  from: ReturnType<typeof vi.fn>;
  rpc: ReturnType<typeof vi.fn>;
  auth: { admin: Record<string, ReturnType<typeof vi.fn>> };
  storage: { from: ReturnType<typeof vi.fn> };
  /** Llamadas registradas con argumentos crudos: `['vehiculo', 'insert', { chasis: '...' }]` */
  calls: Array<[string, string, ...unknown[]]>;
  results: ResultsByTable;
  callsTo(table: string): Array<[string, ...unknown[]]>;
  reset(): void;
}

const CHAIN_METHODS = [
  'select',
  'insert',
  'update',
  'upsert',
  'delete',
  'eq',
  'neq',
  'in',
  'not',
  'or',
  'ilike',
  'is',
  'like',
  'ilikeAny',
  'gte',
  'lte',
  'gt',
  'lt',
  'limit',
  'order',
  'range',
  'match',
  'contains',
  'single',
  'maybeSingle',
];

const STORAGE_METHODS = ['upload', 'remove', 'createSignedUrl', 'list', 'getPublicUrl'];

const OK: MockResult = { data: null, error: null };

export function createSupabaseMock(results: ResultsByTable = {}): SupabaseMock {
  const calls: Array<[string, string, ...unknown[]]> = [];
  const taken: Record<string, number> = {};

  function makeChain(table: string) {
    const chain: Record<string, unknown> = {};

    for (const method of CHAIN_METHODS) {
      chain[method] = (...args: unknown[]) => {
        calls.push([table, method, ...args] as [string, string, ...unknown[]]);
        return chain;
      };
    }

    chain.then = (onFulfilled?: (v: MockResult) => unknown, onRejected?: (e: unknown) => unknown) => {
      const index = taken[table] ?? 0;
      const queue = results[table] ?? [];
      const result = queue[index] ?? OK;
      taken[table] = index + 1;
      return Promise.resolve(result).then(onFulfilled, onRejected);
    };

    return chain;
  }

  function makeStorageChain(bucket: string) {
    const chain: Record<string, unknown> = {};

    for (const method of STORAGE_METHODS) {
      chain[method] = (...args: unknown[]) => {
        calls.push([bucket, method, ...args] as [string, string, ...unknown[]]);
        return chain;
      };
    }

    chain.then = (onFulfilled?: (v: MockResult) => unknown, onRejected?: (e: unknown) => unknown) => {
      const index = taken[bucket] ?? 0;
      const queue = results[bucket] ?? [];
      const result = queue[index] ?? OK;
      taken[bucket] = index + 1;
      return Promise.resolve(result).then(onFulfilled, onRejected);
    };

    return chain;
  }

  const mock: SupabaseMock = {
    from: vi.fn((table: string) => makeChain(table)),
    rpc: vi.fn(async () => OK),
    auth: {
      admin: {
        createUser: vi.fn(async () => ({ data: {}, error: null })),
        updateUserById: vi.fn(async () => ({ data: {}, error: null })),
        deleteUser: vi.fn(async () => ({ data: {}, error: null })),
      },
    },
    storage: { from: vi.fn((bucket: string) => makeStorageChain(bucket)) },
    calls,
    results,
    callsTo(table: string) {
      return calls.filter((c) => c[0] === table).map((c) => c.slice(1) as [string, ...unknown[]]);
    },
    reset() {
      calls.length = 0;
      for (const key of Object.keys(taken)) delete taken[key];
      for (const key of Object.keys(results)) delete results[key];
    },
  };

  return mock;
}

/** Construye el resultado de un `insert`/`update` que devuelve la fila affected. */
export function fila<T>(row: T): MockResult {
  return { data: row, error: null };
}

/** Construye el resultado de un `select({ count: 'exact', head: true })`. */
export function filaConCount(count: number, data: unknown = null): MockResult {
  return { data, count, error: null };
}
