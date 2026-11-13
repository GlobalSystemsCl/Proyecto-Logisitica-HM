'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * QA #4: cuando la sesión termina (venció y no se pudo renovar, o se cerró en
 * otra pestaña) lleva al login una sola vez, en vez de dejar que cada acción
 * falle por su cuenta.
 */
export default function VigilanteSesion() {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    const { data } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === 'SIGNED_OUT') router.replace('/login');
    });
    return () => data.subscription.unsubscribe();
  }, [router]);
  return null;
}
