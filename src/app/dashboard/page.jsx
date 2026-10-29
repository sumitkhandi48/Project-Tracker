import Link from "next/link";
import { redirect } from "next/navigation";
import { Terminal, Shield, ArrowLeft, LogOut, CheckCircle2, Lock, GitBranch } from "lucide-react";
import { checkOwnerAccess } from "@/lib/auth/session";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Dashboard — Project Tracker",
  description: "Private developer workspace and project tracking command center.",
};

export default async function DashboardPage() {
  const { status, session } = await checkOwnerAccess();

  // 1. Unauthenticated visitor: redirect to login
  if (status === "UNAUTHENTICATED") {
    redirect("/login?callbackUrl=/dashboard");
  }

  // 2. Authenticated non-owner: render 403 Forbidden access denial screen
  if (status === "UNAUTHORIZED") {
    return (
      <div className="min-h-screen bg-paper text-ink flex flex-col justify-between p-4 sm:p-6 lg:p-8">
        <header className="hallmark-container h-14 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-mono-measured text-ink-muted hover:text-ink transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>return to public landing</span>
          </Link>
          <Badge variant="bad" className="font-mono-measured">
            403 · restricted
          </Badge>
        </header>

        <main className="flex-1 flex items-center justify-center py-10">
          <div className="w-full max-w-md rounded-card border border-rule bg-paper-2 p-6 sm:p-8">
            <div className="flex items-center gap-2.5 mb-6">
              <div className="w-8 h-8 rounded-pill bg-paper-3 border border-bad/50 flex items-center justify-center text-bad">
                <Lock className="w-4 h-4" />
              </div>
              <div>
                <h1 className="text-base font-medium tracking-tight text-ink">
                  Access Restricted
                </h1>
                <p className="text-xs text-ink-muted">Personal developer workspace</p>
              </div>
            </div>

            <div className="space-y-4 text-xs text-ink-muted leading-relaxed">
              <p>
                You are authenticated as{" "}
                <span className="text-ink font-medium font-mono-measured">
                  {session?.user?.name || "GitHub User"}
                </span>
                . However, this private workspace is strictly restricted to the configured repository owner.
              </p>

              <div className="p-3 rounded-pill bg-paper-3 border border-rule/70 text-[11px] font-mono-measured text-ink-muted">
                <span>security.boundary: single-tenant-lock</span>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <SignOutButton className="w-full justify-center" variant="secondary">
                  Disconnect session
                </SignOutButton>
              </div>
            </div>
          </div>
        </main>

        <footer className="hallmark-container py-4 text-center text-xs font-mono-measured text-ink-muted">
          <span>PROJECT TRACKER // ACCESS GATEWAY</span>
        </footer>
      </div>
    );
  }

  // 3. Authenticated owner: render private dashboard shell
  const user = session.user;

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col">
      {/* Navigation Bar */}
      <header className="border-b border-rule/70 bg-paper/95 sticky top-0 z-40 backdrop-blur-sm">
        <div className="hallmark-container h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-2.5 text-sm font-semibold tracking-tight text-ink hover:text-accent transition-colors"
            >
              <div className="w-7 h-7 rounded-pill bg-paper-3 border border-rule-2 flex items-center justify-center text-accent">
                <Terminal className="w-4 h-4" />
              </div>
              <span>PROJECT.LOG</span>
            </Link>
            <span className="text-xs font-mono-measured text-ink-muted hidden sm:inline">
              // dashboard
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-pill bg-paper-3 border border-rule text-xs font-mono-measured text-cool">
              <span className="w-1.5 h-1.5 rounded-full bg-cool"></span>
              <span>owner.verified</span>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-ink hidden md:inline">
                {user.name || "Owner"}
              </span>
              <SignOutButton size="sm" variant="secondary" />
            </div>
          </div>
        </div>
      </header>

      {/* Main Dashboard Container */}
      <main className="flex-1 hallmark-container py-10">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="amber" className="font-mono-measured text-[11px]">
                phase 3 · active
              </Badge>
              <span className="text-xs text-ink-muted font-mono-measured">
                session: secure-jwt
              </span>
            </div>
            <h1 className="text-3xl font-medium tracking-tight text-ink">
              Workspace Overview
            </h1>
            <p className="text-xs text-ink-muted mt-1">
              Authorized personal management environment for active repositories and milestones.
            </p>
          </div>
        </div>

        {/* Verification Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
          <div className="rounded-card border border-rule bg-paper-2 p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-mono-measured text-cool">security.status</span>
              <CheckCircle2 className="w-4 h-4 text-ok" />
            </div>
            <h2 className="text-base font-medium text-ink mb-1">Owner Verified</h2>
            <p className="text-xs text-ink-muted leading-relaxed">
              GitHub provider identity server-verified against configured owner ID. Full administrative access active.
            </p>
          </div>

          <div className="rounded-card border border-rule bg-paper-2 p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-mono-measured text-cool">database.status</span>
              <CheckCircle2 className="w-4 h-4 text-ok" />
            </div>
            <h2 className="text-base font-medium text-ink mb-1">Local MongoDB Ready</h2>
            <p className="text-xs text-ink-muted leading-relaxed">
              Mongoose schemas active for Users, Projects, Tasks, Milestones, and Activity. Connection pool operational.
            </p>
          </div>

          <div className="rounded-card border border-rule bg-paper-2 p-5 sm:col-span-2 lg:col-span-1">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-mono-measured text-cool">roadmap.next</span>
              <GitBranch className="w-4 h-4 text-accent" />
            </div>
            <h2 className="text-base font-medium text-ink mb-1">Phase 4 Upcoming</h2>
            <p className="text-xs text-ink-muted leading-relaxed">
              Project & Task CRUD Route Handlers and interactive management boards will mount into this container.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-rule bg-paper-3 py-6">
        <div className="hallmark-container flex items-center justify-between text-xs font-mono-measured text-ink-muted">
          <span>PROJECT TRACKER // PRIVATE CONSOLE</span>
          <span>authenticated session</span>
        </div>
      </footer>
    </div>
  );
}
