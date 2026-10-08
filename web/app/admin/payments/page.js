'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Moved into the owner console.
export default function AdminPaymentsRedirect() {
  const router = useRouter();
  useEffect(() => router.replace('/owner/payments'), [router]);
  return null;
}
