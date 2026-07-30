import type { Metadata } from 'next';
import { ForgotPasswordView } from './ForgotPasswordView';

export const metadata: Metadata = {
  title: 'Mot de passe oublié',
  description: 'Réinitialisez le mot de passe de votre compte MediAfrica.',
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordView />;
}
