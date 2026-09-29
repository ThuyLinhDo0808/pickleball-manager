'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Bell, 
  CalendarDays, 
  ChevronDown, 
  Grid2X2, 
  Menu, 
  MoreHorizontal, 
  Search, 
  Settings, 
  ShieldCheck, 
  Trophy, 
  Users, 
  WalletCards, 
  X 
} from 'lucide-react';
import { I18nProvider } from '@/lib/i18n'; 

const navItems = [
  { label: 'Tổng quan', href: '/dashboard', icon: Grid2X2 },
  { label: 'Lịch chơi & Kèo', href: '/events', icon: CalendarDays },
  { label: 'Thành viên', href: '/clubs', icon: Users },
  { label: 'Giải đấu', href: '/matches', icon: Trophy },
  { label: 'Tài chính', href: '/finance', icon: WalletCards },
  { label: 'Báo cáo', href: '/reports', icon: Grid2X2 },
];

export default function HostLayout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [workspace, setWorkspace] = useState('Club Manager');
  const pathname = usePathname();

  return (
    <I18nProvider> {/* Bọc I18nProvider ở ngoài cùng */}
      <div className="min-h-screen bg-[#f5f8f6] text-foreground flex">
        {/* Sidebar */}
        <aside className={`fixed inset-y-0 left-0 z-40 flex w-[310px] -translate-x-full flex-col border-r bg-background transition-transform lg:translate-x-0 ${open ? 'translate-x-0' : ''}`}>
          <div className="flex h-[104px] items-center gap-4 border-b px-8">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-primary text-xl font-bold text-primary-foreground">P</div>
            <div>
              <p className="font-bold">Pickleball Manager</p>
              <p className="text-xs tracking-[0.16em] text-muted-foreground">HOST WORKSPACE</p>
            </div>
            <button className="ml-auto lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu"><X /></button>
          </div>

          <div className="p-5">
            <p className="mb-4 px-4 text-xs font-semibold tracking-[0.16em] text-muted-foreground">KHÔNG GIAN LÀM VIỆC</p>
            <div className="flex items-center gap-3 rounded-2xl border bg-card px-4 py-3 shadow-sm">
              <span className="flex size-8 items-center justify-center rounded-xl bg-emerald-100 text-xs font-bold text-primary">CM</span>
              <select value={workspace} onChange={e => setWorkspace(e.target.value)} className="flex-1 bg-transparent text-sm font-semibold outline-none cursor-pointer">
                <option>Club Manager</option>
                <option>Xé Vé Manager</option>
              </select>
              <ChevronDown className="size-4 text-muted-foreground" />
            </div>
          </div>

          <nav className="flex flex-1 flex-col gap-1 px-5">
            {navItems.map(({ label, href, icon: Icon }) => {
              const active = pathname === href;
              return (
                <Link 
                  key={href} 
                  href={href} 
                  onClick={() => setOpen(false)}
                  className={`flex h-12 items-center gap-4 rounded-2xl px-4 text-sm font-medium transition-colors ${active ? 'bg-emerald-100 text-primary font-semibold' : 'text-muted-foreground hover:bg-muted'}`}
                >
                  <Icon className="size-5" />
                  {label}
                </Link>
              );
            })}
            
            <div className="my-5 border-t" />
            
            <Link href="/permissions" className="flex h-12 items-center gap-4 rounded-2xl px-4 text-sm font-medium text-muted-foreground hover:bg-muted">
              <ShieldCheck className="size-5" /> Phân quyền
            </Link>
            <Link href="/settings" className="flex h-12 items-center gap-4 rounded-2xl px-4 text-sm font-medium text-muted-foreground hover:bg-muted">
              <Settings className="size-5" /> Cài đặt
            </Link>
          </nav>

          <div className="border-t p-5">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-primary">TH</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">Trần Hoàng</p>
                <p className="text-xs text-muted-foreground">Chủ sân · Admin</p>
              </div>
              <MoreHorizontal className="text-muted-foreground" />
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 lg:pl-[310px] flex flex-col min-h-screen">
          <header className="flex h-[104px] items-center gap-4 border-b bg-background px-5 sm:px-9">
            <button className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu /></button>
            <div>
              <p className="text-sm text-muted-foreground">Thứ Ba, 17 tháng 6, 2025</p>
              <p className="text-2xl font-bold">Tổng quan</p>
            </div>
            <div className="ml-auto flex items-center gap-4">
              <button className="text-muted-foreground" aria-label="Search"><Search /></button>
              <button className="relative text-muted-foreground" aria-label="Notifications"><Bell /><span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-orange-500" /></button>
              <div className="hidden h-8 border-l sm:block" />
              <div className="flex items-center gap-2">
                <span className="flex size-10 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-primary">TH</span>
                <span className="hidden text-sm font-semibold sm:block">Trần Hoàng</span>
                <ChevronDown className="size-4 text-muted-foreground" />
              </div>
            </div>
          </header>

          <main className="flex-1 p-5 sm:p-8 xl:p-11 bg-[#f5f8f6]">
            {children}
          </main>
        </div>
      </div>
    </I18nProvider>
  );
}