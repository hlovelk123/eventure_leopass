export function HomePage(): JSX.Element {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 py-16">
      <div className="mx-auto max-w-2xl rounded-2xl bg-white p-8 text-center shadow">
        <h1 className="text-3xl font-semibold text-brand">Leo Pass Platform</h1>
        <p className="mt-4 text-base text-slate-600">
          Bootstrap build is ready. Implement milestone features phase by phase following the engineering plan.
        </p>
      </div>
    </main>
  );
}
