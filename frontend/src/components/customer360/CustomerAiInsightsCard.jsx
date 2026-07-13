/**
 * BIBI Cars — Wave 2B — Customer 360 AI Insights Card (mobile-first, DS-aligned)
 * ==============================================================================
 *
 * Compact rollup widget rendered in Customer 360 → Overview tab. Aggregates
 * Wave 2A-CI (Call Intelligence) analyses for this customer via:
 *   GET /api/admin/customers/{cid}/call-intelligence/summary
 *
 * Design system alignment (matches Overview360 SectionCard DNA):
 *   • zinc palette (#18181B/#52525B/#71717A/#A1A1AA + border #E4E4E7)
 *   • uppercase tracking-wider mini-headers, 10.5px/11px
 *   • rounded-2xl on the outer card, rounded-lg on inner mini-cards
 *   • responsive grid: grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 for KPIs,
 *     grid-cols-1 md:grid-cols-2 for objections/actions
 *   • all interactive controls have `data-testid` for the QA agent
 *
 * Mobile-first — everything stacks cleanly at 320px width; the header KPIs
 * become a 3-col mini-grid instead of a right-aligned rail.
 *
 * i18n via useLang(); missing keys silently fall back to English so the
 * card is never broken by an untranslated string.
 */
import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import {
  Brain, TrendUp, TrendDown, Minus, WarningOctagon, ArrowRight,
  Sparkle, Target, Compass, ChatCenteredDots, Car,
} from '@phosphor-icons/react';
import { API_URL } from '../../api-config';
import { useLang } from '../../i18n';

const authHeaders = () => {
  try {
    const t = localStorage.getItem('token');
    return t ? { Authorization: `Bearer ${t}` } : {};
  } catch { return {}; }
};

const LABELS = {
  en: {
    title: 'Call Intelligence',
    subtitle: 'AI summary across every analysed call',
    empty_body: 'When Ringostat calls are transcribed, the aggregate view will appear here.',
    total: 'Analysed',
    confidence: 'Avg. conf.',
    languages: 'Languages',
    latest: 'Latest call summary',
    open_calls: 'Open Calls',
    view_all: 'Intelligence Hub',
    at_risk: 'Customer is at risk',
    top_objections: 'Top objections',
    open_actions: 'Pending next actions',
    vehicles: 'Vehicles of interest',
    sentiment_pos: 'Positive', sentiment_neu: 'Neutral', sentiment_neg: 'Negative',
    sentiment_label: 'Sentiment', intent_label: 'Intent',
    intent_very_high: 'Very high', intent_high: 'High', intent_medium: 'Medium',
    intent_low: 'Low', intent_very_low: 'Very low',
    deal_high: 'High', deal_medium: 'Medium', deal_low: 'Low',
    owner_manager: 'Manager', owner_customer: 'Customer',
    due: 'Due',
  },
  uk: {
    title: 'Аналітика дзвінків',
    subtitle: 'AI-огляд по всіх проаналізованих дзвінках',
    empty_body: 'Коли дзвінки Ringostat будуть розшифровані, зведення з’явиться тут.',
    total: 'Проаналізовано',
    confidence: 'Сер. впевненість',
    languages: 'Мови',
    latest: 'Останнє резюме дзвінка',
    open_calls: 'Дзвінки',
    view_all: 'Хаб аналітики',
    at_risk: 'Клієнт у зоні ризику',
    top_objections: 'Топ заперечень',
    open_actions: 'Наступні дії',
    vehicles: 'Авто, які цікавлять',
    sentiment_pos: 'Позитивний', sentiment_neu: 'Нейтральний', sentiment_neg: 'Негативний',
    sentiment_label: 'Настрій', intent_label: 'Намір',
    intent_very_high: 'Дуже високий', intent_high: 'Високий', intent_medium: 'Середній',
    intent_low: 'Низький', intent_very_low: 'Дуже низький',
    deal_high: 'Висока', deal_medium: 'Середня', deal_low: 'Низька',
    owner_manager: 'Менеджер', owner_customer: 'Клієнт',
    due: 'Термін',
  },
  bg: {
    title: 'Разговорна аналитика',
    subtitle: 'AI обобщение по всички анализирани разговори',
    empty_body: 'След като Ringostat обажданията бъдат транскрибирани, обобщението ще се появи тук.',
    total: 'Анализирани',
    confidence: 'Ср. увереност',
    languages: 'Езици',
    latest: 'Последно резюме на разговор',
    open_calls: 'Разговори',
    view_all: 'Аналитичен център',
    at_risk: 'Клиентът е в риск',
    top_objections: 'Топ възражения',
    open_actions: 'Предстоящи действия',
    vehicles: 'Автомобили от интерес',
    sentiment_pos: 'Позитивен', sentiment_neu: 'Неутрален', sentiment_neg: 'Негативен',
    sentiment_label: 'Настроение', intent_label: 'Намерение',
    intent_very_high: 'Много висок', intent_high: 'Висок', intent_medium: 'Среден',
    intent_low: 'Нисък', intent_very_low: 'Много нисък',
    deal_high: 'Висока', deal_medium: 'Средна', deal_low: 'Ниска',
    owner_manager: 'Мениджър', owner_customer: 'Клиент',
    due: 'Срок',
  },
};

