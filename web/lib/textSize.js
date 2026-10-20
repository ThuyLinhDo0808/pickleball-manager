// Text size chosen by the viewer (A / A+ / A++), kept in this browser only. Every size in
// the app is in rem, so changing the root font size makes text, buttons and spacing bigger.
export const TEXT_SIZES = [
  { key: 'normal', percent: 100, label: 'A' },
  { key: 'large', percent: 115, label: 'A+' },
  { key: 'xl', percent: 130, label: 'A++' },
];
export const TEXT_SIZE_KEY = 'pickleball_text_size';

export function readTextSize() {
  try {
    const v = localStorage.getItem(TEXT_SIZE_KEY);
    return TEXT_SIZES.some((s) => s.key === v) ? v : 'normal';
  } catch {
    return 'normal';
  }
}

export function applyTextSize(key) {
  const s = TEXT_SIZES.find((x) => x.key === key) || TEXT_SIZES[0];
  document.documentElement.style.fontSize = s.percent === 100 ? '' : `${s.percent}%`;
  document.documentElement.dataset.textSize = s.key;
}

export function saveTextSize(key) {
  try {
    localStorage.setItem(TEXT_SIZE_KEY, key);
  } catch {}
  applyTextSize(key);
}

// Runs in <head> before the page paints, so a big size does not flash small first.
export const TEXT_SIZE_BOOT = `try{var k=localStorage.getItem('${TEXT_SIZE_KEY}');var p={large:'115%',xl:'130%'}[k];if(p){document.documentElement.style.fontSize=p;document.documentElement.dataset.textSize=k;}}catch(e){}`;
