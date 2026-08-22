import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Cargar variables desde .env.local manualmente
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  envConfig.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...values] = trimmed.split('=');
      if (key && values.length > 0) {
        process.env[key.trim()] = values.join('=').trim();
      }
    }
  });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Error: Faltan las variables NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function seedAdmin() {
  const email = 'maic.hernandez.dev@gmail.com';
  const password = 'admin1234';
  const nombre = 'Maic';
  const apellido = 'Hernández';

  console.log(`⏳ Verificando/Creando usuario administrador: ${email}...`);

  // 1. Verificar si ya existe en auth.users
  const { data: userList, error: listError } = await supabase.auth.admin.listUsers();
  
  let authUserId = null;
  const existingUser = userList?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());

  if (existingUser) {
    console.log(`ℹ️ El usuario ya existe en auth.users (ID: ${existingUser.id}). Actualizando contraseña...`);
    authUserId = existingUser.id;

    const { error: updateError } = await supabase.auth.admin.updateUserById(authUserId, {
      password: password,
      email_confirm: true,
      user_metadata: {
        nombre,
        apellido,
        rol: 'administrador',
      },
    });

    if (updateError) {
      console.error('❌ Error al actualizar contraseña en auth:', updateError.message);
    } else {
      console.log('✅ Contraseña y metadatos actualizados en auth.');
    }
  } else {
    // Crear usuario nuevo en Auth
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        nombre,
        apellido,
        rol: 'administrador',
      },
    });

    if (createError) {
      console.error('❌ Error al crear usuario en auth:', createError.message);
      process.exit(1);
    }

    authUserId = created.user.id;
    console.log(`✅ Usuario creado en Supabase Auth con ID: ${authUserId}`);
  }

  // 2. Insertar/Actualizar en public.usuario
  const { data: profile, error: dbError } = await supabase
    .from('usuario')
    .upsert({
      id: authUserId,
      email: email.toLowerCase(),
      nombre,
      apellido,
      rol: 'administrador',
      activo: true,
      requiere_cambio_clave: false,
      intentos_fallidos: 0,
      bloqueado_hasta: null,
    })
    .select()
    .single();

  if (dbError) {
    console.error('❌ Error al guardar en public.usuario:', dbError.message);
  } else {
    console.log('✅ Perfil en public.usuario sincronizado con éxito:', profile);
  }

  console.log('\n🎉 ¡PROCESO COMPLETADO CON ÉXITO!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📧 Correo:     ${email}`);
  console.log(`🔑 Contraseña: ${password}`);
  console.log(`🛡️ Rol:        administrador`);
  console.log(`🟢 Estado:     activo`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Ya puedes ingresar en: http://localhost:3000/login');
}

seedAdmin().catch(console.error);
