'use client';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 px-4">
      <h1 className="text-2xl font-bold">Une erreur est survenue</h1>
      <p className="text-center text-gray-600">
        Quelque chose s’est mal passé. Réessayez, ou contactez le support si le problème persiste.
      </p>
      {process.env.NODE_ENV !== 'production' && (
        <p className="text-center text-xs text-gray-400">{error.message}</p>
      )}
      <button
        type="button"
        onClick={reset}
        className="rounded-md bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
      >
        Réessayer
      </button>
    </main>
  );
}
