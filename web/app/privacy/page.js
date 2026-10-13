'use client';
import LegalDoc from '@/components/LegalDoc';
import { PRIVACY_SECTIONS } from '@/lib/legal';

export default function PrivacyPage() {
  return <LegalDoc kind="privacy" count={PRIVACY_SECTIONS} />;
}
