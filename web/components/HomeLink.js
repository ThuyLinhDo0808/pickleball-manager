'use client';
import Link from 'next/link';
import { useI18n } from '@/context/I18nContext';
import { useAuth } from '@/context/AuthContext';

// "← Home" for the public pages a player lands on from a shared link (kèo, ticket, survey).
export default function HomeLink() {
  const { t } = useI18n();
  const { user } = useAuth();
  return (
    <Link href={user ? '/home' : '/'} className="text-xs text-gray-300 border border-navy-700 rounded-full px-3 py-1 shrink-0">
      ← {t('hub.backHome')}
    </Link>
  );
}
