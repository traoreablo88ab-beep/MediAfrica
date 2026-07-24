import type { Metadata } from 'next';
import { LoginView } from './LoginView';

export const metadata: Metadata = {
  title: 'Connexion',
  description: 'Connectez-vous à l’espace de votre centre de santé sur MediAfrica.',
  robots: { index: true, follow: true },
};

export default function LoginPage() {
  return <LoginView />;
}
