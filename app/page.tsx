'use client'

import { useState } from 'react'
import {
  Bell,
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  LayoutDashboard,
  Menu,
  Search,
  Settings,
  Swords,
  Users,
  WalletCards,
  X,
} from 'lucide-react'

const workspaces = ['Club Manager', 'Xé Vé Manager']

const navigation = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Members', icon: Users },
  { label: 'Schedule', icon: CalendarDays },
  { label: 'Matches', icon: Swords },
  { label: 'Finance', icon: CircleDollarSign },
  { label: 'Settings', icon: Settings },
]

export default function Home() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [workspace, setWorkspace] = useState(workspaces[0])
  const [activeItem, setActiveItem] = useState('Dashboard')
  const [profileOpen, setProfileOpen] = useState(false)

  return (
    <div className="min-h-screen bg-muted/40 text-foreground">
      <aside
        className={`fixed inset-y-0 z-40 flex w-72 flex-col border-r bg-background transition-[left] duration-200 ${sidebarOpen ? 'left-0' : '-left-full lg:left-0'}`}
      >
        <div className="flex h-20 items-center gap-3 border-b px-6">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground">P</div>
          <div>
            <p className="font-semibold tracking-tight">Pickleball Manager</p>
            <p className="text-xs text-muted-foreground">Management dashboard</p>
          </div>
        </div>

        <div className="border-b p-4">
          <label htmlFor="workspace" className="mb-2 block text-xs font-medium text-muted-foreground">Workspace</label>
          <div className="relative">
            <select
              id="workspace"
              value={workspace}
              onChange={(event) => setWorkspace(event.target.value)}
              className="h-10 w-full appearance-none rounded-lg border bg-background px-3 pr-9 text-sm font-medium outline-none focus:ring-2 focus:ring-ring"
            >
              {workspaces.map((item) => <option key={item}>{item}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-3 size-4 text-muted-foreground" />
          </div>
        </div>

        <nav aria-label="Main navigation" className="flex flex-1 flex-col gap-1 p-4">
          {navigation.map(({ label, icon: Icon }) => {
            const active = activeItem === label
            return (
              <button
                key={label}
                type="button"
                onClick={() => { setActiveItem(label); setSidebarOpen(false) }}
                className={`flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
              >
                <Icon className="size-4" />
                {label}
              </button>
            )
          })}
        </nav>

        <div className="border-t p-4">
          <div className="flex items-center gap-3 rounded-lg bg-muted/60 p-3">
            <div className="flex size-9 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">TH</div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">Trần Hoàng</p>
              <p className="truncate text-xs text-muted-foreground">Club administrator</p>
            </div>
          </div>
        </div>
      </aside>

      {sidebarOpen && (
        <button type="button" aria-label="Close sidebar" onClick={() => setSidebarOpen(false)} className="fixed inset-0 z-30 bg-black/30 lg:hidden" />
      )}

      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 flex h-20 items-center justify-between border-b bg-background/95 px-4 backdrop-blur sm:px-8">
          <div className="flex items-center gap-3">
            <button type="button" aria-label="Open sidebar" onClick={() => setSidebarOpen(true)} className="rounded-lg p-2 hover:bg-muted lg:hidden">
              <Menu className="size-5" />
            </button>
            <div className="hidden items-center gap-2 rounded-lg border bg-muted/40 px-3 sm:flex sm:w-72">
              <Search className="size-4 text-muted-foreground" />
              <input aria-label="Search" placeholder="Search anything..." className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
              <kbd className="hidden rounded border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground md:inline">⌘ K</kbd>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <button type="button" aria-label="Notifications" className="relative rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground">
              <Bell className="size-5" />
              <span className="absolute right-2 top-2 size-1.5 rounded-full bg-destructive" />
            </button>
            <div className="relative border-l pl-2 sm:pl-4">
              <button type="button" onClick={() => setProfileOpen((open) => !open)} className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-muted">
                <span className="flex size-9 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">TH</span>
                <span className="hidden text-left sm:block"><span className="block text-sm font-medium">Trần Hoàng</span><span className="block text-xs text-muted-foreground">Administrator</span></span>
                <ChevronDown className="hidden size-4 text-muted-foreground sm:block" />
              </button>
              {profileOpen && <div className="absolute right-0 mt-2 w-44 rounded-lg border bg-popover p-1 shadow-lg"><button type="button" className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted">Profile</button><button type="button" className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted">Sign out</button></div>}
            </div>
          </div>
        </header>

        <main className="min-h-[calc(100vh-5rem)] bg-muted/40 p-4 sm:p-8">
          <div className="mx-auto flex min-h-[calc(100vh-9rem)] max-w-7xl items-center justify-center rounded-xl border border-dashed bg-background/50 p-8">
            <div className="text-center">
              <WalletCards className="mx-auto size-10 text-muted-foreground/60" />
              <p className="mt-4 text-sm font-medium text-muted-foreground">Page Content Goes Here</p>
              <p className="mt-1 text-xs text-muted-foreground/70">Your {activeItem.toLowerCase()} workspace is ready.</p>
            </div>
          </div>
        </main>
      </div>

      <button type="button" aria-label="Close sidebar" onClick={() => setSidebarOpen(false)} className="sr-only"><X /></button>
    </div>
  )
}
