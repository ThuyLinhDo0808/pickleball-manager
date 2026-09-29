'use client';

import Link from 'next/link';
import { 
  CalendarDays, 
  CircleDollarSign, 
  Grid2X2, 
  MoreHorizontal, 
  Plus, 
  Trophy, 
  Users, 
  WalletCards 
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const schedule = [
  { day: '18', title: 'Kèo sáng thứ Tư', tag: 'Kèo lẻ', time: '06:00 – 08:00', place: 'Sân Pickleball 88', registered: '16 / 20', tone: 'green' },
  { day: '19', title: 'Club League · Vòng 3', tag: 'Giải nội bộ', time: '19:00 – 21:30', place: 'Cụm sân Riverside', registered: '24 / 24', tone: 'orange' },
  { day: '21', title: 'Giao lưu cuối tuần', tag: 'Kèo lẻ', time: '15:00 – 17:00', place: 'Sân Pickleball 88', registered: '12 / 16', tone: 'purple' },
];

const members = [
  { name: 'Nguyễn Minh Anh', package: 'VIP · 12 tháng', status: 'Đang hoạt động', left: '92%' },
  { name: 'Trần Quốc Bảo', package: 'Regular · 3 tháng', status: 'Đang hoạt động', left: '68%' },
  { name: 'Lê Hoàng Nam', package: 'VIP · 12 tháng', status: 'Sắp gia hạn', left: '34%' },
];

function StatCard({ icon: Icon, label, value, note, badge, tone = 'green' }: any) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <span className={`flex size-11 items-center justify-center rounded-2xl ${tone === 'orange' ? 'bg-orange-100 text-orange-600' : tone === 'purple' ? 'bg-violet-100 text-violet-600' : tone === 'blue' ? 'bg-blue-100 text-blue-600' : 'bg-emerald-100 text-emerald-700'}`}>
          <Icon className="w-5 h-5" />
        </span>
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">{badge}</span>
      </div>
      <p className="mt-5 text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </Card>
  );
}

export default function DashboardPage() {
  return (
    <div className="max-w-7xl mx-auto space-y-7 pb-20">
      {/* Header section */}
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p className="text-sm text-muted-foreground">Chào buổi sáng, Host</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Club Manager <span className="text-muted-foreground/60">/ Tổng quan</span></h1>
        </div>
        <Link href="/events/new">
          <Button title="Tạo sự kiện mới" icon={Plus} />
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Users} label="Tổng thành viên" value="128" note="12 người mới tháng này" badge="+10.3%" />
        <StatCard icon={CalendarDays} label="Buổi chơi tháng này" value="18" note="Tăng 3 buổi so với tháng trước" badge="+20%" tone="orange" />
        <StatCard icon={CircleDollarSign} label="Doanh thu tháng này" value="24.8M" note="Mục tiêu tháng: 30M" badge="82.6%" tone="purple" />
        <StatCard icon={WalletCards} label="Cần xử lý" value="07" note="3 gia hạn · 4 công nợ" badge="Xem ngay" tone="blue" />
      </div>

      {/* Schedule & Chart section */}
      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.8fr]">
        <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm sm:p-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold">Lịch sắp tới</h2>
              <p className="mt-1 text-sm text-muted-foreground">Các sự kiện trong 7 ngày tới</p>
            </div>
            <Link href="/events" className="hidden text-sm font-medium text-primary sm:block">Xem lịch ↗</Link>
          </div>
          <div className="mt-5 flex flex-col gap-3">
            {schedule.map((item) => (
              <div key={item.day} className="flex items-center gap-3 rounded-2xl border border-border/60 p-3 sm:gap-4">
                <div className={`flex size-14 shrink-0 flex-col items-center justify-center rounded-2xl text-xs font-semibold ${item.tone === 'orange' ? 'bg-orange-100 text-orange-700' : item.tone === 'purple' ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'}`}>
                  <span>THÁNG 6</span>
                  <strong className="text-2xl leading-6">{item.day}</strong>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{item.title}</p>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{item.tag}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">◷ {item.time} <span className="mx-1">·</span> {item.place}</p>
                </div>
                <div className="hidden text-right sm:block">
                  <p className="font-semibold">{item.registered}</p>
                  <p className="text-xs text-muted-foreground">đã đăng ký</p>
                </div>
                <MoreHorizontal className="text-muted-foreground w-5 h-5" />
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm sm:p-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold">Tổng quan hoạt động</h2>
              <p className="mt-1 text-sm text-muted-foreground">Doanh thu & lượt chơi</p>
            </div>
          </div>
          <p className="mt-6 text-3xl font-semibold">148.2M</p>
          <p className="mt-1 text-xs text-emerald-700">↗ 12.8% so với kỳ trước</p>
          <div className="mt-7 flex h-40 items-end gap-2 border-b border-border/70 px-1">
            {[38, 52, 45, 62, 48, 75, 66].map((height, i) => (
              <div key={i} className="flex flex-1 items-end gap-1 h-full">
                <div className="w-1/2 rounded-t bg-emerald-200" style={{ height: `${height * .62}%` }} />
                <div className="w-1/2 rounded-t bg-emerald-700" style={{ height: `${height}%` }} />
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-between text-[10px] text-muted-foreground">
            <span>Thg 12</span><span>Thg 1</span><span>Thg 2</span><span>Thg 3</span><span>Thg 4</span><span>Thg 5</span><span>Thg 6</span>
          </div>
        </section>
      </div>

      {/* Members & Rankings section */}
      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.8fr]">
        <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Thành viên gần đây</h2>
              <p className="mt-1 text-sm text-muted-foreground">Danh sách hoạt động mới nhất</p>
            </div>
            <Link href="/clubs" className="text-sm font-medium text-primary">Tất cả CLB ↗</Link>
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[580px] text-left text-sm">
              <thead className="border-b text-xs text-muted-foreground">
                <tr>
                  <th className="pb-3 font-medium">THÀNH VIÊN</th>
                  <th className="pb-3 font-medium">GÓI HỘI VIÊN</th>
                  <th className="pb-3 font-medium">TRẠNG THÁI</th>
                  <th className="pb-3 text-right font-medium">CÒN LẠI</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.name} className="border-b last:border-0">
                    <td className="py-4 font-medium flex items-center">
                      <span className="mr-3 inline-flex size-8 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700">
                        {member.name.split(' ').map(n => n[0]).slice(-2).join('')}
                      </span>
                      {member.name}
                    </td>
                    <td className="py-4 text-muted-foreground">{member.package}</td>
                    <td className="py-4"><span className="rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700">{member.status}</span></td>
                    <td className="py-4 text-right font-semibold text-emerald-700">{member.left}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Bảng xếp hạng</h2>
              <p className="mt-1 text-sm text-muted-foreground">Top thành viên tháng 6</p>
            </div>
            <Trophy className="text-amber-500 w-5 h-5" />
          </div>
          <div className="mt-5 flex flex-col gap-4">
            {['Nguyễn Minh Anh', 'Trần Quốc Bảo', 'Lê Hoàng Nam'].map((name, i) => (
              <div key={name} className="flex items-center gap-3">
                <span className="flex size-7 items-center justify-center rounded-full bg-amber-100 text-xs font-semibold text-amber-700">{i + 1}</span>
                <span className="flex size-8 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700">{name.split(' ').slice(-2).map(n => n[0]).join('')}</span>
                <span className="flex-1 text-sm font-medium">{name}</span>
                <b className="text-sm text-emerald-700">{92 - i * 7}%</b>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}