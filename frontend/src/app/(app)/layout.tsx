import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { PageTransition } from "@/components/page-transition";
import { AuthGuard } from "@/components/auth-guard";
import { RouteProgress } from "@/components/route-progress";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <RouteProgress />
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <Topbar />
          <main className="flex-1 p-4 lg:p-6 min-w-0">
            <PageTransition>{children}</PageTransition>
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}
