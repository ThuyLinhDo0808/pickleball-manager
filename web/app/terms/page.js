'use client';
import LegalDoc from '@/components/LegalDoc';
import { TERMS_SECTIONS } from '@/lib/legal';

export default function TermsPage() {
  return <LegalDoc kind="terms" count={TERMS_SECTIONS} />;
}
