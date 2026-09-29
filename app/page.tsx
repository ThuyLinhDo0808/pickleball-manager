'use client'

import { useState } from 'react'
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  Clock3,
  LayoutDashboard,
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

const navItems = [
  { label: 'Tổng quan', icon: LayoutDashboard },
  { label: 'Lịch chơi & Kèo', icon: CalendarDays },
  { label: 'Thành viên', icon: Users },
  { label: 'Giải đấu', icon: Trophy },
  { label: 'Tài chính', icon: WalletCards },
  { label: 'Báo cáo', icon: BarChart3 },
]

const events = [
  { date: '18', month: 'THÁNG 6', title: 'Kèo sáng thứ Tư', time: '06:00 – 08:00', place: 'Sân Pickleball 88', players: '16 / 20', type: 'Kèo lẻ', color: 'bg-[#d9f3e2]', accent: 'text-[#16794b]' },
  { date: '19', month: 'THÁNG 6', title: 'Club League · Vòng 3', time: '19:00 – 21:30', place: 'Cụm sân Riverside', players: '24 / 24', type: 'Giải nội bộ', color: 'bg-[#f9ead8]', accent: 'text-[#ae5c17]' },
  { date: '21', month: 'THÁNG 6', title: 'Giao lưu cuối tuần', time: '15:00 – 17:00', place: 'Sân Pickleball 88', players: '12 / 16', type: 'Kèo lẻ', color: 'bg-[#e8e4fb]', accent: 'text-[#6551b6]' },
]

const members = [
  { name: 'Nguyễn Minh Anh', initials: 'MA', plan: 'Hội viên VIP', status: 'Đang hoạt động', sessions: '8 buổi', tone: 'bg-[#d9f3e2] text-[#16794b]' },
  { name: 'Trần Quốc Huy', initials: 'QH', plan: 'Hội viên thường', status: 'Cần gia hạn', sessions: '2 buổi', tone: 'bg-[#f9ead8] text-[#ae5c17]' },
  { name: 'Lê Hoàng Nam', initials: 'LN', plan: 'Giao lưu', status: 'Đang hoạt động', sessions: '—', tone: 'bg-[#e8e4fb] text-[#6551b6]' },
  { name: 'Phạm Thùy Linh', initials: 'TL', plan: 'Hội viên VIP', status: 'Đang hoạt động', sessions: '12 buổi', tone: 'bg-[#e0edf9] text-[#2d6ba3]' },
]

