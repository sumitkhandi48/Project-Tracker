export default function DashboardLoading() {
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
      <main className="flex-1 hallmark-container py-10">
        {/* Title area skeleton */}
        <div className="mb-8 space-y-2">
          <div className="h-4 w-28 rounded bg-paper-3 animate-pulse" />
          <div className="h-8 w-64 rounded bg-paper-3 animate-pulse" />
          <div className="h-3 w-80 rounded bg-paper-3 animate-pulse" />
        </div>

        {/* 4 Metric cards skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="rounded-card border border-rule bg-paper-2 p-5 h-28 flex flex-col justify-between animate-pulse"
            >
              <div className="flex justify-between items-center">
                <div className="h-3 w-20 rounded bg-paper-3" />
                <div className="w-4 h-4 rounded bg-paper-3" />
              </div>
              <div className="h-7 w-16 rounded bg-paper-3" />
              <div className="h-3 w-28 rounded bg-paper-3" />
            </div>
          ))}
        </div>

        {/* Two-column layout skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-card border border-rule bg-paper-2 p-6 h-64 animate-pulse" />
            <div className="rounded-card border border-rule bg-paper-2 p-6 h-48 animate-pulse" />
          </div>
          <div className="space-y-6">
            <div className="rounded-card border border-rule bg-paper-2 p-6 h-80 animate-pulse" />
          </div>
        </div>
      </main>
    </div>
  );
}
