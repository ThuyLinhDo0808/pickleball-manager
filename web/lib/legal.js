// Terms / Privacy Policy version. Bump (same value as backend/src/services/privacy.js
// LEGAL_VERSION) when either changes in a way people must accept again.
export const LEGAL_VERSION = '2026-10-12';
export const LEGAL_EFFECTIVE = '12/10/2026';
export const PRIVACY_SECTIONS = 12;
export const TERMS_SECTIONS = 10;
export const PROOF_RETENTION_DAYS = Number(process.env.NEXT_PUBLIC_PROOF_RETENTION_DAYS || 90);
// Where people send privacy requests (optional; otherwise the in-app Feedback button).
export const PRIVACY_CONTACT = process.env.NEXT_PUBLIC_PRIVACY_CONTACT || '';
