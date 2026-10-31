import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Lock } from "lucide-react";
import { checkOwnerAccess } from "@/lib/auth/session";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Badge } from "@/components/ui/badge";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { ProjectCreateForm } from "@/components/projects/project-create-form";

export const metadata = {
  title: "New Project — Project Tracker",
  description: "Initialize and configure a new project repository in your private developer workspace.",
};

export default async function NewProjectPage() {
  const { status, session } = await checkOwnerAccess();

  // 1. Unauthenticated visitor: redirect to login
  if (status === "UNAUTHENTICATED") {
    redirect("/login?callbackUrl=/dashboard/projects/new");
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
                . Project creation is strictly restricted to the verified repository owner.
              </p>

              <div className="flex flex-col gap-2 pt-2">
                <SignOutButton className="w-full justify-center" variant="secondary">
                  Disconnect session
                </SignOutButton>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col">
      <DashboardHeader user={session.user} active="new-project" />

      <main className="flex-1 hallmark-container py-10 max-w-4xl w-full">
        <ProjectCreateForm />
      </main>

      <footer className="border-t border-rule bg-paper-3 py-6 mt-12">
        <div className="hallmark-container flex items-center justify-between text-xs font-mono-measured text-ink-muted">
          <span>PROJECT TRACKER // PRIVATE CONSOLE</span>
          <span>authenticated session</span>
        </div>
      </footer>
    </div>
  );
}
