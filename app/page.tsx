'use client'

import { useState } from 'react'
import {
  Bell,
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  Grid2X2,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Trophy,
  Users,
  WalletCards,
  X,
} from 'lucide-react'

const nav = [
  { label: 'Tổng quan', key: 'Dashboard', icon: Grid2X2 },
  { label: 'Lịch chơi & Kèo', key: 'Schedule', icon: CalendarDays },
  { label: 'Thành viên', key: 'Members', icon: Users },
  { label: 'Giải đấu', key: 'Matches', icon: Trophy },
  { label: 'Tài chính', key: 'Finance', icon: WalletCards },
  { label: 'Báo cáo', key: 'Reports', icon: Grid2X2 },
]

const schedule = [
  { day: '18', title: 'Kèo sáng thứ Tư', tag: 'Kèo lẻ', time: '06:00 – 08:00', place: 'Sân Pickleball 88', registered: '16 / 20', tone: 'green' },
  { day: '19', title: 'Club League · Vòng 3', tag: 'Giải nội bộ', time: '19:00 – 21:30', place: 'Cụm sân Riverside', registered: '24 / 24', tone: 'orange' },
  { day: '21', title: 'Giao lưu cuối tuần', tag: 'Kèo lẻ', time: '15:00 – 17:00', place: 'Sân Pickleball 88', registered: '12 / 16', tone: 'purple' },
]

const members = [
  { name: 'Nguyễn Minh Anh', package: 'VIP · 12 tháng', status: 'Đang hoạt động', left: '92%' },
  { name: 'Trần Quốc Bảo', package: 'Regular · 3 tháng', status: 'Đang hoạt động', left: '68%' },
  { name: 'Lê Hoàng Nam', package: 'VIP · 12 tháng', status: 'Sắp gia hạn', left: '34%' },
]

function StatCard({ icon: Icon, label, value, note, badge, tone = 'green' }: { icon: typeof Users; label: string; value: string; note: string; badge: string; tone?: string }) {
  return <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
    <div className="flex items-start justify-between">
      <span className={`flex size-11 items-center justify-center rounded-2xl ${tone === 'orange' ? 'bg-orange-100 text-orange-600' : tone === 'purple' ? 'bg-violet-100 text-violet-600' : tone === 'blue' ? 'bg-blue-100 text-blue-600' : 'bg-emerald-100 text-emerald-700'}`}><Icon /></span>
      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">{badge}</span>
    </div>
    <p className="mt-5 text-sm text-muted-foreground">{label}</p>
    <p className="mt-1 text-3xl font-semibold tracking-tight">{value}</p>
    <p className="mt-1 text-xs text-muted-foreground">{note}</p>
  </div>
}

