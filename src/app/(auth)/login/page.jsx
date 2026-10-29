import Link from "next/link";
import { redirect } from "next/navigation";
import { Terminal, Shield, ArrowLeft, AlertCircle } from "lucide-react";
import { checkOwnerAccess } from "@/lib/auth/session";
import { SignInButton } from "@/components/auth/sign-in-button";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Badge } from "@/components/ui/badge";

export const metadata = {
  title: "Authentication — Project Tracker",
  description: "Sign in with GitHub to access the private developer workspace.",
};

export default async function LoginPage({ searchParams }) {
  const { status, session } = await checkOwnerAccess();

  // If already authenticated and verified as the owner, navigate directly to dashboard
  if (status === "AUTHORIZED") {
    redirect("/dashboard");
  }

  const hasError = Boolean(searchParams?.error);

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col justify-between p-4 sm:p-6 lg:p-8">
      {/* Top Header Bar */}
      <header className="hallmark-container h-14 flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-mono-measured text-ink-muted hover:text-ink transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>return to public landing</span>
        </Link>

        <div className="flex items-center gap-2 text-xs font-mono-measured text-cool">
          <span className="w-1.5 h-1.5 rounded-full bg-cool"></span>
          <span>auth.gateway</span>
        </div>
      </header>

      {/* Main Authentication Card */}
      <main className="flex-1 flex items-center justify-center py-10">
        <div className="w-full max-w-md rounded-card border border-rule bg-paper-2 p-6 sm:p-8">
          <div className="flex items-center gap-2.5 mb-6">
            <div className="w-8 h-8 rounded-pill bg-paper-3 border border-rule-2 flex items-center justify-center text-accent">
              <Terminal className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-base font-medium tracking-tight text-ink">
                Developer Authentication
              </h1>
              <p className="text-xs text-ink-muted">Private workspace gateway</p>
            </div>
          </div>

          {hasError && (
            <div className="mb-5 p-3 rounded-pill bg-bad-soft border border-bad/40 flex items-start gap-2.5 text-xs text-bad">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Authentication request could not be completed. Please try again.</span>
            </div>
          )}

          {status === "UNAUTHORIZED" && session?.user ? (
            <div className="space-y-4">
              <div className="p-4 rounded-pill bg-paper-3 border border-rule/80 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-ink-muted">Signed-in account:</span>
                  <Badge variant="subtle" className="font-mono-measured">
                    {session.user.name || "Authenticated User"}
                  </Badge>
                </div>
                <p className="text-ink-muted leading-relaxed">
                  This account is authenticated via GitHub, but is not configured as the workspace owner. Access to the private dashboard is restricted.
                </p>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <SignOutButton className="w-full justify-center">
                  Sign out and switch account
                </SignOutButton>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <p className="text-xs text-ink-muted leading-relaxed">
                Sign in with your verified GitHub profile. Server-side authorization checks your stable provider ID to grant access to the personal project tracker.
              </p>

              <SignInButton className="w-full justify-center h-11" variant="default">
                Continue with GitHub
              </SignInButton>

              <div className="pt-4 border-t border-rule/60 flex items-center gap-2 text-[11px] text-ink-muted font-mono-measured">
                <Shield className="w-3.5 h-3.5 text-cool shrink-0" />
                <span>Single-owner access control enforced server-side</span>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="hallmark-container py-4 text-center text-xs font-mono-measured text-ink-muted">
        <span>PROJECT TRACKER // AUTH SUBSYSTEM</span>
      </footer>
    </div>
  );
}
