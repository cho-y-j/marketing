import { Sidebar } from "@/components/common/sidebar";
import { MobileNav } from "@/components/common/mobile-nav";
import { TopBar } from "@/components/common/top-bar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      {/* min-w-0 필수 — flex-1 자식이 content 기반 width 가지지 않고 shrink 허용 */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6 min-w-0">{children}</main>
      </div>
      <MobileNav />
    </div>
  );
}
