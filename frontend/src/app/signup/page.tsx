import type { Metadata } from 'next';
import { SignupView } from './SignupView';

export const metadata: Metadata = {
  title: 'Créer un compte',
  description: 'Inscrivez votre centre de santé sur MediAfrica et devenez-en l’administrateur.',
  robots: { index: true, follow: true },
};

export default function SignupPage() {
  return <SignupView />;
}
