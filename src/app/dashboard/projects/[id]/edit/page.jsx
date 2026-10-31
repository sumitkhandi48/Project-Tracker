import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Lock, Layers } from "lucide-react";
import { checkOwnerAccess } from "@/lib/auth/session";
import { getVerifiedOwnerId } from "@/lib/api/owner-resolver";
import { getProjectDetails } from "@/lib/api/project-service";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProjectForm } from "@/components/projects/project-create-form";

export async function generateMetadata({ params }) {
  const resolvedParams = await params;
  return {
    title: "Edit Project — Project Tracker",
    description: "Update project properties, status, priorities, and repository links.",
  };
}

export default async function EditProjectPage({ params }) {
  const resolvedParams = await params;
  const projectId = resolvedParams?.id;

  const { status: authStatus, session } = await checkOwnerAccess();

  // 1. Unauthenticated visitor: redirect to login
  if (authStatus === "UNAUTHENTICATED") {
    redirect(`/login?callbackUrl=/dashboard/projects/${projectId || ""}/edit`);
  }

  // 2. Authenticated non-owner: render 403 screen
  if (authStatus === "UNAUTHORIZED") {
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
            <div className="flex items-center gap-2.5 mb-4 text-bad">
              <Lock className="w-5 h-5" />
              <h1 className="text-base font-medium text-ink">Access Restricted</h1>
            </div>
            <p className="text-xs text-ink-muted leading-relaxed">
              This repository tracking catalog is private to the verified workspace owner.
            </p>
          </div>
        </main>
      </div>
    );
  }

  // 3. Resolve verified owner ID and fetch project details
  let details = null;
  let fetchError = null;

  try {
    const ownerId = await getVerifiedOwnerId(session);
    details = await getProjectDetails({ projectId, ownerId });
  } catch (err) {
    console.error("Project edit data load error:", err.message);
    fetchError = "Unable to retrieve project details from database.";
  }

  // 4. If project not found or invalid format: render not-found state
  if (!details || !details.project) {
    return (
      <div className="min-h-screen bg-paper text-ink flex flex-col">
        <DashboardHeader user={session?.user} active="projects" />

        <main className="flex-1 hallmark-container py-16 flex items-center justify-center">
          <div className="w-full max-w-md rounded-card border border-rule bg-paper-2 p-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-pill bg-paper-3 border border-rule mx-auto flex items-center justify-center text-ink-muted">
              <Layers className="w-6 h-6 text-ink-muted" />
            </div>
            <div className="space-y-1">
              <h1 className="text-base font-medium text-ink">Project Not Found</h1>
              <p className="text-xs text-ink-muted leading-relaxed">
                The requested project does not exist, has been removed, or is not accessible in your workspace.
              </p>
            </div>
            <div className="pt-2">
              <Link href="/dashboard/projects">
                <Button variant="secondary" size="sm" className="text-xs gap-1.5">
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Return to Projects List</span>
                </Button>
              </Link>
            </div>
          </div>
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

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col">
      <DashboardHeader user={session.user} active="projects" />

      <main className="flex-1 hallmark-container py-10 max-w-4xl w-full">
        <ProjectForm
          mode="edit"
          initialData={details.project}
          projectId={projectId}
        />
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
