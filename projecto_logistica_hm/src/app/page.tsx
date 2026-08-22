import { AuthService } from '@/services/auth.service';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function RootPage() {
  const profile = await AuthService.getCurrentUserProfile();

  if (!profile) {
    redirect('/login');
  }

  redirect('/dashboard');
}