function DashboardPage() {
  return <>
    <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
      <div><p className="text-sm text-muted-foreground">Chào buổi sáng, Trần Hoàng</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Club Manager <span className="text-muted-foreground/60">/ Tổng quan</span></h1></div>
      <button className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20"><Plus /> Tạo sự kiện mới</button>
    </div>
    <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard icon={Users} label="Tổng thành viên" value="128" note="12 người mới tháng này" badge="+10.3%" />
      <StatCard icon={CalendarDays} label="Buổi chơi tháng này" value="18" note="Tăng 3 buổi so với tháng trước" badge="+20%" tone="orange" />
      <StatCard icon={CircleDollarSign} label="Doanh thu tháng này" value="24.8M" note="Mục tiêu tháng: 30M" badge="82.6%" tone="purple" />
      <StatCard icon={WalletCards} label="Cần xử lý" value="07" note="3 gia hạn · 4 công nợ" badge="Xem ngay" tone="blue" />
    </div>
    <div className="mt-7 grid gap-6 xl:grid-cols-[1.35fr_0.8fr]">
      <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm sm:p-6"><div className="flex items-start justify-between"><div><h2 className="text-lg font-semibold">Lịch sắp tới</h2><p className="mt-1 text-sm text-muted-foreground">Các sự kiện trong 7 ngày tới</p></div><button className="hidden text-sm font-medium text-primary sm:block">Xem lịch ↗</button></div><div className="mt-5 flex flex-col gap-3">{schedule.map((item) => <div key={item.day} className="flex items-center gap-3 rounded-2xl border border-border/60 p-3 sm:gap-4"><div className={`flex size-14 shrink-0 flex-col items-center justify-center rounded-2xl text-xs font-semibold ${item.tone === 'orange' ? 'bg-orange-100 text-orange-700' : item.tone === 'purple' ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'}`}><span>THÁNG 6</span><strong className="text-2xl leading-6">{item.day}</strong></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{item.title}</p><span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{item.tag}</span></div><p className="mt-1 text-xs text-muted-foreground">◷ {item.time} <span className="mx-1">·</span> {item.place}</p></div><div className="hidden text-right sm:block"><p className="font-semibold">{item.registered}</p><p className="text-xs text-muted-foreground">đã đăng ký</p></div><MoreHorizontal className="text-muted-foreground" /></div>)}</div></section>
      <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm sm:p-6"><div className="flex items-start justify-between"><div><h2 className="text-lg font-semibold">Tổng quan hoạt động</h2><p className="mt-1 text-sm text-muted-foreground">Doanh thu & lượt chơi</p></div><button className="rounded-lg border px-3 py-2 text-xs text-muted-foreground">6 tháng <ChevronDown className="ml-1 inline size-3" /></button></div><p className="mt-6 text-3xl font-semibold">148.2M</p><p className="mt-1 text-xs text-emerald-700">↗ 12.8% so với kỳ trước</p><div className="mt-7 flex h-40 items-end gap-2 border-b border-border/70 px-1">{[38,52,45,62,48,75,66].map((height, i) => <div key={i} className="flex flex-1 items-end gap-1"><div className="w-1/2 rounded-t bg-emerald-200" style={{height: `${height * .62}%`}} /><div className="w-1/2 rounded-t bg-emerald-700" style={{height: `${height}%`}} /></div>)}</div><div className="mt-3 flex justify-between text-[10px] text-muted-foreground"><span>Thg 12</span><span>Thg 1</span><span>Thg 2</span><span>Thg 3</span><span>Thg 4</span><span>Thg 5</span><span>Thg 6</span></div></section>
    </div>
    <div className="mt-7 grid gap-6 xl:grid-cols-[1.35fr_0.8fr]"><section className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm sm:p-6"><div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold">Thành viên gần đây</h2><p className="mt-1 text-sm text-muted-foreground">Danh sách hoạt động mới nhất</p></div><button className="text-sm font-medium text-primary">Tất cả thành viên ↗</button></div><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[580px] text-left text-sm"><thead className="border-b text-xs text-muted-foreground"><tr><th className="pb-3 font-medium">THÀNH VIÊN</th><th className="pb-3 font-medium">GÓI HỘI VIÊN</th><th className="pb-3 font-medium">TRẠNG THÁI</th><th className="pb-3 text-right font-medium">CÒN LẠI</th></tr></thead><tbody>{members.map((member) => <tr key={member.name} className="border-b last:border-0"><td className="py-4 font-medium"><span className="mr-3 inline-flex size-8 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700">{member.name.split(' ').map(n => n[0]).slice(-2).join('')}</span>{member.name}</td><td className="py-4 text-muted-foreground">{member.package}</td><td className="py-4"><span className="rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700">{member.status}</span></td><td className="py-4 text-right font-semibold text-emerald-700">{member.left}</td></tr>)}</tbody></table></div></section><section className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm sm:p-6"><div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold">Bảng xếp hạng</h2><p className="mt-1 text-sm text-muted-foreground">Top thành viên tháng 6</p></div><Trophy className="text-amber-500" /></div><div className="mt-5 flex flex-col gap-4">{['Nguyễn Minh Anh','Trần Quốc Bảo','Lê Hoàng Nam'].map((name, i) => <div key={name} className="flex items-center gap-3"><span className="flex size-7 items-center justify-center rounded-full bg-amber-100 text-xs font-semibold text-amber-700">{i + 1}</span><span className="flex size-8 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700">{name.split(' ').slice(-2).map(n => n[0]).join('')}</span><span className="flex-1 text-sm font-medium">{name}</span><b className="text-sm text-emerald-700">{92 - i * 7}%</b></div>)}</div></section></div>
  </>
}

