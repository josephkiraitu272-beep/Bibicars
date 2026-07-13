/**
 * LeadFormPublicPage — high-converting, branded, MULTI-STEP lead form.
 *
 * Classic full-screen lead-gen wizard: one focused question group per step,
 * big tappable option cards / chips, catalog-driven Brand→Model dropdowns
 * (same data as the homepage), BG phone validation (same rule as the site
 * lead form), animated success state, progress bar, benefits & trust,
 * mobile-first. Auto-captures UTM / fbclid / gclid / referrer / device
 * (hidden), fires view/start analytics + Meta Pixel / GA4 / Google Ads on
 * success.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL;

const UI = {
  en: { next: 'Continue', back: 'Back', send: 'Get my offer', sending: 'Sending…',
        step: 'Step', of: 'of', required: 'Please fill this in', other: 'Other',
        yes: 'Yes', no: 'No', error: 'Something went wrong. Please try again.',
        unavailable: 'This form is not available.', securedBy: 'Secured form',
        selectBrand: 'Select brand', selectModel: 'Select model',
        brandFirst: 'Choose a brand first', search: 'Search…', noResults: 'No results',
        phoneInvalid: 'Enter a valid phone: +359 and 9 digits', successTitle: 'Request received!' },
  bg: { next: 'Продължи', back: 'Назад', send: 'Получи оферта', sending: 'Изпращане…',
        step: 'Стъпка', of: 'от', required: 'Моля, попълнете това', other: 'Друго',
        yes: 'Да', no: 'Не', error: 'Възникна грешка. Опитайте отново.',
        unavailable: 'Тази форма не е достъпна.', securedBy: 'Защитена форма',
        selectBrand: 'Изберете марка', selectModel: 'Изберете модел',
        brandFirst: 'Първо изберете марка', search: 'Търсене…', noResults: 'Няма резултати',
        phoneInvalid: 'Въведете валиден номер: +359 и 9 цифри', successTitle: 'Заявката е приета!' },
  uk: { next: 'Далі', back: 'Назад', send: 'Отримати пропозицію', sending: 'Надсилання…',
        step: 'Крок', of: 'з', required: 'Будь ласка, заповніть це', other: 'Інше',
        yes: 'Так', no: 'Ні', error: 'Сталася помилка. Спробуйте ще раз.',
        unavailable: 'Ця форма недоступна.', securedBy: 'Захищена форма',
        selectBrand: 'Оберіть марку', selectModel: 'Оберіть модель',
        brandFirst: 'Спочатку оберіть марку', search: 'Пошук…', noResults: 'Немає результатів',
        phoneInvalid: 'Введіть коректний номер: +359 та 9 цифр', successTitle: 'Заявку прийнято!' },
};

const STEP_TITLES = {
  intent:  { en: 'Where are you looking?', bg: 'Откъде търсите?', uk: 'Звідки шукаєте авто?' },
  vehicle: { en: 'Your car preferences', bg: 'Вашите предпочитания', uk: 'Ваші побажання щодо авто' },
  budget:  { en: 'Your budget', bg: 'Вашият бюджет', uk: 'Ваш бюджет' },
  extra:   { en: 'A few more details', bg: 'Още няколко детайла', uk: 'Ще кілька деталей' },
  contact: { en: 'Where should we send your offer?', bg: 'Как да се свържем с вас?', uk: 'Як з вами звʼязатися?' },
};
const GROUP_ORDER = ['intent', 'vehicle', 'budget', 'extra', 'contact'];

const BG_PHONE_RE = /^\+359\d{9}$/;
// Lock the "+359" prefix, allow only up to 9 digits after it (same UX as the site form).
function normalizeBgPhone(input) {
  let v = input || '';
  if (!v.startsWith('+359')) v = '+359' + v.replace(/^\+?3?5?9?/, '').replace(/\D/g, '');
  else v = '+359' + v.slice(4).replace(/\D/g, '').slice(0, 9);
  return v.slice(0, 13);
}

function readQuery() {
  const p = new URLSearchParams(window.location.search);
  const g = (k) => p.get(k) || '';
  return {
    utm: { utm_source: g('utm_source'), utm_medium: g('utm_medium'), utm_campaign: g('utm_campaign'),
           utm_content: g('utm_content'), utm_term: g('utm_term') },
    fbclid: g('fbclid'), gclid: g('gclid'),
  };
}
function detectDevice() {
  const u = (navigator.userAgent || '').toLowerCase();
  if (/iphone|android|mobile|ipod/.test(u)) return 'mobile';
  if (/ipad|tablet/.test(u)) return 'tablet';
  return 'desktop';
}
function firePixels(tracking) {
  try {
    const t = tracking || {};
    if (t.meta_pixel_id) {
      if (!window.fbq) {
        /* eslint-disable */
        !(function (f, b, e, v, n, t2, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = []; t2 = b.createElement(e); t2.async = !0; t2.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t2, s); })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
        /* eslint-enable */
        window.fbq('init', t.meta_pixel_id);
      }
      window.fbq('track', 'Lead');
    }
    if (t.ga4_measurement_id || t.google_ads_conversion_id) {
      const gid = t.ga4_measurement_id || t.google_ads_conversion_id;
      if (!window.gtag) {
        const s = document.createElement('script'); s.async = true; s.src = `https://www.googletagmanager.com/gtag/js?id=${gid}`; document.head.appendChild(s);
        window.dataLayer = window.dataLayer || []; window.gtag = function () { window.dataLayer.push(arguments); }; window.gtag('js', new Date());
        if (t.ga4_measurement_id) window.gtag('config', t.ga4_measurement_id);
        if (t.google_ads_conversion_id) window.gtag('config', t.google_ads_conversion_id);
      }
      if (t.ga4_measurement_id) window.gtag('event', 'generate_lead');
      if (t.google_ads_conversion_id && t.google_ads_conversion_label) window.gtag('event', 'conversion', { send_to: `${t.google_ads_conversion_id}/${t.google_ads_conversion_label}` });
    }
  } catch (e) { /* never break UX */ }
}

