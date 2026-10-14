'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import MembersPage, { MEMBER_ROUTES } from '@/components/MembersPage';

// Thành viên ▸ Thành viên cố định. Old links (?tab=…) go to the tab's own page.
export default function Page() {
  const router = useRouter();
  useEffect(() => {
    const want = new URLSearchParams(window.location.search).get('tab');
    if (want && MEMBER_ROUTES[want] && want !== 'fixed') router.replace(MEMBER_ROUTES[want]);
  }, [router]);
  return <MembersPage tab="fixed" />;
}
