/**
 * BIBI Cars — Wave 2B — LeadNameFixerButton
 * ==========================================
 *
 * Small pill/button rendered inline where a lead's name is missing. Clicking
 * opens a compact popover with:
 *   1. A short human-readable explanation of WHY the name is missing
 *      (source: ringostat/viber/webform/…) — fetched from
 *      GET /api/admin/leads/:id/name-diagnostics
 *   2. An "AI detect from call transcript" action that calls
 *      POST /api/admin/leads/:id/detect-name — shows the suggestion for
 *      review, then applies via ?apply=true (also updates parent list).
 *   3. A "manual edit" inline form (firstName/lastName) that PUTs to
 *      /api/leads/:id — the classic path.
 *
 * Stops event propagation on all handlers so the row's default click
 * (opening Lead360) never fires when the manager just wants to fix a name.
 */
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import {
  ShieldWarning, PencilSimple, Brain, X, CheckCircle,
  Sparkle, Info, ArrowRight,
} from '@phosphor-icons/react';
import { API_URL } from '../../api-config';
import { useLang } from '../../i18n';

const authHeaders = () => {
  try { const t = localStorage.getItem('token'); return t ? { Authorization: `Bearer ${t}` } : {}; }
  catch { return {}; }
};

const LABELS = {
  en: {
    missing: 'Add name',
    why_head: 'Why is the name missing?',
    ai_head: 'Try AI detection',
    ai_run: 'Detect from call transcript',
    ai_running: 'Analysing transcripts…',
    ai_apply: 'Apply suggestion',
    ai_dismiss: 'Ignore',
    manual_head: 'Or enter manually',
    first_name: 'First name',
    last_name: 'Last name',
    save: 'Save',
    saving: 'Saving…',
    no_name_found: 'No self-introduction detected in any transcript.',
    no_calls: 'This lead has no linked calls yet.',
    no_transcripts: 'Run Call Intelligence on the linked calls first.',
    suggestion_head: 'AI suggested',
    based_on: 'based on call',
    conf: 'confidence',
    source_regex: 'regex heuristic',
    source_openai: 'OpenAI extraction',
  },
  uk: {
    missing: "Додати ім'я",
    why_head: "Чому ім'я відсутнє?",
    ai_head: 'Спробувати AI',
    ai_run: 'Визначити з розшифровки',
    ai_running: 'Аналізуємо…',
    ai_apply: 'Застосувати',
    ai_dismiss: 'Пропустити',
    manual_head: 'Або введіть вручну',
    first_name: "Ім'я",
    last_name: 'Прізвище',
    save: 'Зберегти',
    saving: 'Зберігаємо…',
    no_name_found: 'У жодній розшифровці клієнт не назвав своє ім’я.',
    no_calls: 'До цього ліда ще не прив’язані дзвінки.',
    no_transcripts: 'Спершу запустіть Call Intelligence.',
    suggestion_head: 'AI пропонує',
    based_on: 'по дзвінку',
    conf: 'впевненість',
    source_regex: 'регулярний вираз',
    source_openai: 'OpenAI',
  },
  bg: {
    missing: 'Добави име',
    why_head: 'Защо липсва името?',
    ai_head: 'AI детекция',
    ai_run: 'Разчети от разговор',
    ai_running: 'Анализираме…',
    ai_apply: 'Приложи',
    ai_dismiss: 'Пропусни',
    manual_head: 'Или въведи ръчно',
    first_name: 'Име',
    last_name: 'Фамилия',
    save: 'Запази',
    saving: 'Записваме…',
    no_name_found: 'В нито един разговор клиентът не се е представил.',
    no_calls: 'Все още няма свързани обаждания.',
    no_transcripts: 'Първо стартирайте Call Intelligence.',
    suggestion_head: 'AI предлага',
    based_on: 'от разговор',
    conf: 'увереност',
    source_regex: 'регулярен израз',
    source_openai: 'OpenAI',
  },
};

const pick = (lang) => LABELS[lang] || LABELS.en;

