import Link from "next/link";
import { Terminal, Plus } from "lucide-react";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Button } from "@/components/ui/button";

export function DashboardHeader({ user, active = "overview" }) {
  return (
    <header className="border-b border-rule/70 bg-paper/95 sticky top-0 z-40 backdrop-blur-sm">
      <div className="hallmark-container h-16 flex items-center justify-between">
        {/* Brand & Nav */}
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="flex items-center gap-2.5 text-sm font-semibold tracking-tight text-ink hover:text-accent transition-colors"
          >
            <div className="w-7 h-7 rounded-pill bg-paper-3 border border-rule-2 flex items-center justify-center text-accent">
              <Terminal className="w-4 h-4" />
            </div>
            <span>PROJECT.LOG</span>
          </Link>

          <nav className="flex items-center gap-1 text-xs font-mono-measured">
            <Link
              href="/dashboard"
              className={`px-3 py-1.5 rounded-pill transition-colors ${
                active === "overview"
                  ? "bg-paper-3 text-accent font-medium border border-rule"
                  : "text-ink-muted hover:text-ink hover:bg-paper-2"
              }`}
            >
              // overview
            </Link>
            <Link
              href="/dashboard/projects"
              className={`px-3 py-1.5 rounded-pill transition-colors ${
                active === "projects"
                  ? "bg-paper-3 text-accent font-medium border border-rule"
                  : "text-ink-muted hover:text-ink hover:bg-paper-2"
              }`}
            >
              // projects
            </Link>
          </nav>
        </div>

        {/* Actions & Profile */}
        <div className="flex items-center gap-3">
          {active !== "new-project" ? (
            <Link href="/dashboard/projects/new">
              <Button size="sm" variant="default" className="text-xs gap-1.5 font-medium">
                <Plus className="w-3.5 h-3.5" />
                <span>New Project</span>
              </Button>
            </Link>
          ) : null}

          <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-pill bg-paper-3 border border-rule text-xs font-mono-measured text-cool">
            <span className="w-1.5 h-1.5 rounded-full bg-cool"></span>
            <span>owner.verified</span>
          </div>

          <div className="flex items-center gap-2.5 pl-1">
            <span className="text-xs font-medium text-ink hidden lg:inline max-w-[120px] truncate">
              {user?.name || "Owner"}
            </span>
            <SignOutButton size="sm" variant="secondary" />
          </div>
        </div>
      </div>
    </header>
  );
}
