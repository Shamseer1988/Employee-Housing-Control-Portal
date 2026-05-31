import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { PageTransition } from "@/components/page-transition";
import { AuthGuard } from "@/components/auth-guard";
import { RouteProgress } from "@/components/route-progress";
import { ErrorBoundary } from "@/components/error-boundary";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <RouteProgress />
      <div
        className="flex h-[100dvh] overflow-hidden"
        style={{
          paddingLeft: "env(safe-area-inset-left)",
          paddingRight: "env(safe-area-inset-right)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <Sidebar />
        <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
          <Topbar />
          <main className="flex-1 p-3 sm:p-4 lg:p-6 min-w-0 overflow-y-auto overflow-x-hidden">
            <ErrorBoundary fallbackTitle="This page crashed — here's what happened.">
              <PageTransition>{children}</PageTransition>
            </ErrorBoundary>
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}