export default function Home() {
  const [activeNav, setActiveNav] = useState('Tổng quan')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [notice, setNotice] = useState(true)

  return (
    <div className="min-h-screen bg-[#f5f7f5] text-[#18231f]">
      <aside className={`fixed inset-y-0 left-0 z-30 flex w-[250px] flex-col border-r border-[#e1e8e3] bg-[#fbfcfb] transition-transform lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-[83px] items-center gap-3 border-b border-[#e7ece8] px-7">
          <div className="flex h-10 w-10 items-center justify-center rounded-[13px] bg-[#246b49] text-white shadow-sm"><span className="text-[20px] font-bold">P</span></div>
          <div><p className="text-[15px] font-bold tracking-[-0.02em]">Pickleball Manager</p><p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8b9891]">Host workspace</p></div>
        </div>
        <div className="px-4 pt-7">
          <p className="px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[#a0aaa4]">Không gian làm việc</p>
          <button className="mt-3 flex w-full items-center justify-between rounded-xl border border-[#dce7df] bg-white px-3 py-2.5 text-left shadow-[0_2px_6px_rgba(25,53,38,0.03)]"><div className="flex items-center gap-2.5"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#e1f2e7] text-xs font-bold text-[#26744d]">CM</span><span className="text-[13px] font-semibold">Club Manager</span></div><ChevronDown className="h-4 w-4 text-[#85918a]" /></button>
        </div>
        <nav className="mt-7 flex-1 space-y-1 px-4">
          {navItems.map(({ label, icon: Icon }) => <button key={label} onClick={() => { setActiveNav(label); setMobileOpen(false) }} className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition ${activeNav === label ? 'bg-[#e4f2e8] font-semibold text-[#1c7047]' : 'text-[#718078] hover:bg-[#f0f5f1] hover:text-[#284d3a]'}`}><Icon className={`h-[17px] w-[17px] ${activeNav === label ? 'text-[#28764e]' : 'text-[#91a099]'}`} />{label}</button>)}
          <div className="my-5 border-t border-[#edf0ed]" />
          <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium text-[#718078] hover:bg-[#f0f5f1]"><ShieldCheck className="h-[17px] w-[17px] text-[#91a099]" />Phân quyền</button>
          <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium text-[#718078] hover:bg-[#f0f5f1]"><Settings className="h-[17px] w-[17px] text-[#91a099]" />Cài đặt</button>
        </nav>
        <div className="border-t border-[#e7ece8] p-4"><div className="flex items-center gap-3 rounded-xl px-2 py-2"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#d4e9df] text-[11px] font-bold text-[#28764e]">TH</div><div className="min-w-0 flex-1"><p className="truncate text-[12px] font-semibold">Trần Hoàng</p><p className="text-[11px] text-[#94a099]">Chủ sân · Admin</p></div><MoreHorizontal className="h-4 w-4 text-[#9ba7a0]" /></div></div>
      </aside>
      {mobileOpen && <button aria-label="Đóng menu" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-20 bg-[#15251c]/20 lg:hidden"><span className="sr-only">Đóng menu</span></button>}
      <main className="lg:pl-[250px]">
        <header className="flex h-[83px] items-center justify-between border-b border-[#e4eae5] bg-[#fbfcfb] px-5 sm:px-9"><div className="flex items-center gap-3"><button aria-label="Mở menu" onClick={() => setMobileOpen(true)} className="rounded-lg p-2 hover:bg-[#eff4f0] lg:hidden"><Menu className="h-5 w-5" /></button><div><p className="text-[12px] text-[#85918a]">Thứ Ba, 17 tháng 6, 2025</p><h1 className="mt-0.5 text-[21px] font-bold tracking-[-0.03em]">Tổng quan</h1></div></div><div className="flex items-center gap-2 sm:gap-4"><button aria-label="Tìm kiếm" className="hidden rounded-lg p-2 text-[#819087] hover:bg-[#eff4f0] sm:block"><Search className="h-[18px] w-[18px]" /></button><button aria-label="Thông báo" className="relative rounded-lg p-2 text-[#819087] hover:bg-[#eff4f0]"><Bell className="h-[18px] w-[18px]" /><span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#db7349]" /></button><div className="hidden h-6 w-px bg-[#e3e9e4] sm:block" /><div className="flex items-center gap-2"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#d4e9df] text-[11px] font-bold text-[#28764e]">TH</div><span className="hidden text-[12px] font-semibold sm:block">Trần Hoàng</span><ChevronDown className="hidden h-3.5 w-3.5 text-[#98a39d] sm:block" /></div></div></header>
        <div className="mx-auto max-w-[1440px] px-5 py-7 sm:px-9 sm:py-8"><div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-[13px] text-[#809088]">Chào buổi sáng, Trần Hoàng</p><h2 className="mt-1 text-[25px] font-bold tracking-[-0.04em]">Club Manager <span className="font-normal text-[#b2bbb5]">/</span> <span className="text-[#6d7b73]">Tổng quan</span></h2></div><button className="flex w-fit items-center gap-2 rounded-xl bg-[#246b49] px-4 py-2.5 text-[12px] font-semibold text-white shadow-[0_5px_12px_rgba(36,107,73,0.16)] transition hover:bg-[#1c5a3c]"><Plus className="h-4 w-4" />Tạo sự kiện mới</button></div>
          {notice && <div className="mb-6 flex items-center gap-3 rounded-xl border border-[#d7e8dc] bg-[#eff8f1] px-4 py-3 text-[12px] text-[#3b6f50]"><Activity className="h-4 w-4 shrink-0 text-[#3b9563]" /><span><strong className="font-semibold">Cập nhật mới:</strong> 3 thành viên cần gia hạn gói chơi trong tuần này.</span><button onClick={() => setNotice(false)} aria-label="Đóng thông báo" className="ml-auto rounded p-1 hover:bg-[#dcefe1]"><X className="h-3.5 w-3.5" /></button></div>}
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><StatCard icon={<Users />} label="Tổng thành viên" value="128" detail="12 người mới tháng này" trend="+10.3%" color="green" /><StatCard icon={<CalendarDays />} label="Buổi chơi tháng này" value="18" detail="Tăng 3 buổi so với tháng trước" trend="+20%" color="orange" /><StatCard icon={<CircleDollarSign />} label="Doanh thu tháng này" value="24.8M" detail="Mục tiêu tháng: 30M" trend="82.6%" color="purple" /><StatCard icon={<ClipboardList />} label="Cần xử lý" value="07" detail="3 gia hạn · 4 công nợ" trend="Xem ngay" color="blue" /></section>
          <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.82fr)]"><section className="rounded-2xl border border-[#e2e9e3] bg-white p-5 shadow-[0_3px_12px_rgba(31,60,42,0.025)]"><div className="mb-5 flex items-center justify-between"><div><h3 className="text-[15px] font-bold tracking-[-0.02em]">Lịch sắp tới</h3><p className="mt-1 text-[11px] text-[#94a099]">Các sự kiện trong 7 ngày tới</p></div><button className="flex items-center gap-1 text-[11px] font-semibold text-[#28764e] hover:underline">Xem lịch <ArrowUpRight className="h-3.5 w-3.5" /></button></div><div className="space-y-3">{events.map((event) => <div key={event.title} className="flex items-center gap-3 rounded-xl border border-[#edf1ee] p-3 transition hover:border-[#d6e5da] hover:bg-[#fbfdfb]"><div className={`flex h-[54px] w-[55px] shrink-0 flex-col items-center justify-center rounded-xl ${event.color}`}><span className={`text-[10px] font-bold uppercase ${event.accent}`}>{event.month}</span><span className={`text-[21px] font-bold leading-5 ${event.accent}`}>{event.date}</span></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h4 className="truncate text-[13px] font-semibold">{event.title}</h4><span className={`rounded-md px-1.5 py-0.5 text-[9px] font-semibold ${event.color} ${event.accent}`}>{event.type}</span></div><div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#86938b]"><span className="flex items-center gap-1"><Clock3 className="h-3 w-3" />{event.time}</span><span>{event.place}</span></div></div><div className="hidden text-right sm:block"><p className="text-[12px] font-semibold">{event.players}</p><p className="mt-1 text-[10px] text-[#99a59e]">đã đăng ký</p></div><button aria-label={`Tùy chọn ${event.title}`} className="rounded-lg p-1.5 text-[#a1aaa5] hover:bg-[#f0f5f1]"><MoreHorizontal className="h-4 w-4" /></button></div>)}</div></section>
            <section className="rounded-2xl border border-[#e2e9e3] bg-white p-5 shadow-[0_3px_12px_rgba(31,60,42,0.025)]"><div className="mb-4 flex items-center justify-between"><div><h3 className="text-[15px] font-bold tracking-[-0.02em]">Tổng quan hoạt động</h3><p className="mt-1 text-[11px] text-[#94a099]">Doanh thu & lượt chơi</p></div><button className="flex items-center gap-1 rounded-lg border border-[#e8ede9] px-2 py-1.5 text-[10px] text-[#718078]">6 tháng <ChevronDown className="h-3 w-3" /></button></div><div className="flex items-end gap-3"><div><p className="text-[26px] font-bold tracking-[-0.04em]">148.2M</p><p className="mt-1 flex items-center gap-1 text-[10px] text-[#3a9561]"><ArrowUpRight className="h-3 w-3" /> 12.8% so với kỳ trước</p></div><div className="ml-auto flex items-center gap-3 text-[10px] text-[#7f8d85]"><span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#2c895a]" />Doanh thu</span><span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#b9d9c4]" />Lượt chơi</span></div></div><div className="relative mt-6 h-[145px] w-full"><div className="absolute inset-0 flex flex-col justify-between text-[9px] text-[#aab4ae]"><span>40M</span><span>30M</span><span>20M</span><span>10M</span><span>0</span></div><div className="ml-8 flex h-full items-end justify-between gap-2 border-b border-[#e9eeea] pb-0">{[48,62,54,72,61,85,78].map((height, i) => <div key={i} className="flex h-full flex-1 items-end gap-1"><div className="w-1/2 rounded-t-[3px] bg-[#b9d9c4]" style={{ height: `${height * 0.58}%` }} /><div className="w-1/2 rounded-t-[3px] bg-[#2c895a]" style={{ height: `${height}%` }} /></div>)}</div><div className="ml-8 flex justify-between pt-2 text-[9px] text-[#aab4ae]"><span>Thg 12</span><span>Thg 1</span><span>Thg 2</span><span>Thg 3</span><span>Thg 4</span><span>Thg 5</span><span>Thg 6</span></div></div></section></div>
          <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.82fr)]"><section className="rounded-2xl border border-[#e2e9e3] bg-white p-5 shadow-[0_3px_12px_rgba(31,60,42,0.025)]"><div className="mb-4 flex items-center justify-between"><div><h3 className="text-[15px] font-bold tracking-[-0.02em]">Thành viên gần đây</h3><p className="mt-1 text-[11px] text-[#94a099]">Danh sách hoạt động mới nhất</p></div><button className="flex items-center gap-1 text-[11px] font-semibold text-[#28764e] hover:underline">Tất cả thành viên <ArrowUpRight className="h-3.5 w-3.5" /></button></div><div className="overflow-x-auto"><table className="w-full min-w-[580px] text-left"><thead><tr className="border-b border-[#edf1ee] text-[10px] uppercase tracking-[0.08em] text-[#a0aaa4]"><th className="pb-3 font-semibold">Thành viên</th><th className="pb-3 font-semibold">Gói hội viên</th><th className="pb-3 font-semibold">Trạng thái</th><th className="pb-3 text-right font-semibold">Còn lại</th></tr></thead><tbody>{members.map((member) => <tr key={member.name} className="border-b border-[#f0f3f0] last:border-0"><td className="py-3"><div className="flex items-center gap-2.5"><div className={`flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-bold ${member.tone}`}>{member.initials}</div><span className="text-[12px] font-semibold">{member.name}</span></div></td><td className="py-3 text-[11px] text-[#718078]">{member.plan}</td><td className="py-3"><span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-medium ${member.status === 'Cần gia hạn' ? 'bg-[#fff2e5] text-[#b36626]' : 'bg-[#edf8f0] text-[#348255]'}`}><i className={`h-1.5 w-1.5 rounded-full ${member.status === 'Cần gia hạn' ? 'bg-[#d9873e]' : 'bg-[#4da26c]'}`} />{member.status}</span></td><td className="py-3 text-right text-[12px] font-semibold text-[#53625a]">{member.sessions}</td></tr>)}</tbody></table></div></section>
            <section className="rounded-2xl border border-[#e2e9e3] bg-white p-5 shadow-[0_3px_12px_rgba(31,60,42,0.025)]"><div className="mb-4 flex items-center justify-between"><div><h3 className="text-[15px] font-bold tracking-[-0.02em]">Bảng xếp hạng</h3><p className="mt-1 text-[11px] text-[#94a099]">Top thành viên tháng 6</p></div><Trophy className="h-5 w-5 text-[#d59a45]" /></div><div className="space-y-3">{['Nguyễn Minh Anh', 'Phạm Thùy Linh', 'Lê Hoàng Nam'].map((name, i) => <div key={name} className="flex items-center gap-3"><span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${i === 0 ? 'bg-[#fae4a9] text-[#956e18]' : i === 1 ? 'bg-[#e9edf0] text-[#66727b]' : 'bg-[#f1d8c0] text-[#93663c]'}`}>{i + 1}</span><div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#dcefe3] text-[9px] font-bold text-[#28764e]">{name.split(' ').map((n) => n[0]).slice(-2).join('')}</div><span className="flex-1 text-[12px] font-medium">{name}</span><span className="text-[12px] font-bold text-[#28764e]">{[92, 87, 81][i]}%</span></div>)}</div><div className="mt-5 flex items-center justify-between border-t border-[#edf1ee] pt-4"><span className="text-[10px] text-[#89968e]">Cập nhật 10 phút trước</span><button className="text-[11px] font-semibold text-[#28764e] hover:underline">Xem chi tiết</button></div></section></div>
        </div>
      </main>
    </div>
  )
}

function StatCard({ icon, label, value, detail, trend, color }: { icon: React.ReactNode; label: string; value: string; detail: string; trend: string; color: string }) {
  const styles: Record<string, string> = { green: 'bg-[#e2f3e8] text-[#27784f]', orange: 'bg-[#fbeadb] text-[#b86620]', purple: 'bg-[#ebe7fb] text-[#6a56b9]', blue: 'bg-[#e2eef8] text-[#3975a8]' }
  return <div className="rounded-2xl border border-[#e2e9e3] bg-white p-4 shadow-[0_3px_12px_rgba(31,60,42,0.025)]"><div className="flex items-start justify-between"><div className={`flex h-9 w-9 items-center justify-center rounded-xl ${styles[color]}`}>{icon}</div><span className="rounded-md bg-[#f1f6f2] px-1.5 py-1 text-[10px] font-semibold text-[#4b8b63]">{trend}</span></div><p className="mt-4 text-[11px] font-medium text-[#87938c]">{label}</p><p className="mt-1 text-[24px] font-bold tracking-[-0.04em]">{value}</p><p className="mt-1 truncate text-[10px] text-[#9ba69f]">{detail}</p></div>
}