const pickL = (lang) => LABELS[lang] || LABELS.en;

const SENTIMENT_TONE = {
  positive: { bg: '#DCFCE7', fg: '#166534', icon: TrendUp },
  neutral:  { bg: '#F4F4F5', fg: '#3F3F46', icon: Minus  },
  negative: { bg: '#FEE2E2', fg: '#991B1B', icon: TrendDown },
};
const INTENT_TONE = {
  very_high: { bg: '#DCFCE7', fg: '#166534' },
  high:      { bg: '#DCFCE7', fg: '#166534' },
  medium:    { bg: '#FEF3C7', fg: '#92400E' },
  low:       { bg: '#FEE2E2', fg: '#991B1B' },
  very_low:  { bg: '#FEE2E2', fg: '#991B1B' },
};
const DEAL_TONE = INTENT_TONE;

// Design-system Chip — same visual DNA as other Customer 360 chips
const Chip = ({ tone = { bg: '#F4F4F5', fg: '#3F3F46' }, icon: Icon, children, testId }) => (
  <span
    data-testid={testId}
    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] sm:text-[11px] font-semibold whitespace-nowrap"
    style={{ background: tone.bg, color: tone.fg }}
  >
    {Icon ? <Icon size={11} weight="bold" /> : null}
    {children}
  </span>
);

// KPI mini-card (matches Overview360 breakdown mini-tiles)
const KpiTile = ({ label, value, tone = '#18181B', testId }) => (
  <div
    data-testid={testId}
    className="px-2 py-1.5 bg-zinc-50 border border-[#E4E4E7] rounded-lg text-left"
  >
    <div className="text-[9.5px] uppercase tracking-wider text-[#71717A] leading-tight">{label}</div>
    <div className="text-[14px] sm:text-[15px] font-bold tabular-nums leading-none mt-1" style={{ color: tone }}>
      {value ?? '—'}
    </div>
  </div>
);

