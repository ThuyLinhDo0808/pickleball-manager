'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Top 10 cộng đồng uy tín moved into Báo lỗi / Liên hệ nhà phát triển (/contact).
export default function FeaturedPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/contact?top10=1');
  }, [router]);
  return null;
}
