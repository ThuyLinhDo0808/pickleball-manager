'use client';
import CreateEventView from '@/components/CreateEventView';

// "Tạo lịch chơi hàng tuần": the club's regular play, repeated for N weeks.
export default function CreateWeeklyPage() {
  return <CreateEventView weekly />;
}
