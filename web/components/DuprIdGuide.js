'use client';
import { useState } from 'react';
import GuideModal from '@/components/ui/GuideModal';
import { useI18n } from '@/context/I18nContext';

// "Hướng dẫn lấy DUPR ID": a link that opens the picture guide (create a DUPR account →
// profile → share → Copy DUPR ID). `label` changes the link text.
export default function DuprIdGuide({ label, className = '' }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={`text-lime-300 underline underline-offset-2 hover:text-lime-200 inline py-3 -my-3 sm:py-0 sm:my-0 ${className}`} onClick={() => setOpen(true)}>
        {label || t('duprGuide.link')}
      </button>
      <GuideModal
        open={open}
        title={t('duprGuide.title')}
        onClose={() => setOpen(false)}
        steps={[1, 2, 3, 4].map((n) => ({ title: t(`duprGuide.s${n}Title`), body: t(`duprGuide.s${n}Body`), image: `/guides/dupr-id/step-${n}.svg` }))}
      />
    </>
  );
}
