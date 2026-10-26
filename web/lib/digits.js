// Score boxes: a text field with inputMode="numeric" + pattern="[0-9]*" opens the 0–9 pad on
// every phone (type="number" still shows letters on some, e.g. iPhone). This keeps only
// the digits typed or pasted, at most `max` of them.
export const digits = (v, max = 2) => String(v ?? '').replace(/\D/g, '').slice(0, max);

// Spread on a score <input>: the number pad, no autofill / autocorrect.
export const NUMPAD = { type: 'text', inputMode: 'numeric', pattern: '[0-9]*', autoComplete: 'off', autoCorrect: 'off', spellCheck: false };