function PlaceholderPage({ title }: { title: string }) { return <div className="rounded-2xl border border-dashed bg-card p-10 text-center"><h1 className="text-2xl font-semibold">{title}</h1><p className="mt-2 text-muted-foreground">Nội dung trang đang được chuẩn bị.</p></div> }

export default function Home() {
  const [active, setActive] = useState('Dashboard')
  const [open, setOpen] = useState(false)
  const [workspace, setWorkspace] = useState('Club Manager')
  return <div className="min-h-screen bg-[#f5f8f6] text-foreground"><aside className={`fixed inset-y-0 left-0 z-40 flex w-[310px] -translate-x-full flex-col border-r bg-background transition-transform lg:translate-x-0 ${open ? 'translate-x-0' : ''}`}><div className="flex h-[104px] items-center gap-4 border-b px-8"><div className="flex size-12 items-center justify-center rounded-2xl bg-primary text-xl font-bold text-primary-foreground">P</div><div><p className="font-bold">Pickleball Manager</p><p className="text-xs tracking-[0.16em] text-muted-foreground">HOST WORKSPACE</p></div><button className="ml-auto lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu"><X /></button></div><div className="p-5"><p className="mb-4 px-4 text-xs font-semibold tracking-[0.16em] text-muted-foreground">KHÔNG GIAN LÀM VIỆC</p><div className="flex items-center gap-3 rounded-2xl border bg-card px-4 py-3 shadow-sm"><span className="flex size-8 items-center justify-center rounded-xl bg-emerald-100 text-xs font-bold text-primary">CM</span><select value={workspace} onChange={e => setWorkspace(e.target.value)} className="flex-1 bg-transparent text-sm font-semibold outline-none"><option>Club Manager</option><option>Xé Vé Manager</option></select><ChevronDown className="size-4 text-muted-foreground" /></div></div><nav className="flex flex-1 flex-col gap-1 px-5">{nav.map(({label, key, icon: Icon}) => <button key={key} onClick={() => { setActive(key); setOpen(false) }} className={`flex h-12 items-center gap-4 rounded-2xl px-4 text-sm font-medium transition-colors ${active === key ? 'bg-emerald-100 text-primary' : 'text-muted-foreground hover:bg-muted'}`}><Icon className="size-5" />{label}</button>)}<div className="my-5 border-t" /><button onClick={() => setActive('Permissions')} className={`flex h-12 items-center gap-4 rounded-2xl px-4 text-sm font-medium ${active === 'Permissions' ? 'bg-emerald-100 text-primary' : 'text-muted-foreground hover:bg-muted'}`}><ShieldCheck className="size-5" />Phân quyền</button><button onClick={() => setActive('Settings')} className={`flex h-12 items-center gap-4 rounded-2xl px-4 text-sm font-medium ${active === 'Settings' ? 'bg-emerald-100 text-primary' : 'text-muted-foreground hover:bg-muted'}`}><Settings className="size-5" />Cài đặt</button></nav><div className="border-t p-5"><div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-primary">TH</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">Trần Hoàng</p><p className="text-xs text-muted-foreground">Chủ sân · Admin</p></div><MoreHorizontal className="text-muted-foreground" /></div></div></aside><main className="lg:pl-[310px]"><header className="flex h-[104px] items-center gap-4 border-b bg-background px-5 sm:px-9"><button className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu /></button><div><p className="text-sm text-muted-foreground">Thứ Ba, 17 tháng 6, 2025</p><p className="text-2xl font-bold">{active === 'Dashboard' ? 'Tổng quan' : nav.find(item => item.key === active)?.label || active}</p></div><div className="ml-auto flex items-center gap-4"><button className="text-muted-foreground" aria-label="Search"><Search /></button><button className="relative text-muted-foreground" aria-label="Notifications"><Bell /><span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-orange-500" /></button><div className="hidden h-8 border-l sm:block" /><div className="flex items-center gap-2"><span className="flex size-10 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-primary">TH</span><span className="hidden text-sm font-semibold sm:block">Trần Hoàng</span><ChevronDown className="size-4 text-muted-foreground" /></div></div></header><div className="min-h-[calc(100vh-104px)] p-5 sm:p-8 xl:p-11">{active === 'Dashboard' ? <DashboardPage /> : <PlaceholderPage title={nav.find(item => item.key === active)?.label || active} />}</div></main></div>
}
