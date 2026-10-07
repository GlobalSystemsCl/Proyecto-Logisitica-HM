/**
 * Entorno de tests aislado de producción (brecha 026, punto 6).
 *
 * Antes este archivo cargaba `.env.local`, que contiene la service_role de la
 * base de producción: un test que olvidara mockear `@/lib/supabase/admin`
 * habría escrito en datos reales. Ahora se usan siempre valores ficticios que
 * apuntan a un host inexistente, y `.env.local` no se lee.
 */
const ENV_TEST: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: 'http://supabase.test.invalid',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  SUPABASE_SECRET_KEY: 'test-secret-key',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  BREVO_API_KEY: 'test-brevo-key',
  BREVO_SENDER_EMAIL: 'no-reply@test.invalid',
  BREVO_SENDER_NAME: 'Test',
};

for (const [key, value] of Object.entries(ENV_TEST)) {
  process.env[key] = value;
}
