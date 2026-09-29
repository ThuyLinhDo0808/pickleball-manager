'use client'

import { useMemo, useState } from 'react'
import {
  Bell,
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  Download,
  Ellipsis,
  LayoutDashboard,
  Menu,
  Plus,
  Search,
  Settings,
  Swords,
  TrendingDown,
  TrendingUp,
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

const members = [
  { name: 'Nguyễn Minh Anh', initials: 'NA', phone: '090 123 4567', type: 'Fixed VIP', dupR: '5.2', joined: '12 Jan 2024', sessions: 18, total: 20, tone: 'bg-rose-100 text-rose-700' },
  { name: 'Trần Quốc Bảo', initials: 'QB', phone: '091 872 3341', type: 'Regular', dupR: '4.1', joined: '24 Feb 2024', sessions: 8, total: 12, tone: 'bg-sky-100 text-sky-700' },
  { name: 'Lê Hoàng Nam', initials: 'LN', phone: '098 455 9201', type: 'Guest', dupR: '3.8', joined: '08 Mar 2024', sessions: 0, total: 5, tone: 'bg-amber-100 text-amber-700' },
  { name: 'Phạm Thu Hà', initials: 'TH', phone: '093 221 4488', type: 'Fixed VIP', dupR: '4.8', joined: '15 Mar 2024', sessions: 14, total: 20, tone: 'bg-rose-100 text-rose-700' },
  { name: 'Đỗ Thành Long', initials: 'TL', phone: '097 653 1029', type: 'Regular', dupR: '4.4', joined: '02 Apr 2024', sessions: 5, total: 12, tone: 'bg-sky-100 text-sky-700' },
]

function StatCard({ label, value, change, up, icon: Icon }: { label: string; value: string; change: string; up?: boolean; icon: typeof Users }) {
  return <article className="rounded-xl border bg-card p-5 shadow-sm">
    <div className="flex items-start justify-between"><p className="text-sm text-muted-foreground">{label}</p><span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon /></span></div>
    <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
    <div className={`mt-2 flex items-center gap-1 text-xs font-medium ${up ? 'text-emerald-600' : 'text-rose-600'}`}>{up ? <TrendingUp /> : <TrendingDown />}{change}<span className="font-normal text-muted-foreground">from last month</span></div>
  </article>
}

export default function Home() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [workspace, setWorkspace] = useState(workspaces[0])
  const [activeItem, setActiveItem] = useState('Members')
  const [profileOpen, setProfileOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('All members')
  const [menu, setMenu] = useState<string | null>(null)

  const filteredMembers = useMemo(() => members.filter((member) => {
    const matchesQuery = `${member.name} ${member.phone}`.toLowerCase().includes(query.toLowerCase())
    const matchesFilter = filter === 'All members' || member.type === filter
    return matchesQuery && matchesFilter
  }), [query, filter])

  return <div className="min-h-screen overflow-x-hidden bg-muted/40 text-foreground">
    <aside className={`fixed inset-y-0 z-40 flex w-72 flex-col border-r bg-background transition-[left] duration-200 ${sidebarOpen ? 'left-0' : '-left-full lg:left-0'}`}>
      <div className="flex h-20 items-center gap-3 border-b px-6"><div className="flex size-10 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground">P</div><div><p className="font-semibold tracking-tight">Pickleball Manager</p><p className="text-xs text-muted-foreground">Management dashboard</p></div></div>
      <div className="border-b p-4"><label htmlFor="workspace" className="mb-2 block text-xs font-medium text-muted-foreground">Workspace</label><div className="relative"><select id="workspace" value={workspace} onChange={(event) => setWorkspace(event.target.value)} className="h-10 w-full appearance-none rounded-lg border bg-background px-3 pr-9 text-sm font-medium outline-none focus:ring-2 focus:ring-ring">{workspaces.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-3 size-4 text-muted-foreground" /></div></div>
      <nav aria-label="Main navigation" className="flex flex-1 flex-col gap-1 p-4">{navigation.map(({ label, icon: Icon }) => <button key={label} type="button" onClick={() => { setActiveItem(label); setSidebarOpen(false) }} className={`flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${activeItem === label ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}><Icon className="size-4" />{label}</button>)}</nav>
      <div className="border-t p-4"><div className="flex items-center gap-3 rounded-lg bg-muted/60 p-3"><div className="flex size-9 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">TH</div><div className="min-w-0"><p className="truncate text-sm font-medium">Trần Hoàng</p><p className="truncate text-xs text-muted-foreground">Club administrator</p></div></div></div>
    </aside>
    {sidebarOpen && <button type="button" aria-label="Close sidebar" onClick={() => setSidebarOpen(false)} className="fixed inset-0 z-30 bg-black/30 lg:hidden" />}
    <div className="lg:pl-72"><header className="sticky top-0 z-20 flex h-20 items-center justify-between border-b bg-background/95 px-4 backdrop-blur sm:px-8"><div className="flex items-center gap-3"><button type="button" aria-label="Open sidebar" onClick={() => setSidebarOpen(true)} className="rounded-lg p-2 hover:bg-muted lg:hidden"><Menu className="size-5" /></button><div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 sm:w-72"><Search className="size-4 text-muted-foreground" /><input aria-label="Search anything" placeholder="Search anything..." className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" /></div></div><div className="flex items-center gap-2 sm:gap-4"><button type="button" aria-label="Notifications" className="relative rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><Bell className="size-5" /><span className="absolute right-2 top-2 size-1.5 rounded-full bg-destructive" /></button><div className="relative border-l pl-2 sm:pl-4"><button type="button" onClick={() => setProfileOpen((open) => !open)} className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-muted"><span className="flex size-9 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">TH</span><span className="hidden text-left sm:block"><span className="block text-sm font-medium">Trần Hoàng</span><span className="block text-xs text-muted-foreground">Administrator</span></span><ChevronDown className="hidden size-4 text-muted-foreground sm:block" /></button>{profileOpen && <div className="absolute right-0 mt-2 w-44 rounded-lg border bg-popover p-1 shadow-lg"><button type="button" className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted">Profile</button><button type="button" className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted">Sign out</button></div>}</div></div></header>
      <main className="min-h-[calc(100vh-5rem)] bg-muted/40 p-4 sm:p-8"><div className="mx-auto max-w-7xl"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-medium text-primary">Club Manager / Members</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Members Management</h1><p className="mt-1 text-sm text-muted-foreground">Manage your club members, subscriptions, and activity.</p></div><button type="button" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"><Plus className="size-4" />Add Member</button></div>
        <section aria-label="Member statistics" className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="Total Members" value="1,248" change="+5.2%" up icon={Users} /><StatCard label="Active VIPs" value="186" change="+8.1%" up icon={WalletCards} /><StatCard label="Guests" value="42" change="-2.4%" icon={Users} /><StatCard label="Monthly Revenue" value="₫86.4M" change="+12.8%" up icon={CircleDollarSign} /></section>
        <section className="mt-7 overflow-hidden rounded-xl border bg-card shadow-sm"><div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold">All Members</h2><p className="text-sm text-muted-foreground">{filteredMembers.length} members in your club</p></div><div className="flex flex-col gap-2 sm:flex-row"><div className="flex h-10 items-center gap-2 rounded-lg border bg-background px-3 sm:w-64"><Search className="size-4 text-muted-foreground" /><input aria-label="Search members" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search members..." className="w-full bg-transparent text-sm outline-none" /></div><div className="relative"><select aria-label="Filter members" value={filter} onChange={(event) => setFilter(event.target.value)} className="h-10 w-full appearance-none rounded-lg border bg-background px-3 pr-9 text-sm outline-none sm:w-40"><option>All members</option><option>Fixed VIP</option><option>Regular</option><option>Guest</option></select><ChevronDown className="pointer-events-none absolute right-3 top-3 size-4 text-muted-foreground" /></div><button type="button" aria-label="Export members" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium hover:bg-muted"><Download className="size-4" />Export</button></div></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3 font-medium">User</th><th className="px-5 py-3 font-medium">Phone</th><th className="px-5 py-3 font-medium">Member Type</th><th className="px-5 py-3 font-medium">DUPR Rating</th><th className="px-5 py-3 font-medium">Joined Date</th><th className="px-5 py-3 font-medium">Sessions Left</th><th className="px-5 py-3 text-right font-medium">Actions</th></tr></thead><tbody className="divide-y">{filteredMembers.map((member) => <tr key={member.name} className="odd:bg-background even:bg-muted/20 hover:bg-muted/40"><td className="px-5 py-4"><div className="flex items-center gap-3"><span className={`flex size-9 items-center justify-center rounded-full text-xs font-semibold ${member.tone}`}>{member.initials}</span><span className="font-medium">{member.name}</span></div></td><td className="px-5 py-4 text-muted-foreground">{member.phone}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${member.tone}`}>{member.type}</span></td><td className="px-5 py-4 font-medium">{member.dupR}</td><td className="px-5 py-4 text-muted-foreground">{member.joined}</td><td className="px-5 py-4"><div className="flex items-center gap-3"><div className="h-2 w-20 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${member.sessions === 0 ? 'bg-destructive' : 'bg-primary'}`} style={{ width: `${(member.sessions / member.total) * 100}%` }} /></div><span className={`text-xs font-medium ${member.sessions === 0 ? 'text-destructive' : 'text-muted-foreground'}`}>{member.sessions}/{member.total}</span></div></td><td className="relative px-5 py-4 text-right"><button type="button" aria-label={`Actions for ${member.name}`} onClick={() => setMenu(menu === member.name ? null : member.name)} className="rounded-md p-2 text-muted-foreground hover:bg-muted"><Ellipsis className="size-4" /></button>{menu === member.name && <div className="absolute right-5 top-12 z-10 w-32 rounded-lg border bg-popover p-1 text-left shadow-lg"><button type="button" className="w-full rounded-md px-3 py-2 text-sm hover:bg-muted">Edit</button><button type="button" className="w-full rounded-md px-3 py-2 text-sm hover:bg-muted">Add Note</button><button type="button" className="w-full rounded-md px-3 py-2 text-sm text-destructive hover:bg-destructive/10">Delete</button></div>}</td></tr>)}</tbody></table>{filteredMembers.length === 0 && <div className="p-10 text-center text-sm text-muted-foreground">No members match your search.</div>}</div></section>
      </div></main></div>
    <button type="button" aria-label="Close sidebar" onClick={() => setSidebarOpen(false)} className="sr-only"><X /></button>
  </div>
}
