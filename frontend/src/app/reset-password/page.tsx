import type { Metadata } from 'next';
import { ResetPasswordView } from './ResetPasswordView';

export const metadata: Metadata = {
  title: 'Réinitialiser le mot de passe',
  description: 'Choisissez un nouveau mot de passe pour votre compte MediAfrica.',
};

export default function ResetPasswordPage() {
  return <ResetPasswordView />;
}