/* ── Searchable dropdown (used for catalog Brand / Model) ── */
function SearchSelect({ value, onChange, options, placeholder, disabled, disabledHint, ui, accent, testid }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef(null);
  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? options.filter((o) => o.name.toLowerCase().includes(s)) : options;
  }, [q, options]);
  return (
    <div ref={ref} className="relative">
      <button type="button" disabled={disabled} data-testid={testid}
        onClick={() => { if (!disabled) setOpen((o) => !o); }}
        className="flex w-full items-center justify-between rounded-xl border bg-white px-4 py-3.5 text-left text-[16px] outline-none transition disabled:cursor-not-allowed disabled:bg-[#F6F6F4] disabled:text-[#B4B4B0]"
        style={{ borderColor: open ? accent : '#E2E2E2', color: value ? '#1a1a18' : '#9a9a96' }}>
        <span className="truncate">{disabled ? (disabledHint || placeholder) : (value || placeholder)}</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9a9a96" strokeWidth="2" className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}><path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && !disabled && (
        <div className="absolute z-30 mt-2 max-h-[280px] w-full overflow-hidden rounded-xl border border-[#E6E6E3] bg-white shadow-[0_16px_40px_rgba(0,0,0,0.14)]">
          <div className="border-b border-[#F0F0EE] p-2">
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={ui.search}
              className="w-full rounded-lg bg-[#F6F6F4] px-3 py-2 text-[14px] outline-none" />
          </div>
          <div className="max-h-[220px] overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-4 py-3 text-[14px] text-[#9a9a96]">{ui.noResults}</div>
            ) : filtered.map((o) => (
              <button key={o.name} type="button" data-testid={`${testid}-opt-${o.name}`}
                onClick={() => { onChange(o.name); setOpen(false); setQ(''); }}
                className="flex w-full items-center justify-between px-4 py-2.5 text-left text-[15px] hover:bg-[#FAFAF8]"
                style={{ color: '#1a1a18', background: value === o.name ? `${accent}14` : 'transparent' }}>
                <span className="truncate">{o.name}</span>
                {typeof o.count === 'number' && o.count > 0 ? <span className="ml-2 shrink-0 text-[11px] text-[#a8a8a4]">{o.count}</span> : null}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function LeadFormPublicPage() {
  const { slug } = useParams();
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [values, setValues] = useState({});
  const [hp, setHp] = useState('');
  const [errors, setErrors] = useState({});
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState('');
  const [brands, setBrands] = useState([]);
  const [modelsByBrand, setModelsByBrand] = useState({});
  const renderedAt = useRef(Date.now());
  const startedRef = useRef(false);
  const ctx = useMemo(readQuery, []);

  const lang = form?.language || 'en';
  const ui = UI[lang] || UI.en;
  const settings = form?.settings || {};
  const accent = settings.accent_color || '#FEAE00';

  const hasCatalogFields = useMemo(() => (form?.fields || []).some((f) => f.widget === 'catalog_brand' || f.widget === 'catalog_model'), [form]);

  // Staff preview mode (?preview=1): lets the admin open a DRAFT form from the
  // builder. The shared axios auth header carries the staff JWT so the backend
  // authorises the draft render. We also skip analytics tracking in this mode.
  const isPreview = useMemo(() => {
    try { return new URLSearchParams(window.location.search).get('preview') != null; }
    catch { return false; }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await axios.get(`${API}/api/public/forms/${slug}`, {
          params: isPreview ? { preview: 1 } : undefined,
        });
        if (!alive) return;
        setForm(data.form);
        renderedAt.current = Date.now();
        if (!isPreview) {
          axios.post(`${API}/api/public/forms/${slug}/track`, {
            event: 'view', utm: ctx.utm, fbclid: ctx.fbclid, gclid: ctx.gclid,
            referrer: document.referrer, device: detectDevice(), language: data.form.language,
          }).catch(() => {});
        }
      } catch (e) { if (alive) setNotFound(true); } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [slug, ctx, isPreview]);

  // Catalog brands (same source as the homepage / catalog filter).
  useEffect(() => {
    if (!hasCatalogFields) return undefined;
    let alive = true;
    (async () => {
      try {
        const { data } = await axios.get(`${API}/api/public/brands`);
        if (alive && Array.isArray(data?.data)) setBrands(data.data.filter((b) => b.name));
      } catch { /* keep empty */ }
    })();
    return () => { alive = false; };
  }, [hasCatalogFields]);

  const loadModels = async (brand) => {
    if (!brand || modelsByBrand[brand]) return;
    try {
      const { data } = await axios.get(`${API}/api/public/models`, { params: { brand } });
      if (Array.isArray(data?.data)) setModelsByBrand((m) => ({ ...m, [brand]: data.data.filter((x) => x.name) }));
    } catch { setModelsByBrand((m) => ({ ...m, [brand]: [] })); }
  };

  const steps = useMemo(() => {
    if (!form) return [];
    const fields = (form.fields || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    if (settings.layout === 'single') return [{ group: 'all', fields }];
    const byGroup = {};
    fields.forEach((f) => { const g = f.group || 'extra'; (byGroup[g] = byGroup[g] || []).push(f); });
    const out = [];
    GROUP_ORDER.forEach((g) => { if (byGroup[g]?.length) out.push({ group: g, fields: byGroup[g] }); });
    Object.keys(byGroup).forEach((g) => { if (!GROUP_ORDER.includes(g)) out.push({ group: g, fields: byGroup[g] }); });
    return out.length ? out : [{ group: 'all', fields }];
  }, [form, settings.layout]);

  const total = steps.length;
  const isLast = step >= total - 1;
  const cur = steps[step] || { fields: [] };

  const fireStart = () => {
    if (startedRef.current) return; startedRef.current = true;
    axios.post(`${API}/api/public/forms/${slug}/track`, { event: 'start', utm: ctx.utm, language: lang, device: detectDevice() }).catch(() => {});
  };
  const setVal = (key, v) => { fireStart(); setValues((s) => ({ ...s, [key]: v })); setErrors((e) => ({ ...e, [key]: undefined })); };
  const setBrandVal = (key, v) => {
    fireStart();
    setValues((s) => ({ ...s, [key]: v, model: undefined }));
    setErrors((e) => ({ ...e, [key]: undefined }));
    loadModels(v);
  };
  const setPhoneVal = (key, raw) => { const v = normalizeBgPhone(raw); setVal(key, v); };

  const validateStep = () => {
    const errs = {};
    cur.fields.forEach((f) => {
      const v = values[f.key];
      const empty = v === undefined || v === null || (typeof v === 'string' && !v.trim()) || v === false;
      if (f.required && empty) errs[f.key] = ui.required;
      if (f.type === 'phone' && !empty && !BG_PHONE_RE.test(String(v).replace(/\s/g, ''))) errs[f.key] = ui.phoneInvalid;
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const next = () => { if (validateStep()) { setStep((s) => Math.min(s + 1, total - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); } };
  const back = () => setStep((s) => Math.max(0, s - 1));

  const submit = async () => {
    if (!validateStep()) return;
    setServerError(''); setSubmitting(true);
    try {
      const { data } = await axios.post(`${API}/api/public/forms/${slug}/submit`, {
        values, _hp: hp, _t: renderedAt.current, utm: ctx.utm, fbclid: ctx.fbclid, gclid: ctx.gclid,
        referrer: document.referrer, landing_url: window.location.href, language: lang, device: detectDevice(),
      }, { params: isPreview ? { preview: 1 } : undefined });
      firePixels(form.tracking);
      const ty = data.thankyou || form.thankyou || { behaviour: 'message' };
      if (ty.behaviour === 'redirect' && ty.redirect_url) { window.location.href = ty.redirect_url; return; }
      setDone(true); window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      const status = err?.response?.status;
      const d = err?.response?.data?.detail;
      // Object-shape error from the backend (preferred): {error, message?, fields?}
      if (d && typeof d === 'object') {
        if (d.error === 'missing_required') {
          const errs = {}; (d.fields || []).forEach((k) => { errs[k] = ui.required; }); setErrors(errs);
          const firstMissing = (d.fields || [])[0];
          if (firstMissing) {
            const idx = steps.findIndex((s) => s.fields.some((f) => f.key === firstMissing));
            if (idx >= 0) setStep(idx);
          }
          setServerError(d.message || ui.required);
        } else if (d.error === 'invalid_phone') {
          setErrors({ phone: ui.phoneInvalid });
          const idx = steps.findIndex((s) => s.fields.some((f) => f.key === 'phone'));
          if (idx >= 0) setStep(idx);
          setServerError(d.message || ui.phoneInvalid);
        } else if (d.error === 'gdpr_required') {
          setErrors({ gdpr: ui.required });
          setServerError(d.message || ui.required);
        } else {
          // not_published / missing_contact / server_error / closed / ...
          setServerError(d.message || ui.error);
        }
      } else if (typeof d === 'string' && d.trim()) {
        // Legacy string detail — surface it verbatim so admins/users see WHY.
        setServerError(d);
      } else if (err?.message === 'Network Error' || !err?.response) {
        setServerError(`Network error — could not reach the server. Please check your connection and try again.`);
      } else {
        setServerError(`${ui.error}${status ? ` (HTTP ${status})` : ''}`);
      }
    } finally { setSubmitting(false); }
  };

  // ---- widgets ----
  const Card = ({ selected, onClick, children, testid }) => (
    <button type="button" onClick={onClick} data-testid={testid}
      className="group relative flex items-center justify-center rounded-2xl border-2 px-4 py-4 text-center text-[15px] font-medium transition-all active:scale-[0.98]"
      style={{ borderColor: selected ? accent : '#E6E6E3', background: selected ? `${accent}14` : '#fff', color: '#1a1a18' }}>
      {children}
      {selected && (
        <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full" style={{ background: accent }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1a1a18" strokeWidth="3"><path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
      )}
    </button>
  );

  const renderField = (f) => {
    const val = values[f.key];
    const w = f.widget || 'input';

    if (w === 'catalog_brand') {
      const opts = brands.length ? brands : [];
      return <SearchSelect value={val || ''} onChange={(v) => setBrandVal(f.key, v)} options={opts}
        placeholder={ui.selectBrand} ui={ui} accent={accent} testid={`lf-field-${f.key}`} />;
    }
    if (w === 'catalog_model') {
      const brand = values.brand;
      const opts = brand ? (modelsByBrand[brand] || []) : [];
      return <SearchSelect value={val || ''} onChange={(v) => setVal(f.key, v)} options={opts}
        placeholder={ui.selectModel} disabled={!brand} disabledHint={ui.brandFirst}
        ui={ui} accent={accent} testid={`lf-field-${f.key}`} />;
    }
    if (w === 'cards') {
      const opts = (f.options || []).map((o) => (typeof o === 'object' ? o : { value: o, label: o }));
      return (
        <div className="grid grid-cols-2 gap-2.5">
          {opts.map((o) => (
            <Card key={o.value} selected={val === o.value} onClick={() => setVal(f.key, o.value)} testid={`lf-opt-${f.key}-${o.value}`}>{o.label}</Card>
          ))}
        </div>
      );
    }
    if (w === 'toggle') {
      return (
        <div className="grid grid-cols-2 gap-2.5">
          <Card selected={val === true} onClick={() => setVal(f.key, true)} testid={`lf-opt-${f.key}-yes`}>{ui.yes}</Card>
          <Card selected={val === false} onClick={() => setVal(f.key, false)} testid={`lf-opt-${f.key}-no`}>{ui.no}</Card>
        </div>
      );
    }
    if (w === 'chips') {
      const chips = (f.buckets && f.buckets.length)
        ? f.buckets
        : (f.options || []).map((o) => (typeof o === 'object' ? o : { value: o, label: o }));
      return (
        <div className="flex flex-wrap gap-2">
          {chips.map((c) => {
            const sel = String(val) === String(c.value);
            return (
              <button key={c.value} type="button" onClick={() => setVal(f.key, c.value)} data-testid={`lf-opt-${f.key}-${c.value}`}
                className="rounded-full border-2 px-4 py-2 text-[14px] font-medium transition active:scale-95"
                style={{ borderColor: sel ? accent : '#E6E6E3', background: sel ? `${accent}14` : '#fff', color: '#1a1a18' }}>
                {c.label}
              </button>
            );
          })}
        </div>
      );
    }
    if (f.type === 'phone') {
      return (
        <div className="flex items-center gap-2 rounded-xl border bg-white px-3.5 py-3 transition" style={{ borderColor: errors[f.key] ? '#e5484d' : '#E2E2E2' }}>
          <img src="/about-us/emojione-v1-flag-for-bulgaria.svg" alt="" width={22} height={16} className="shrink-0" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          <input type="tel" inputMode="tel" maxLength={13} value={val || '+359'} data-testid={`lf-field-${f.key}`}
            onChange={(e) => setPhoneVal(f.key, e.target.value)} onFocus={() => { if (!val) setPhoneVal(f.key, '+359'); }}
            placeholder="+359" className="w-full bg-transparent text-[16px] outline-none" style={{ caretColor: accent }} />
        </div>
      );
    }
    if (w === 'textarea' || f.type === 'textarea') {
      return <textarea value={val || ''} onChange={(e) => setVal(f.key, e.target.value)} placeholder={f.placeholder} rows={4}
        data-testid={`lf-field-${f.key}`} onFocus={fireStart}
        className="w-full rounded-xl border border-[#E2E2E2] bg-white px-4 py-3 text-[15px] outline-none focus:border-[#bbb]" />;
    }
    const type = f.type === 'email' ? 'email' : f.type === 'number' ? 'number' : 'text';
    return <input type={type} value={val || ''} onChange={(e) => setVal(f.key, e.target.value)} placeholder={f.placeholder}
      data-testid={`lf-field-${f.key}`} onFocus={fireStart}
      className="w-full rounded-xl border border-[#E2E2E2] bg-white px-4 py-3.5 text-[16px] outline-none transition focus:border-[#bbb]" />;
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-[#0f0f0e]"><div className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: accent, borderTopColor: 'transparent' }} /></div>;
  if (notFound || !form) return <div className="flex min-h-screen items-center justify-center bg-[#0f0f0e] px-4"><p className="text-center text-white/70">{ui.unavailable}</p></div>;

  const content = form.content || {};
  const headline = settings.hero_headline || content.title;
  const progress = total > 1 ? Math.round(((step + (done ? 1 : 0)) / total) * 100) : (done ? 100 : 0);

  return (
    <div className="min-h-screen w-full bg-[#0f0f0e] font-mazzard antialiased" data-testid="lead-form-public">
      <style>{`
        @keyframes lf-pop { 0% { transform: scale(0.4); opacity: 0; } 60% { transform: scale(1.08); } 100% { transform: scale(1); opacity: 1; } }
        @keyframes lf-check { to { stroke-dashoffset: 0; } }
        @keyframes lf-ring { 0% { transform: scale(0.6); opacity: 0.55; } 100% { transform: scale(2.4); opacity: 0; } }
        @keyframes lf-rise { from { transform: translateY(14px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes lf-confetti { 0% { transform: translateY(0) rotate(0); opacity: 1; } 100% { transform: translateY(-120px) rotate(320deg); opacity: 0; } }
      `}</style>
      <div className="flex min-h-screen w-full flex-col lg:flex-row">
        {/* ─── Brand / hero ─── */}
        <div className="relative overflow-hidden px-5 pt-6 pb-5 text-white sm:px-8 lg:w-[42%] lg:px-12 lg:py-14 lg:flex lg:flex-col lg:justify-center"
          style={{ background: 'linear-gradient(160deg,#141412 0%,#201f1b 55%,#14130f 100%)' }}>
          <div className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full opacity-25 blur-3xl" style={{ background: accent }} />
          <div className="relative mx-auto w-full max-w-[520px]">
            <div className="mb-5 flex items-center justify-between gap-3 lg:mb-8">
              <img src="/bibi-logo.png" alt="BIBI Cars" className="h-7 w-auto brightness-0 invert lg:h-9"
                onError={(e) => { e.currentTarget.outerHTML = "<span style='font-weight:800;font-size:20px;color:#fff'>BIBI<span style='color:" + accent + "'>Cars</span></span>"; }} />
              {settings.trust_badge ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium text-white/90 lg:hidden">
                  <span style={{ color: accent }}>★</span> {settings.trust_badge}
                </span>
              ) : null}
            </div>
            <h1 className="text-[24px] font-extrabold leading-[1.12] tracking-tight sm:text-[28px] lg:text-[40px]">{headline}</h1>
            {content.subtitle ? <p className="mt-2.5 max-w-[42ch] text-[14px] leading-relaxed text-white/65 lg:mt-4 lg:text-[16px]">{content.subtitle}</p> : null}
            {settings.show_benefits && (settings.benefits || []).length ? (
              <ul className="mt-7 hidden space-y-3 lg:block">
                {settings.benefits.map((b, i) => (
                  <li key={i} className="flex items-start gap-3 text-[15px] text-white/85">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full" style={{ background: accent }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#141412" strokeWidth="3"><path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </span>
                    {b}
                  </li>
                ))}
              </ul>
            ) : null}
            {settings.trust_badge ? (
              <div className="mt-8 hidden items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-[13px] font-medium text-white/90 lg:inline-flex">
                <span style={{ color: accent }}>★</span> {settings.trust_badge}
              </div>
            ) : null}
          </div>
        </div>

        {/* ─── Form panel ─── */}
        <div className="flex flex-1 items-center justify-center bg-gradient-to-b from-[#F7F7F5] to-[#ECECEA] px-4 py-8 sm:px-8 lg:py-14">
          <div className="w-full max-w-[480px] pb-[env(safe-area-inset-bottom)]">
            {done ? (
              <div className="relative overflow-hidden rounded-3xl bg-white p-8 text-center shadow-[0_18px_60px_rgba(0,0,0,0.12)]" data-testid="lf-success" style={{ animation: 'lf-pop 0.5s cubic-bezier(0.22,1,0.36,1) both' }}>
                {/* confetti */}
                {[...Array(10)].map((_, i) => (
                  <span key={i} aria-hidden className="absolute top-1/3 h-2 w-2 rounded-[2px]"
                    style={{ left: `${8 + i * 9}%`, background: i % 2 ? accent : '#1a1a18',
                      animation: `lf-confetti ${0.9 + (i % 4) * 0.25}s ease-out ${0.15 + (i % 5) * 0.05}s forwards` }} />
                ))}
                <div className="relative mx-auto mb-5 flex h-20 w-20 items-center justify-center">
                  <span className="absolute inset-0 rounded-full" style={{ background: accent, animation: 'lf-ring 1.4s ease-out 0.2s infinite' }} />
                  <span className="relative flex h-20 w-20 items-center justify-center rounded-full" style={{ background: `${accent}22` }}>
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.6">
                      <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round"
                        style={{ strokeDasharray: 30, strokeDashoffset: 30, animation: 'lf-check 0.5s ease-out 0.35s forwards' }} />
                    </svg>
                  </span>
                </div>
                <p className="text-[22px] font-extrabold leading-tight text-[#1a1a18]" style={{ animation: 'lf-rise 0.5s ease-out 0.3s both' }}>{ui.successTitle}</p>
                <p className="mt-2 text-[15px] leading-relaxed text-[#6b6b68]" style={{ animation: 'lf-rise 0.5s ease-out 0.42s both' }}>{content.success}</p>
              </div>
            ) : (
              <div className="rounded-3xl bg-white p-5 shadow-[0_18px_60px_rgba(0,0,0,0.12)] sm:p-7">
                {settings.show_progress && total > 1 ? (
                  <div className="mb-6">
                    <div className="mb-2 flex items-center justify-between text-[12px] font-medium text-[#8a8a86]">
                      <span>{ui.step} {step + 1} {ui.of} {total}</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#EDEDEA]">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(8, ((step + 1) / total) * 100)}%`, background: accent }} />
                    </div>
                  </div>
                ) : null}

                <h2 className="text-[20px] font-bold leading-snug text-[#1a1a18] sm:text-[22px]">
                  {STEP_TITLES[cur.group]?.[lang] || STEP_TITLES[cur.group]?.en || content.title}
                </h2>

                <div className="mt-5 flex flex-col gap-5">
                  {cur.fields.map((f) => (
                    <div key={f.key}>
                      {!['toggle'].includes(f.widget) ? (
                        <label className="mb-2 block text-[13px] font-semibold text-[#3a3a38]">
                          {f.label}{f.required ? <span style={{ color: '#e5484d' }}> *</span> : null}
                        </label>
                      ) : (
                        <p className="mb-2 text-[15px] font-semibold text-[#1a1a18]">{f.label}{f.required ? <span style={{ color: '#e5484d' }}> *</span> : null}</p>
                      )}
                      {renderField(f)}
                      {errors[f.key] ? <p className="mt-1.5 text-[12px]" style={{ color: '#e5484d' }}>{errors[f.key]}</p> : null}
                    </div>
                  ))}
                </div>

                {/* Honeypot */}
                <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', height: 0, overflow: 'hidden' }}>
                  <input tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} />
                </div>

                {serverError ? <p className="mt-4 rounded-lg px-3 py-2 text-[13px]" style={{ background: '#e5484d18', color: '#e5484d' }}>{serverError}</p> : null}

                <div className="mt-7 flex items-center gap-3">
                  {step > 0 && (
                    <button type="button" onClick={back} data-testid="lf-back"
                      className="rounded-xl border border-[#E2E2E2] px-5 py-3.5 text-[15px] font-semibold text-[#52525B] transition hover:bg-[#FAFAFA] active:scale-[0.98]">
                      {ui.back}
                    </button>
                  )}
                  {isLast ? (
                    <button type="button" onClick={submit} disabled={submitting} data-testid="lf-submit"
                      className="flex-1 rounded-xl px-4 py-3.5 text-[16px] font-bold text-[#1a1a18] shadow-[0_8px_22px_rgba(254,174,0,0.28)] transition hover:brightness-95 active:scale-[0.99] disabled:opacity-60"
                      style={{ background: accent }}>
                      {submitting ? ui.sending : (content.cta || ui.send)}
                    </button>
                  ) : (
                    <button type="button" onClick={next} data-testid="lf-next"
                      className="flex-1 rounded-xl px-4 py-3.5 text-[16px] font-bold text-[#1a1a18] shadow-[0_8px_22px_rgba(254,174,0,0.28)] transition hover:brightness-95 active:scale-[0.99]"
                      style={{ background: accent }}>
                      {ui.next}
                    </button>
                  )}
                </div>
                <p className="mt-4 text-center text-[11px] text-[#a8a8a4]">🔒 {ui.securedBy} · BIBI Cars</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
