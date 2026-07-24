import type { Metadata } from 'next';
import { VerifyEmailView } from './VerifyEmailView';

export const metadata: Metadata = {
  title: 'Vérifier votre email',
  description: 'Confirmez votre adresse email pour activer votre compte MediAfrica.',
};

export default function VerifyEmailPage() {
  return <VerifyEmailView />;
}
