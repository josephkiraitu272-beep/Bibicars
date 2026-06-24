/**
 * BIBI Cars — ViberButton
 * ------------------------------------------------------------------
 * One-click "message on Viber" straight from the customer / lead card.
 * No API keys, no backend, no integration — just a reliable Viber deep
 * link opened with the phone number from the card:
 *
 *   viber://chat?number=%2B<E164 digits>
 *
 * Works with the Viber desktop & mobile apps. If Viber isn't installed
 * the OS simply ignores the scheme — we still show a hint toast.
 *
 * Variants: "primary" (filled purple pill) · "ghost" (compact) · "icon".
 */

import React from 'react';
import { toast } from 'sonner';

const STR = {
  uk: { viber: 'Viber', opening: 'Відкриваю Viber…', noPhone: 'У клієнта немає номера телефону' },
  en: { viber: 'Viber', opening: 'Opening Viber…', noPhone: 'Customer has no phone number' },
  bg: { viber: 'Viber', opening: 'Отварям Viber…', noPhone: 'Клиентът няма телефонен номер' },
};

// Normalize to E.164-ish: keep leading +, strip everything non-digit.
const toE164 = (p) => {
  const raw = String(p || '').trim();
  const hasPlus = raw.startsWith('+');
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  return (hasPlus ? '+' : '+') + digits; // Viber needs an international number
};

const ViberGlyph = ({ size = 16, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    {/* Speech bubble */}
    <path
      d="M12 2.2c4.8 0 8.5 3.1 8.5 7.4 0 4.3-3.7 7.4-8.5 7.4-.8 0-1.6-.08-2.3-.24L5.3 19.4c-.5.3-1.1-.1-1-.7l.5-2.6C3.2 14.7 2.5 12.9 2.5 11c0-4.9 4.3-8.8 9.5-8.8Z"
      fill="currentColor"
    />
    {/* Handset (knocked-out) */}
    <path
      d="M9.1 6.7c.25-.06.5.05.64.27l.62.96c.13.2.1.46-.07.63l-.36.37c-.1.1-.12.25-.06.38.3.66.84 1.2 1.5 1.5.13.06.28.03.38-.06l.37-.37c.17-.17.43-.2.63-.07l.96.62c.22.14.33.4.27.64-.18.7-.86 1.18-1.58 1.08-1.78-.25-3.5-1.97-3.75-3.75-.1-.72.38-1.4 1.08-1.59Z"
      fill="#fff"
    />
  </svg>
);

const ViberButton = ({
  phone,
  lang = 'uk',
  variant = 'ghost',
  label,
  className = '',
  testId = 'viber-btn',
}) => {
  const L = STR[lang] || STR.en;
  const num = toE164(phone);
  const disabled = !num;

  const open = (e) => {
    if (e) { e.stopPropagation(); e.preventDefault(); }
    if (!num) { toast.error(L.noPhone); return; }
    const href = `viber://chat?number=${encodeURIComponent(num)}`;
    toast.message(L.opening);
    try { window.location.href = href; } catch { /* noop */ }
  };

  const txt = label || L.viber;
  const PURPLE = '#7360F2';

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={open}
        disabled={disabled}
        data-testid={testId}
        title={txt}
        style={{ background: PURPLE }}
        className={`inline-flex items-center justify-center w-9 h-9 rounded-xl text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
      >
        <ViberGlyph size={16} />
      </button>
    );
  }

  if (variant === 'primary') {
    return (
      <button
        type="button"
        onClick={open}
        disabled={disabled}
        data-testid={testId}
        style={{ background: PURPLE }}
        className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
      >
        <ViberGlyph size={16} />
        {txt}
      </button>
    );
  }

  // ghost (default)
  return (
    <button
      type="button"
      onClick={open}
      disabled={disabled}
      data-testid={testId}
      style={{ color: PURPLE, borderColor: 'rgba(115,96,242,0.3)', background: 'rgba(115,96,242,0.08)' }}
      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[12.5px] font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
    >
      <ViberGlyph size={15} className="text-[#7360F2]" />
      <span className="whitespace-nowrap">{txt}</span>
    </button>
  );
};

export default ViberButton;