export default function LeadNameFixerButton({ leadId, phone, onSaved, size = 'xs' }) {
  const { lang } = useLang();
  const L = pick(lang);
  const rootRef = useRef(null);
  const btnRef = useRef(null);
  const popRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [popPos, setPopPos] = useState({ top: 0, left: 0, width: 340, mobile: false });
  const [diag, setDiag] = useState(null);
  const [loadingDiag, setLoadingDiag] = useState(false);
  const [suggestion, setSuggestion] = useState(null);
  const [aiRunning, setAiRunning] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');
  const [saving, setSaving] = useState(false);

  // Compute popover position each time it opens or the viewport scrolls/resizes.
  // Mobile-first: on small screens (<640px) we render a full-width bottom sheet
  // instead of a floating popover (better UX + never overflows).
  const updatePos = useCallback(() => {
    const b = btnRef.current;
    if (!b) return;
    const isMobile = window.innerWidth < 640;
    if (isMobile) {
      // Full-width sheet at the bottom
      setPopPos({
        top:    window.innerHeight - 460,     // sheet height ≈ 440 + margin
        left:   8,
        width:  window.innerWidth - 16,
        mobile: true,
      });
      return;
    }
    const r = b.getBoundingClientRect();
    const POP_W = 340;
    const margin = 8;
    let left = r.left;
    if (left + POP_W + margin > window.innerWidth) {
      left = Math.max(margin, window.innerWidth - POP_W - margin);
    }
    let top = r.bottom + 4;
    const estimatedHeight = 400;
    if (top + estimatedHeight > window.innerHeight - margin) {
      top = Math.max(margin, r.top - estimatedHeight - 4);
    }
    setPopPos({ top, left, width: POP_W, mobile: false });
  }, []);

  useLayoutEffect(() => {
    if (!open) return undefined;
    updatePos();
    const handler = () => updatePos();
    window.addEventListener('scroll', handler, true);
    window.addEventListener('resize', handler);
    return () => {
      window.removeEventListener('scroll', handler, true);
      window.removeEventListener('resize', handler);
    };
  }, [open, updatePos]);

  // Close on outside click (checks BOTH the trigger and the portal popover).
  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => {
      const t = e.target;
      if (btnRef.current && btnRef.current.contains(t)) return;
      if (popRef.current && popRef.current.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  // Reset ephemeral state when closed
  useEffect(() => {
    if (!open) {
      setSuggestion(null);
      setAiError(null);
    }
  }, [open]);

  // Load diagnostics when opened
  useEffect(() => {
    if (!open || diag) return;
    setLoadingDiag(true);
    axios.get(`${API_URL}/api/admin/leads/${encodeURIComponent(leadId)}/name-diagnostics`, { headers: authHeaders() })
      .then((r) => setDiag(r.data))
      .catch((e) => setDiag({ success: false, error: e?.response?.data?.detail || e.message }))
      .finally(() => setLoadingDiag(false));
  }, [open, diag, leadId]);

  const stop = (e) => { e.stopPropagation(); e.preventDefault(); };

  const runAi = useCallback(async (e) => {
    stop(e);
    setAiError(null);
    setAiRunning(true);
    try {
      const r = await axios.post(
        `${API_URL}/api/admin/leads/${encodeURIComponent(leadId)}/detect-name`,
        {},
        { headers: authHeaders() },
      );
      if (r.data && r.data.success && r.data.suggestion) {
        setSuggestion(r.data);
      } else {
        setAiError(r.data?.message || L.no_name_found);
      }
    } catch (e) {
      setAiError(e?.response?.data?.detail || e.message);
    } finally {
      setAiRunning(false);
    }
  }, [leadId, L.no_name_found]);

  const applyAi = useCallback(async (e) => {
    stop(e);
    if (!suggestion?.suggestion) return;
    setSaving(true);
    try {
      const r = await axios.post(
        `${API_URL}/api/admin/leads/${encodeURIComponent(leadId)}/detect-name?apply=true`,
        {},
        { headers: authHeaders() },
      );
      if (r.data?.applied) {
        setOpen(false);
        onSaved?.(r.data.patched_lead || {
          firstName: suggestion.suggestion.first_name,
          lastName:  suggestion.suggestion.last_name,
        });
      }
    } finally { setSaving(false); }
  }, [leadId, suggestion, onSaved]);

  const saveManual = useCallback(async (e) => {
    stop(e);
    if (!firstName.trim() && !lastName.trim()) return;
    setSaving(true);
    try {
      const r = await axios.put(
        `${API_URL}/api/leads/${encodeURIComponent(leadId)}`,
        { firstName: firstName.trim(), lastName: lastName.trim() },
        { headers: authHeaders() },
      );
      if (r.data?.success) {
        setOpen(false);
        onSaved?.(r.data.lead || { firstName, lastName });
      }
    } finally { setSaving(false); }
  }, [leadId, firstName, lastName, onSaved]);

  const sizeClass = size === 'xs'
    ? 'text-[10px] px-1.5 py-0.5 gap-1'
    : 'text-[11px] px-2 py-1 gap-1.5';

  return (
    <span className="relative inline-flex" onClick={stop}>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => { stop(e); setOpen((v) => !v); }}
        className={`inline-flex items-center rounded-md font-semibold text-[#9D174D] bg-[#FDE2FA] hover:bg-[#FBCFE8] border border-transparent hover:border-[#F9A8D4] transition ${sizeClass}`}
        style={{ lineHeight: 1 }}
        title={L.missing}
        data-testid={`lead-name-fixer-open-${leadId}`}
      >
        <ShieldWarning size={size === 'xs' ? 10 : 12} weight="fill" />
        {L.missing}
      </button>

      {open && createPortal(
        <>
          {popPos.mobile && (
            <div
              className="fixed inset-0 z-[9998] bg-black/40"
              onClick={(e) => { stop(e); setOpen(false); }}
              data-testid={`lead-name-fixer-backdrop-${leadId}`}
            />
          )}
          <div
            ref={popRef}
            onClick={stop}
            data-testid={`lead-name-fixer-popover-${leadId}`}
            className={`fixed z-[9999] bg-white ${popPos.mobile ? 'rounded-t-2xl' : 'rounded-xl'} shadow-2xl border border-[#E4E4E7] p-3 sm:p-3.5`}
            style={{
              top:   popPos.top,
              left:  popPos.left,
              width: popPos.width,
              maxHeight: '85vh',
              overflowY: 'auto',
              boxShadow: '0 -8px 32px rgba(0,0,0,0.18), 0 8px 32px rgba(0,0,0,0.18)',
            }}
          >
          {/* Close */}
          <button
            type="button"
            onClick={(e) => { stop(e); setOpen(false); }}
            className="absolute top-2 right-2 p-1 rounded hover:bg-[#F4F4F5] text-[#71717A]"
            data-testid={`lead-name-fixer-close-${leadId}`}
          >
            <X size={12} />
          </button>

          {/* WHY */}
          <div className="mb-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Info size={12} className="text-[#4F46E5]" />
              <p className="text-[11px] font-semibold text-[#18181B] uppercase tracking-wide">{L.why_head}</p>
            </div>
            {loadingDiag ? (
              <p className="text-[12px] text-[#71717A]">…</p>
            ) : diag && diag.success && (diag.reasons || []).length > 0 ? (
              <ul className="text-[12px] text-[#3F3F46] space-y-1 pl-3">
                {diag.reasons.map((r, i) => <li key={i}>• {r}</li>)}
              </ul>
            ) : (
              <p className="text-[12px] text-[#71717A]">
                {phone ? `Phone: ${phone}` : 'No source metadata.'}
              </p>
            )}
          </div>

          {/* AI DETECT */}
          {(diag?.calls_linked || 0) > 0 && (diag?.transcripts_ready || 0) > 0 ? (
            <div className="mb-3 p-2.5 rounded-lg bg-gradient-to-r from-[#F5F3FF] to-[#EEF2FF] border border-[#DDD6FE]">
              <div className="flex items-center gap-1.5 mb-1">
                <Brain size={12} className="text-[#4F46E5]" weight="fill" />
                <p className="text-[11px] font-semibold text-[#4F46E5] uppercase tracking-wide">{L.ai_head}</p>
              </div>

              {!suggestion && !aiError && (
                <button
                  type="button"
                  onClick={runAi}
                  disabled={aiRunning}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-[#4F46E5] text-white text-[12px] font-semibold hover:bg-[#3730A3] disabled:opacity-50"
                  data-testid={`lead-name-fixer-ai-run-${leadId}`}
                >
                  {aiRunning ? (
                    <>
                      <span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
                      {L.ai_running}
                    </>
                  ) : (
                    <>
                      <Sparkle size={12} weight="fill" />
                      {L.ai_run}
                    </>
                  )}
                </button>
              )}

              {aiError && (
                <p className="text-[11px] text-[#B91C1C] py-1">{aiError}</p>
              )}

              {suggestion && (
                <div className="space-y-2" data-testid={`lead-name-fixer-suggestion-${leadId}`}>
                  <div className="p-2 rounded bg-white border border-[#E4E4E7]">
                    <p className="text-[10px] uppercase tracking-wide text-[#A1A1AA] mb-0.5">
                      {L.suggestion_head}
                    </p>
                    <p className="text-[14px] font-bold text-[#18181B]">
                      {suggestion.suggestion.first_name} {suggestion.suggestion.last_name}
                    </p>
                    {suggestion.suggestion.matched_snippet && (
                      <p className="text-[10.5px] italic text-[#71717A] mt-1 truncate">
                        “{suggestion.suggestion.matched_snippet}”
                      </p>
                    )}
                    <p className="text-[10px] text-[#A1A1AA] mt-1">
                      {suggestion.suggestion.source === 'regex' ? L.source_regex : L.source_openai}
                      {' · '}
                      {L.conf}: {Math.round((suggestion.suggestion.confidence || 0) * 100)}%
                      {suggestion.based_on_call && ` · ${L.based_on}: ${suggestion.based_on_call}`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={applyAi}
                      disabled={saving}
                      className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded bg-[#16A34A] text-white text-[12px] font-semibold hover:bg-[#15803D] disabled:opacity-50"
                      data-testid={`lead-name-fixer-ai-apply-${leadId}`}
                    >
                      <CheckCircle size={12} weight="fill" /> {L.ai_apply}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { stop(e); setSuggestion(null); }}
                      className="px-2 py-1.5 rounded bg-[#F4F4F5] text-[12px] font-semibold text-[#52525B] hover:bg-[#E4E4E7]"
                    >
                      {L.ai_dismiss}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {/* MANUAL EDIT */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <PencilSimple size={12} className="text-[#71717A]" />
              <p className="text-[11px] font-semibold text-[#18181B] uppercase tracking-wide">{L.manual_head}</p>
            </div>
            <div className="flex gap-1.5 mb-2">
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder={L.first_name}
                className="flex-1 min-w-0 px-2 py-1 text-[12px] rounded border border-[#E4E4E7] focus:border-[#4F46E5] focus:outline-none"
                data-testid={`lead-name-fixer-first-${leadId}`}
              />
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder={L.last_name}
                className="flex-1 min-w-0 px-2 py-1 text-[12px] rounded border border-[#E4E4E7] focus:border-[#4F46E5] focus:outline-none"
                data-testid={`lead-name-fixer-last-${leadId}`}
              />
            </div>
            <button
              type="button"
              onClick={saveManual}
              disabled={saving || (!firstName.trim() && !lastName.trim())}
              className="w-full inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded bg-[#18181B] text-white text-[12px] font-semibold hover:bg-[#27272A] disabled:opacity-40"
              data-testid={`lead-name-fixer-save-${leadId}`}
            >
              {saving ? L.saving : L.save}
              <ArrowRight size={11} weight="bold" />
            </button>
          </div>
        </div>
        </>,
        document.body
      )}
    </span>
  );
}
