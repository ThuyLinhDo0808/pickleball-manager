'use client';
import Link from 'next/link';
import BackButton from '@/components/BackButton';
import { useI18n } from '@/context/I18nContext';
import { LEGAL_EFFECTIVE, LEGAL_VERSION, PRIVACY_CONTACT, PROOF_RETENTION_DAYS } from '@/lib/legal';

// One legal document (Privacy Policy or Terms): sections legal.<p|t><n>t / <n>b in the
// dictionaries. In a body, a line starting with "• " is a list item.
function Body({ text }) {
  const blocks = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('• ')) {
      const last = blocks[blocks.length - 1];
      if (last?.list) last.items.push(line.slice(2));
      else blocks.push({ list: true, items: [line.slice(2)] });
    } else if (line.trim()) blocks.push({ list: false, text: line });
  }
  return blocks.map((b, i) =>
    b.list ? (
      <ul key={i} className="list-disc pl-5 space-y-1 my-2">
        {b.items.map((it, j) => <li key={j}>{it}</li>)}
      </ul>
    ) : (
      <p key={i} className="my-2">{b.text}</p>
    )
  );
}

export default function LegalDoc({ kind, count }) {
  const { t, lang, setLang, langs } = useI18n();
  const prefix = kind === 'privacy' ? 'p' : 't';
  const params = { contact: PRIVACY_CONTACT || t('legal.contactFallback'), proofDays: PROOF_RETENTION_DAYS };
  const title = t(kind === 'privacy' ? 'legal.privacyTitle' : 'legal.termsTitle');
  return (
    <main className="min-h-screen bg-navy-950 text-gray-200">
      <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
        <div className="flex items-center justify-between gap-3 mb-6">
          <BackButton fallback="/" className="!mb-0" />
          <div className="flex gap-1">
            {(langs || ['vi', 'en']).map((l) => (
              <button key={l} type="button" onClick={() => setLang(l)} className={`text-xs rounded-full border px-2.5 py-0.5 ${lang === l ? 'border-lime-400 text-lime-300' : 'border-navy-600 text-gray-400'}`}>{l}</button>
            ))}
          </div>
        </div>
        <h1 className="text-white text-3xl font-bold">{title}</h1>
        <p className="text-gray-400 text-sm mt-1">{t('legal.effective', { date: LEGAL_EFFECTIVE, version: LEGAL_VERSION })}</p>
        <nav className="mt-4 text-sm">
          <Link href={kind === 'privacy' ? '/terms' : '/privacy'} className="text-lime-300 hover:underline">
            {t(kind === 'privacy' ? 'legal.termsTitle' : 'legal.privacyTitle')} →
          </Link>
        </nav>
        <ol className="mt-8 space-y-8 leading-relaxed text-[0.9375rem]">
          {Array.from({ length: count }, (_, i) => i + 1).map((n) => (
            <li key={n} id={`${prefix}${n}`} className="scroll-mt-6">
              <h2 className="text-white text-lg font-semibold">{n}. {t(`legal.${prefix}${n}t`)}</h2>
              <Body text={t(`legal.${prefix}${n}b`, params)} />
            </li>
          ))}
        </ol>
      </div>
    </main>
  );
}
