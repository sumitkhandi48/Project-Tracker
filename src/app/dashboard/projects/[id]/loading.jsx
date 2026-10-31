export default function ProjectDetailLoading() {
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
      <main className="flex-1 hallmark-container py-10 space-y-8">
        {/* Breadcrumb skeleton */}
        <div className="flex items-center justify-between">
          <div className="h-4 w-32 rounded bg-paper-3 animate-pulse" />
          <div className="h-4 w-28 rounded bg-paper-3 animate-pulse" />
        </div>

        {/* Project Card skeleton */}
        <div className="rounded-card border border-rule bg-paper-2 p-8 space-y-6 animate-pulse">
          <div className="space-y-3">
            <div className="h-4 w-40 rounded bg-paper-3" />
            <div className="h-8 w-96 rounded bg-paper-3" />
            <div className="h-4 w-full max-w-xl rounded bg-paper-3" />
          </div>
          <div className="space-y-2 pt-4 border-t border-rule/60">
            <div className="h-3 w-48 rounded bg-paper-3" />
            <div className="h-2 w-full rounded bg-paper-3" />
          </div>
        </div>

        {/* Tab skeleton */}
        <div className="border-b border-rule flex items-center gap-6 pb-3">
          <div className="h-5 w-24 rounded bg-paper-3 animate-pulse" />
          <div className="h-5 w-28 rounded bg-paper-3 animate-pulse" />
          <div className="h-5 w-20 rounded bg-paper-3 animate-pulse" />
        </div>

        {/* Content cards skeleton */}
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-card border border-rule bg-paper-2 p-5 h-24 animate-pulse flex items-center justify-between"
            >
              <div className="space-y-2">
                <div className="h-4 w-64 rounded bg-paper-3" />
                <div className="h-3 w-36 rounded bg-paper-3" />
              </div>
              <div className="h-7 w-20 rounded bg-paper-3" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
