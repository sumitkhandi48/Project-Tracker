export default function ProjectEditLoading() {
  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col">
      {/* Header skeleton */}
      <header className="border-b border-rule/70 bg-paper/95 h-16 flex items-center">
        <div className="hallmark-container w-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-pill bg-paper-3 animate-pulse" />
            <div className="h-4 w-24 rounded bg-paper-3 animate-pulse" />
          </div>
          <div className="flex items-center gap-3">
            <div className="h-6 w-28 rounded-pill bg-paper-3 animate-pulse" />
            <div className="h-8 w-20 rounded bg-paper-3 animate-pulse" />
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 hallmark-container py-10 max-w-4xl w-full space-y-8">
        {/* Top Header skeleton */}
        <div className="flex items-center justify-between pb-6 border-b border-rule/60">
          <div className="space-y-2">
            <div className="h-3 w-32 rounded bg-paper-3 animate-pulse" />
            <div className="h-7 w-64 rounded bg-paper-3 animate-pulse" />
            <div className="h-3 w-80 rounded bg-paper-3 animate-pulse" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-16 rounded bg-paper-3 animate-pulse" />
            <div className="h-8 w-28 rounded bg-paper-3 animate-pulse" />
          </div>
        </div>

        {/* Section skeletons */}
        <div className="rounded-card border border-rule bg-paper-2 p-6 h-64 animate-pulse" />
        <div className="rounded-card border border-rule bg-paper-2 p-6 h-48 animate-pulse" />
        <div className="rounded-card border border-rule bg-paper-2 p-6 h-48 animate-pulse" />
      </main>
    </div>
  );
}
