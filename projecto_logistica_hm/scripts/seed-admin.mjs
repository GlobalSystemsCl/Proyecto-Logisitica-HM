import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * Crea o restablece la cuenta del administrador principal.
 *
 * Brecha 007: el script ya no contiene credenciales. Variables requeridas
 * (en el entorno o en .env.local):
 *   SEED_ADMIN_EMAIL     correo del administrador principal
 *   SEED_ADMIN_PASSWORD  opcional; si falta se genera una aleatoria de 24 caracteres
 *
 * La contraseña solo se imprime con el flag explícito --mostrar-clave. La
 * cuenta queda con requiere_cambio_clave = true: en el primer ingreso se
 * fuerza a definir una contraseña propia.
 *
 * Uso: node scripts/seed-admin.mjs [--mostrar-clave]
 */

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  envConfig.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...values] = trimmed.split('=');
      if (key && values.length > 0 && process.env[key.trim()] === undefined) {
        process.env[key.trim()] = values.join('=').trim();
      }
    }
  });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
const mostrarClave = process.argv.includes('--mostrar-clave');

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Error: faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

if (!email) {
  console.error('Error: define SEED_ADMIN_EMAIL con el correo del administrador principal.');
  process.exit(1);
}

const password = process.env.SEED_ADMIN_PASSWORD || randomBytes(18).toString('base64url');

if (password.length < 12) {
  console.error('Error: SEED_ADMIN_PASSWORD debe tener al menos 12 caracteres.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function buscarUsuarioAuth(correo) {
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`No se pudo listar usuarios: ${error.message}`);
    const encontrado = data.users.find((u) => u.email?.toLowerCase() === correo);
    if (encontrado) return encontrado;
    if (data.users.length < 1000) return null;
  }
}

async function seedAdmin() {
  const nombre = process.env.SEED_ADMIN_NOMBRE || 'Administrador';
  const apellido = process.env.SEED_ADMIN_APELLIDO || 'Principal';

  console.log(`Verificando o creando el administrador principal (${email})...`);

  const existente = await buscarUsuarioAuth(email);
  let authUserId;

  if (existente) {
    authUserId = existente.id;
    const { error } = await supabase.auth.admin.updateUserById(authUserId, {
      password,
      email_confirm: true,
    });
    if (error) {
      console.error('Error al actualizar la contraseña en Auth:', error.message);
      process.exit(1);
    }
    console.log('Contraseña restablecida en Auth.');
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre, apellido },
    });
    if (error) {
      console.error('Error al crear el usuario en Auth:', error.message);
      process.exit(1);
    }
    authUserId = data.user.id;
    console.log(`Usuario creado en Auth (${authUserId}).`);
  }

  const { error: dbError } = await supabase.from('usuario').upsert({
    id: authUserId,
    email,
    nombre,
    apellido,
    rol: 'administrador',
    activo: true,
    aprobado: true,
    requiere_cambio_clave: true,
    intentos_fallidos: 0,
    bloqueado_hasta: null,
  });

  if (dbError) {
    console.error('Error al guardar el perfil en public.usuario:', dbError.message);
    process.exit(1);
  }

  console.log('Perfil sincronizado. La cuenta deberá cambiar la contraseña en el primer ingreso.');
  if (mostrarClave) {
    console.log(`Contraseña temporal: ${password}`);
  } else if (!process.env.SEED_ADMIN_PASSWORD) {
    console.log('Se generó una contraseña aleatoria que no se muestra. Usa --mostrar-clave para verla,');
    console.log('o "Olvidé mi contraseña" en /recuperar-clave para definir una nueva.');
  }
}

seedAdmin().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
