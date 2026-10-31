export default function ProjectsLoading() {
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
            <div className="h-8 w-24 rounded bg-paper-3 animate-pulse" />
            <div className="h-8 w-20 rounded bg-paper-3 animate-pulse" />
          </div>
        </div>
      </header>

      {/* Main container */}
      <main className="flex-1 hallmark-container py-10">
        {/* Title area skeleton */}
        <div className="mb-8 space-y-2">
          <div className="h-4 w-24 rounded bg-paper-3 animate-pulse" />
          <div className="h-8 w-56 rounded bg-paper-3 animate-pulse" />
          <div className="h-3 w-72 rounded bg-paper-3 animate-pulse" />
        </div>

        {/* Filter bar skeleton */}
        <div className="rounded-card border border-rule bg-paper-2 p-4 mb-8 h-20 animate-pulse" />

        {/* 6 project cards skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="rounded-card border border-rule bg-paper-2 p-5 h-64 flex flex-col justify-between animate-pulse"
            >
              <div className="space-y-3">
                <div className="flex justify-between">
                  <div className="h-3 w-16 rounded bg-paper-3" />
                  <div className="h-3 w-12 rounded bg-paper-3" />
                </div>
                <div className="h-5 w-40 rounded bg-paper-3" />
                <div className="h-3 w-28 rounded bg-paper-3" />
                <div className="h-3 w-full rounded bg-paper-3" />
              </div>
              <div className="space-y-2">
                <div className="h-2 w-full rounded bg-paper-3" />
                <div className="flex justify-between">
                  <div className="h-4 w-16 rounded bg-paper-3" />
                  <div className="h-3 w-20 rounded bg-paper-3" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