export default function CustomerAiInsightsCard({ customerId, onOpenCallsTab }) {
  const { lang } = useLang();
  const L = pickL(lang);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await axios.get(
        `${API_URL}/api/admin/customers/${encodeURIComponent(customerId)}/call-intelligence/summary`,
        { headers: authHeaders() },
      );
      setData(r.data);
    } catch (e) {
      setError(e?.response?.data?.detail || e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <section
        data-testid="customer-ai-insights-loading"
        className="mb-4 p-3 sm:p-4 rounded-2xl bg-white border border-[#E4E4E7] flex items-center gap-3 text-[12px] sm:text-[13px] text-[#71717A]"
      >
        <div className="w-4 h-4 rounded-full border-2 border-[#18181B] border-t-transparent animate-spin shrink-0" />
        <span>Loading AI insights…</span>
      </section>
    );
  }
  if (error) {
    return (
      <section
        data-testid="customer-ai-insights-error"
        className="mb-4 p-3 sm:p-4 rounded-2xl bg-white border border-[#FECACA] text-[12px] text-[#991B1B]"
      >
        <span className="font-semibold">Call Intelligence:</span> {error}
      </section>
    );
  }
  if (!data || !data.success) return null;

  const totalCalls = data.total_calls || 0;

  // ── Empty state — visually consistent with SectionCard header ──
  if (totalCalls === 0) {
    return (
      <section
        data-testid="customer-ai-insights-empty"
        className="mb-4 rounded-2xl bg-white border border-[#E4E4E7] overflow-hidden"
      >
        <header className="px-3 sm:px-4 py-2.5 flex items-center gap-2 border-b border-[#F4F4F5]">
          <Brain className="w-4 h-4 text-[#52525B]" />
          <h3 className="text-[12.5px] sm:text-[13px] font-semibold uppercase tracking-wider text-[#52525B]">
            {L.title}
          </h3>
        </header>
        <div className="px-3 sm:px-4 py-4 text-[12px] text-[#71717A]">
          {L.empty_body}
        </div>
      </section>
    );
  }

  const latest = data.latest || {};
  const sentTone   = SENTIMENT_TONE[latest.sentiment] || SENTIMENT_TONE.neutral;
  const SentIcon   = sentTone.icon;
  const intentTone = INTENT_TONE[latest.purchase_intent] || INTENT_TONE.medium;
  const dealTone   = DEAL_TONE[latest.deal_probability] || DEAL_TONE.medium;

  const confidencePct = data.avg_confidence != null ? Math.round(data.avg_confidence * 100) : null;

  const sentimentLabel = latest.sentiment ? (L[`sentiment_${latest.sentiment.slice(0,3)}`] || latest.sentiment) : null;
  const intentLabel = latest.purchase_intent
    ? (L[`intent_${latest.purchase_intent}`] || latest.purchase_intent.replace('_', ' '))
    : null;
  const dealLabel = latest.deal_probability ? (L[`deal_${latest.deal_probability}`] || latest.deal_probability) : null;

  const languagesText = Object.keys(data.languages || {}).join(', ').toUpperCase() || '—';

  return (
    <section
      data-testid="customer-ai-insights-card"
      className="mb-4 rounded-2xl overflow-hidden border border-[#E4E4E7] bg-white"
    >
      {/* ─── HEADER ─── (SectionCard-aligned) */}
      <header className="px-3 sm:px-4 py-2.5 flex items-center gap-2 border-b border-[#F4F4F5]">
        <Brain className="w-4 h-4 text-[#52525B]" />
        <h3 className="text-[12.5px] sm:text-[13px] font-semibold uppercase tracking-wider text-[#52525B] flex-1">
          {L.title}
        </h3>
        <span className="text-[9.5px] uppercase tracking-wider text-[#A1A1AA] hidden sm:inline">
          {L.subtitle}
        </span>
      </header>

      {/* ─── AT-RISK BANNER ─── */}
      {data.at_risk ? (
        <div
          data-testid="customer-ai-insights-risk"
          className="px-3 sm:px-4 py-2 border-b border-[#FECACA] bg-[#FEF2F2] flex items-start gap-2"
        >
          <WarningOctagon size={14} weight="fill" className="text-[#B91C1C] mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[11.5px] sm:text-[12px] font-semibold text-[#991B1B] leading-tight">
              {L.at_risk}
            </p>
            {(data.at_risk_reasons || []).slice(0, 2).map((r, i) => (
              <p key={i} className="text-[10.5px] sm:text-[11px] text-[#B91C1C] leading-tight mt-0.5">
                • {r}
              </p>
            ))}
          </div>
        </div>
      ) : null}

      {/* ─── KPIs (mobile-first grid) ─── */}
      <div className="px-3 sm:px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <KpiTile label={L.total} value={totalCalls} testId="ci-kpi-total" />
        {confidencePct != null && (
          <KpiTile label={L.confidence} value={`${confidencePct}%`} tone="#18181B" testId="ci-kpi-conf" />
        )}
        {sentimentLabel && (
          <KpiTile label={L.sentiment_label || 'Sentiment'} value={
            <span className="inline-flex items-center gap-1" style={{ color: sentTone.fg }}>
              <SentIcon size={12} weight="bold" />{sentimentLabel}
            </span>
          } testId="ci-kpi-sentiment" />
        )}
        {intentLabel && (
          <KpiTile label={L.intent_label || 'Intent'} value={
            <span style={{ color: intentTone.fg }}>{intentLabel}</span>
          } testId="ci-kpi-intent" />
        )}
      </div>

      {/* ─── LATEST SUMMARY ─── */}
      {latest.summary && (
        <div className="px-3 sm:px-4 pb-3">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="text-[9.5px] uppercase tracking-wider text-[#A1A1AA]">{L.latest}</span>
            {dealLabel && (
              <Chip tone={dealTone} icon={Sparkle} testId="ci-deal-chip">
                {dealLabel}
              </Chip>
            )}
            {latest.language && (
              <Chip icon={Compass}>{latest.language.toUpperCase()}</Chip>
            )}
          </div>
          <p
            className="text-[12.5px] sm:text-[13px] text-[#27272A] leading-relaxed"
            style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
            data-testid="ci-latest-summary"
          >
            {latest.summary}
          </p>
        </div>
      )}

      {/* ─── TWO-COL DETAILS (stacks on mobile) ─── */}
      {((data.top_objections || []).length > 0 || (data.open_next_actions || []).length > 0) && (
        <div className="px-3 sm:px-4 pb-3 grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
          {(data.top_objections || []).length > 0 && (
            <div data-testid="ci-objections">
              <p className="text-[9.5px] uppercase tracking-wider text-[#A1A1AA] mb-1.5">
                {L.top_objections}
              </p>
              <ul className="space-y-1">
                {data.top_objections.slice(0, 3).map((o, i) => (
                  <li key={i} className="text-[12px] sm:text-[12.5px] text-[#27272A] flex items-start gap-1.5">
                    <span className="text-[#DC2626] mt-0.5 shrink-0">•</span>
                    <span className="flex-1" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {o.text}
                    </span>
                    {o.count > 1 && <span className="text-[10px] text-[#A1A1AA] shrink-0">×{o.count}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(data.open_next_actions || []).length > 0 && (
            <div data-testid="ci-next-actions">
              <p className="text-[9.5px] uppercase tracking-wider text-[#A1A1AA] mb-1.5">
                {L.open_actions}
              </p>
              <ul className="space-y-1">
                {data.open_next_actions.slice(0, 3).map((na, i) => (
                  <li key={i} className="text-[12px] sm:text-[12.5px] text-[#27272A] flex items-start gap-1.5">
                    <span className="text-[#4F46E5] mt-0.5 shrink-0" aria-hidden>→</span>
                    <span className="flex-1 min-w-0" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {na.action}
                      {na.due_date && (
                        <span className="text-[10px] text-[#A1A1AA] ml-1 whitespace-nowrap">({L.due}: {na.due_date})</span>
                      )}
                    </span>
                    {na.owner && (
                      <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-semibold whitespace-nowrap shrink-0 ${
                        na.owner === 'manager' ? 'bg-[#EEF2FF] text-[#4F46E5]' : 'bg-[#DBEAFE] text-[#1E40AF]'
                      }`}>
                        {na.owner === 'manager' ? L.owner_manager : L.owner_customer}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ─── VEHICLES OF INTEREST ─── */}
      {(data.top_vehicle_prefs || []).length > 0 && (
        <div className="px-3 sm:px-4 pb-3">
          <p className="text-[9.5px] uppercase tracking-wider text-[#A1A1AA] mb-1.5 flex items-center gap-1">
            <Car size={11} /> {L.vehicles}
          </p>
          <div className="flex flex-wrap gap-1">
            {data.top_vehicle_prefs.slice(0, 8).map((v, i) => (
              <Chip key={i}>{v.text}</Chip>
            ))}
          </div>
        </div>
      )}

      {/* ─── CTA FOOTER (stacks on mobile) ─── */}
      <footer className="px-3 sm:px-4 py-2 border-t border-[#F4F4F5] bg-[#FAFAFA] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <p className="text-[10.5px] sm:text-[11px] text-[#71717A] flex items-center gap-1 flex-wrap">
          <ChatCenteredDots size={11} weight="bold" />
          <span>{L.languages}: <span className="font-semibold text-[#3F3F46]">{languagesText}</span></span>
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onOpenCallsTab}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#18181B] hover:bg-[#F4F4F5] px-2 py-1 rounded transition"
            data-testid="ci-open-calls-tab"
          >
            {L.open_calls} <ArrowRight size={11} weight="bold" />
          </button>
          <a
            href={`/admin/call-intelligence?customer_id=${encodeURIComponent(customerId)}`}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#71717A] hover:text-[#18181B] px-2 py-1 rounded transition"
            data-testid="ci-open-hub"
          >
            {L.view_all} <ArrowRight size={11} weight="bold" />
          </a>
        </div>
      </footer>
    </section>
  );
}
