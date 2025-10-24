import { Link } from 'react-router-dom';

export function HomePage(): JSX.Element {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 py-16">
      <div className="mx-auto max-w-2xl space-y-6 rounded-2xl bg-white p-8 text-center shadow">
        <h1 className="text-3xl font-semibold text-brand">Leo Pass Platform</h1>
        <p className="text-base text-slate-600">
          Bootstrap build is ready. Implement milestone features phase by phase following the engineering plan.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link
            to="/auth"
            className="rounded-md bg-brand px-4 py-2 font-medium text-white hover:bg-brand/90"
          >
            Sign in to Leo Pass
          </Link>
        </div>
      </div>
    </main>
  );
}
