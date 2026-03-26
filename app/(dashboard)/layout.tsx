import { TopNav } from '@/components/nav/TopNav'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <TopNav />
      <main className="flex-1 p-6">{children}</main>
    </div>
  )
}
