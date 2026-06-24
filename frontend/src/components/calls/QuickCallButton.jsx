/**
 * BIBI Cars — QuickCallButton (click-to-call via Ringostat)
 * ------------------------------------------------------------------
 * One-click outbound call straight from the customer / lead card.
 *
 *   POST /api/ringostat/callback { phone }   (manager_or_admin)
 *     → Ringostat rings the manager's SIP extension first, then dials
 *       the customer. The manager's extension is resolved server-side
 *       from staff.extension, so the UI only sends the phone.
 *
 * Graceful degradation — the button always "does something":
 *   • Ringostat not configured / no extension on file  → falls back to
 *     the device dialer (tel:) and tells the manager why.
 *   • Network / upstream error                          → error toast.
 *
 * Variants:
 *   • "primary"  — filled gold/black pill (action bars, next-action card)
 *   • "ghost"    — compact icon+label button (contact card next to phone)
 *   • "icon"     — round icon-only button (tight toolbars)
 */

import React, { useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { PhoneCall, CircleNotch } from '@phosphor-icons/react';
import { API_URL } from '../../App';

const STR = {
  uk: {
    call: 'Дзвінок', callNow: 'Подзвонити', calling: 'Дзвоню…',
    started: 'Дзвінок ініційовано — спершу задзвонить ваш телефон',
    notConfigured: 'Ringostat не налаштовано — відкриваю системний дзвінок',
    noExt: 'У вас не вказано SIP-розширення — відкриваю системний дзвінок',
    noPhone: 'У клієнта немає номера телефону', err: 'Не вдалося ініціювати дзвінок',
  },
  en: {
    call: 'Call', callNow: 'Call', calling: 'Calling…',
    started: 'Call initiated — your phone will ring first',
    notConfigured: 'Ringostat not configured — opening device dialer',
    noExt: 'No SIP extension on file — opening device dialer',
    noPhone: 'Customer has no phone number', err: 'Could not initiate the call',
  },
  bg: {
    call: 'Обаждане', callNow: 'Обади се', calling: 'Звъня…',
    started: 'Обаждането е стартирано — първо ще позвъни вашият телефон',
    notConfigured: 'Ringostat не е настроен — отварям системния набор',
    noExt: 'Нямате SIP разширение — отварям системния набор',
    noPhone: 'Клиентът няма телефонен номер', err: 'Неуспешно стартиране на обаждането',
  },
};

const normalize = (p) => String(p || '').replace(/[^\d+]/g, '');

const QuickCallButton = ({
  phone,
  lang = 'uk',
  variant = 'ghost',
  label,                 // optional override
  className = '',
  testId = 'quick-call-btn',
  onAfterCall = () => {},
}) => {
  const L = STR[lang] || STR.en;
  const [busy, setBusy] = useState(false);
  const ph = normalize(phone);
  const disabled = !ph;

  const fallbackTel = () => {
    try { window.location.href = `tel:${ph}`; } catch { /* noop */ }
  };

  const dial = async (e) => {
    if (e) { e.stopPropagation(); e.preventDefault(); }
    if (!ph) { toast.error(L.noPhone); return; }
    setBusy(true);
    try {
      await axios.post(`${API_URL}/api/ringostat/callback`, { phone: ph });
      toast.success(L.started);
      onAfterCall();
    } catch (err) {
      const detail = String(err?.response?.data?.detail || '').toLowerCase();
      const status = err?.response?.status;
      if (status === 400 && (detail.includes('not configured') || detail.includes('credentials'))) {
        toast.message(L.notConfigured);
        fallbackTel();
      } else if (status === 400 && detail.includes('extension')) {
        toast.message(L.noExt);
        fallbackTel();
      } else {
        toast.error(err?.response?.data?.detail || L.err);
      }
    } finally {
      setBusy(false);
    }
  };

  const Icon = busy ? CircleNotch : PhoneCall;
  const txt = label || (variant === 'primary' ? L.callNow : L.call);

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={dial}
        disabled={disabled || busy}
        data-testid={testId}
        title={txt}
        className={`inline-flex items-center justify-center w-9 h-9 rounded-xl bg-[#16A34A] text-white hover:bg-[#15803D] transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
      >
        <Icon size={16} weight="bold" className={busy ? 'animate-spin' : ''} />
      </button>
    );
  }

  if (variant === 'primary') {
    return (
      <button
        type="button"
        onClick={dial}
        disabled={disabled || busy}
        data-testid={testId}
        className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#16A34A] text-white text-sm font-semibold hover:bg-[#15803D] transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
      >
        <Icon size={16} weight="bold" className={busy ? 'animate-spin' : ''} />
        {busy ? L.calling : txt}
      </button>
    );
  }

  // ghost (default)
  return (
    <button
      type="button"
      onClick={dial}
      disabled={disabled || busy}
      data-testid={testId}
      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#16A34A]/30 bg-[#F0FDF4] text-[#15803D] text-[12.5px] font-medium hover:bg-[#DCFCE7] transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
    >
      <Icon size={15} weight="bold" className={busy ? 'animate-spin' : ''} />
      <span className="whitespace-nowrap">{busy ? L.calling : txt}</span>
    </button>
  );
};

export default QuickCallButton;
