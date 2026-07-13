/**
 * BIBI Cars — Wave 2A-CI — Unified Call Intelligence Hub
 * ======================================================
 *
 * Single place where **all** AI-analysed calls across the company are
 * gathered.  Answers the operator ask: "покажи мне все расшифровки в
 * одном месте, с оценками и рекомендациями, без беготни по клиентам".
 *
 * Layout (single scrollable page — no nested router):
 *   ┌────────────────────────────────────────────────────┐
 *   │ Header (title · KPI strip · Configure OpenAI CTA)  │
 *   ├────────────────────────────────────────────────────┤
 *   │ Filters (period · manager · direction · sentiment  │
 *   │          · intent · language · full-text)          │
 *   ├───────────────────────────┬────────────────────────┤
 *   │ Recent AI analyses list   │ Detail panel (right)   │
 *   │  (rows: chips + preview)  │   • Summary + chips    │
 *   │                           │   • Transcript         │
 *   │                           │   • Next actions       │
 *   │                           │   • Objections/risks   │
 *   │                           │   • Coaching feedback  │
 *   │                           │   • Deep links: Cust.  │
 *   └───────────────────────────┴────────────────────────┘
 *
 * Backend consumed:
 *   GET /api/admin/calls/intelligence/config
 *   GET /api/admin/calls/intelligence/stats
 *   GET /api/admin/calls/intelligence/recent?limit=100
 *   GET /api/admin/calls/{call_id}/intelligence
 *   PATCH /api/admin/integrations/openai  (only via link → Settings)
 *
 * Role model (backend already enforced via require_manager_or_admin):
 *   admin / master_admin / team_lead → see everyone
 *   manager                          → forcibly scoped to their own id
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Brain, ArrowsClockwise, Translate, Sparkle, Robot, Waveform,
  PhoneIncoming, PhoneOutgoing, Phone, ChatCenteredDots,
  ArrowRight, WarningOctagon, User, MagnifyingGlass, X, Target,
  CheckCircle, Compass, ArrowSquareOut, CurrencyDollar, ChartLineUp,
} from '@phosphor-icons/react';
import axios from 'axios';
import { API_URL } from '../../api-config';
import { useLang } from '../../i18n';

const BACKEND_URL = API_URL;
const authHeaders = () => {
  const t = (() => { try { return localStorage.getItem('token') || ''; } catch { return ''; } })();
  return t ? { Authorization: `Bearer ${t}` } : {};
};

// ─────────────────────────── i18n ────────────────────────────────────
const LANG = {
  en: {
    page_title:  'Call Intelligence — Unified Feed',
    page_sub:    'All AI transcriptions, sentiment, purchase intent and coaching notes in one screen. Click any row to see the full transcript and recommendations.',
    kpi_analysed: 'Analysed (30d)',
    kpi_positive: 'Positive tone',
    kpi_high_intent: 'High intent',
    kpi_coverage: 'Next-action coverage',
    configure_openai: 'Configure OpenAI',
    openai_ready: 'OpenAI ready',
    openai_missing: 'OpenAI key is not configured — analyses won\'t run until it is set.',
    lang_pin: 'Language',
    lang_auto: 'auto',
    refresh: 'Refresh',
    filters_title: 'Filters',
    f_period: 'Period',
    f_all: 'All',
    f_manager: 'Manager',
    f_direction: 'Direction',
    f_sentiment: 'Sentiment',
    f_intent: 'Purchase intent',
    f_language: 'Language',
    f_search: 'Search transcript / summary',
    f_reset: 'Reset',
    list_title: 'Recent analyses',
    list_count: 'shown',
    empty_title: 'No analysed calls yet',
    empty_hint: 'Once a Ringostat call recording lands and OpenAI is configured, the transcription runs automatically. Analyses will appear here — newest first.',
    open_row: 'Open',
    close_detail: 'Close',
    detail_summary: 'AI summary',
    detail_next: 'Next actions',
    detail_objections: 'Objections',
    detail_risks: 'Risks',
    detail_coaching: 'Coaching feedback',
    detail_transcript: 'Transcript',
    detail_transcript_empty: 'Transcript is not available yet.',
    detail_missing: 'No AI analysis has been generated for this call yet.',
    detail_run:      'Run intelligence now',
    running:         'Working…',
    open_customer: 'Open customer card (Customer 360)',
    open_lead:     'Open lead',
    loading: 'Loading…',
    intent_very_high: 'very high',
    intent_high:      'high',
    intent_medium:    'medium',
    intent_low:       'low',
    sent_positive:    'positive',
    sent_negative:    'negative',
    sent_mixed:       'mixed',
    sent_neutral:     'neutral',
    ready_toast:      'AI analysis started — refreshing shortly.',
    err_run:          'Could not start analysis. Check OpenAI key.',
    // OpenAI usage / spend widget
    usage_title:       'OpenAI spend',
    usage_today:       'Today',
    usage_week:        'Last 7 days',
    usage_month:       'Last 30 days',
    usage_quarter:     'Last 90 days',
    usage_all_time:    'All time',
    usage_cost:        'Spend',
    usage_requests:    'Requests',
    usage_tokens:      'Tokens (in / out)',
    usage_audio_min:   'Audio min.',
    usage_top_models:  'Top models (30d)',
    usage_no_activity: 'No OpenAI activity yet.',
    usage_hint:        'Actual cost from the OpenAI pricing table. Tap a period to see full breakdown.',
    usage_configure:   'OpenAI key is not configured — set it in Admin → Integrations to start tracking cost.',
    usage_recent:      'Recent activity',
    usage_avg_call:    'Avg. cost / call',
    usage_projected_month: 'Projected monthly',
  },
  bg: {
    page_title:  'Call Intelligence — обединена лента',
    page_sub:    'Всички AI транскрипции, тон, интерес към покупка и препоръки за мениджъри — на един екран.',
    kpi_analysed: 'Анализирани (30д)',
    kpi_positive: 'Позитивен тон',
    kpi_high_intent: 'Висок интерес',
    kpi_coverage: 'Покритие с next-action',
    configure_openai: 'Настрой OpenAI',
    openai_ready: 'OpenAI готов',
    openai_missing: 'Ключът на OpenAI не е конфигуриран — анализи няма да се стартират, докато не бъде зададен.',
    lang_pin: 'Език',
    lang_auto: 'авто',
    refresh: 'Опресни',
    filters_title: 'Филтри',
    f_period: 'Период',
    f_all: 'Всички',
    f_manager: 'Мениджър',
    f_direction: 'Посока',
    f_sentiment: 'Тон',
    f_intent: 'Интерес',
    f_language: 'Език',
    f_search: 'Търси в транскрипт/резюме',
    f_reset: 'Изчисти',
    list_title: 'Скорошни анализи',
    list_count: 'показани',
    empty_title: 'Все още няма анализирани разговори',
    empty_hint: 'След като запис от Ringostat пристигне и OpenAI е настроен, транскрипцията стартира автоматично. Анализите ще се появят тук — най-новите отгоре.',
    open_row: 'Отвори',
    close_detail: 'Затвори',
    detail_summary: 'AI резюме',
    detail_next: 'Следващи стъпки',
    detail_objections: 'Възражения',
    detail_risks: 'Рискове',
    detail_coaching: 'Обратна връзка (менторска)',
    detail_transcript: 'Транскрипт',
    detail_transcript_empty: 'Все още няма транскрипт.',
    detail_missing: 'За този разговор все още няма AI анализ.',
    detail_run:      'Стартирай анализ',
    running:         'Обработва се…',
    open_customer: 'Отвори картона на клиента (Customer 360)',
    open_lead:     'Отвори лийда',
    loading: 'Зареждаме…',
    intent_very_high: 'много висок',
    intent_high:      'висок',
    intent_medium:    'среден',
    intent_low:       'нисък',
    sent_positive:    'позитивен',
    sent_negative:    'негативен',
    sent_mixed:       'смесен',
    sent_neutral:     'неутрален',
    ready_toast:      'AI анализът стартира — списъкът ще се обнови след малко.',
    err_run:          'Неуспешно стартиране. Проверете OpenAI ключа.',
    usage_title:       'Разходи за OpenAI',
    usage_today:       'Днес',
    usage_week:        'Последни 7 дни',
    usage_month:       'Последни 30 дни',
    usage_quarter:     'Последни 90 дни',
    usage_all_time:    'От началото',
    usage_cost:        'Разход',
    usage_requests:    'Заявки',
    usage_tokens:      'Токени (вх. / изх.)',
    usage_audio_min:   'Аудио мин.',
    usage_top_models:  'Топ модели (30д)',
    usage_no_activity: 'Все още няма OpenAI активност.',
    usage_hint:        'Реален разход по официалната ценова таблица на OpenAI.',
    usage_configure:   'Ключът на OpenAI не е настроен — задайте го в Admin → Integrations, за да започне отчитането.',
    usage_recent:      'Скорошна активност',
    usage_avg_call:    'Средно / обаждане',
    usage_projected_month: 'Прогноза месец',
  },
  uk: {
    page_title:  'Call Intelligence — єдина стрічка',
    page_sub:    'Усі AI-транскрипції, тон, інтерес до купівлі та рекомендації менеджерам — на одному екрані.',
    kpi_analysed: 'Проаналізовано (30д)',
    kpi_positive: 'Позитивний тон',
    kpi_high_intent: 'Високий інтерес',
    kpi_coverage: 'Покриття next-action',
    configure_openai: 'Налаштувати OpenAI',
    openai_ready: 'OpenAI готовий',
    openai_missing: 'Ключ OpenAI не налаштовано — аналізи не запустяться, поки його не задати.',
    lang_pin: 'Мова',
    lang_auto: 'авто',
    refresh: 'Оновити',
    filters_title: 'Фільтри',
    f_period: 'Період',
    f_all: 'Усі',
    f_manager: 'Менеджер',
    f_direction: 'Напрям',
    f_sentiment: 'Тон',
    f_intent: 'Інтерес',
    f_language: 'Мова',
    f_search: 'Шукати в транскрипті/резюме',
    f_reset: 'Скинути',
    list_title: 'Останні аналізи',
    list_count: 'показано',
    empty_title: 'Ще немає проаналізованих дзвінків',
    empty_hint: 'Коли запис із Ringostat потрапляє в систему і OpenAI налаштований, транскрипція запускається автоматично. Аналізи з’являться тут — найновіші зверху.',
    open_row: 'Відкрити',
    close_detail: 'Закрити',
    detail_summary: 'AI резюме',
    detail_next: 'Наступні кроки',
    detail_objections: 'Заперечення',
    detail_risks: 'Ризики',
    detail_coaching: 'Менторський фідбек',
    detail_transcript: 'Транскрипт',
    detail_transcript_empty: 'Транскрипту ще немає.',
    detail_missing: 'Для цього дзвінка ще немає AI аналізу.',
    detail_run:      'Запустити аналіз',
    running:         'Обробляємо…',
    open_customer: 'Відкрити картку клієнта (Customer 360)',
    open_lead:     'Відкрити лід',
    loading: 'Завантаження…',
    intent_very_high: 'дуже високий',
    intent_high:      'високий',
    intent_medium:    'середній',
    intent_low:       'низький',
    sent_positive:    'позитивний',
    sent_negative:    'негативний',
    sent_mixed:       'змішаний',
    sent_neutral:     'нейтральний',
    ready_toast:      'AI аналіз стартовано — оновимо список за мить.',
    err_run:          'Не вдалось стартувати. Перевірте OpenAI ключ.',
    usage_title:       'Витрати OpenAI',
    usage_today:       'Сьогодні',
    usage_week:        'За 7 днів',
    usage_month:       'За 30 днів',
    usage_quarter:     'За 90 днів',
    usage_all_time:    'За весь час',
    usage_cost:        'Витрачено',
    usage_requests:    'Запитів',
    usage_tokens:      'Токени (вх. / вих.)',
    usage_audio_min:   'Аудіо хв.',
    usage_top_models:  'Топ моделі (30д)',
    usage_no_activity: 'Ще немає активності OpenAI.',
    usage_hint:        'Реальна вартість за офіційним прайсом OpenAI.',
    usage_configure:   'Ключ OpenAI не налаштовано — задайте його в Admin → Integrations, щоб почати облік витрат.',
    usage_recent:      'Остання активність',
    usage_avg_call:    'В середньому / дзвінок',
    usage_projected_month: 'Прогноз на місяць',
  },
};

const useL = () => {
  const { lang } = useLang();
  return LANG[lang] || LANG.en;
};

// ────────────────────────── HELPERS ──────────────────────────────────
const fmtDate = (iso) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
};

const fmtDuration = (sec) => {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${String(r).padStart(2, '0')}s`;
};

const DirectionIcon = ({ direction }) => {
  if (direction === 'inbound')  return <PhoneIncoming size={14} weight="duotone" className="text-emerald-600" />;
  if (direction === 'outbound') return <PhoneOutgoing size={14} weight="duotone" className="text-sky-600" />;
  return <Phone size={14} weight="duotone" className="text-zinc-500" />;
};

const intentTone = (v) => (
  v === 'very_high' ? 'bg-emerald-100 text-emerald-800' :
  v === 'high'      ? 'bg-emerald-50 text-emerald-700' :
  v === 'medium'    ? 'bg-amber-50 text-amber-700' :
                      'bg-zinc-100 text-zinc-600'
);

const sentimentTone = (v) => (
  v === 'positive' ? 'bg-emerald-50 text-emerald-700' :
  v === 'negative' ? 'bg-rose-50 text-rose-700' :
  v === 'mixed'    ? 'bg-amber-50 text-amber-700' :
                     'bg-zinc-100 text-zinc-600'
);

// ────────────────────────── PAGE ─────────────────────────────────────
export default function CallIntelligencePage() {
  const L = useL();

  const [config, setConfig]   = useState(null);
  const [stats,  setStats]    = useState(null);
  const [items,  setItems]    = useState([]);
  const [usage,  setUsage]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedCallId, setSelectedCallId] = useState(null);

  // Filters
  const [fDirection, setFDirection]   = useState('');
  const [fSentiment, setFSentiment]   = useState('');
  const [fIntent,    setFIntent]      = useState('');
  const [fLanguage,  setFLanguage]    = useState('');
  const [fManager,   setFManager]     = useState('');
  const [fSearch,    setFSearch]      = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [cfgR, stR, recR, usgR] = await Promise.all([
        fetch(`${BACKEND_URL}/api/admin/calls/intelligence/config`, { headers: authHeaders() }),
        fetch(`${BACKEND_URL}/api/admin/calls/intelligence/stats`,  { headers: authHeaders() }),
        fetch(`${BACKEND_URL}/api/admin/calls/intelligence/recent?limit=100`, { headers: authHeaders() }),
        fetch(`${BACKEND_URL}/api/admin/integrations/openai/usage`,  { headers: authHeaders() }),
      ]);
      const cfg = await cfgR.json().catch(() => ({}));
      const st  = await stR .json().catch(() => ({}));
      const rc  = await recR.json().catch(() => ({}));
      const usg = await usgR.json().catch(() => ({}));
      setConfig(cfg);
      setStats(st?.stats || null);
      setItems(Array.isArray(rc?.items) ? rc.items : []);
      setUsage(usg?.success ? usg : null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // ── Filter application (client-side; server already scoped by role) ──
  const filtered = useMemo(() => {
    const q = (fSearch || '').trim().toLowerCase();
    return items.filter((r) => {
      if (fDirection && (r.direction || '').toLowerCase() !== fDirection) return false;
      if (fSentiment && (r.sentiment || '') !== fSentiment) return false;
      if (fIntent    && (r.purchase_intent || '') !== fIntent) return false;
      if (fLanguage  && (r.language || '').toLowerCase() !== fLanguage) return false;
      if (fManager   && (r.manager_id || '') !== fManager) return false;
      if (q) {
        const hay = `${r.summary || ''} ${r.transcript_preview || ''} ${r.next_action || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, fDirection, fSentiment, fIntent, fLanguage, fManager, fSearch]);

  const managerOptions = useMemo(() => {
    const map = new Map();
    for (const r of items) {
      if (r.manager_id) map.set(r.manager_id, r.manager_name || r.manager_id);
    }
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [items]);

  const resetFilters = () => {
    setFDirection(''); setFSentiment(''); setFIntent('');
    setFLanguage(''); setFManager(''); setFSearch('');
  };

  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto space-y-4" data-testid="page-call-intelligence">
      {/* ───── Header ───── */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center">
            <Brain size={22} weight="duotone" className="text-indigo-600" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-semibold text-zinc-900 leading-tight" data-testid="ci-hub-title">
              {L.page_title}
            </h1>
            <div className="text-sm text-zinc-500 mt-0.5 max-w-2xl">{L.page_sub}</div>
            {config && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                {config.openai_configured ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 font-medium">
                    <Sparkle size={11} weight="fill" /> {L.openai_ready}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                    <WarningOctagon size={11} /> {L.openai_missing}
                  </span>
                )}
                {config.transcribe_model && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-zinc-200 text-zinc-600">
                    <Waveform size={11} /> {config.transcribe_model}
                  </span>
                )}
                {config.analyze_model && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-zinc-200 text-zinc-600">
                    <Robot size={11} /> {config.analyze_model}
                  </span>
                )}
                {config.transcribe_language && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700">
                    <Translate size={11} weight="duotone" />
                    {L.lang_pin}: {config.transcribe_language === 'auto' ? L.lang_auto : config.transcribe_language.toUpperCase()}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={reload}
            disabled={loading}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-zinc-200 bg-white hover:bg-zinc-50 text-xs font-medium text-zinc-700 disabled:opacity-50"
            data-testid="ci-hub-refresh"
          >
            <ArrowsClockwise size={14} weight={loading ? 'fill' : 'duotone'} className={loading ? 'animate-spin' : ''} />
            {L.refresh}
          </button>
          {config?.can_configure_key && (
            <Link
              to="/admin/settings?tab=ai"
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-semibold"
              data-testid="ci-hub-configure-openai"
            >
              <Brain size={14} weight="duotone" />
              {L.configure_openai}
            </Link>
          )}
        </div>
      </div>

      {/* ───── KPI strip ───── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label={L.kpi_analysed}    value={stats?.total_calls_with_ci ?? '—'} />
        <KpiCard label={L.kpi_positive}    value={stats?.positive ?? '—'} sub={stats?.total_calls_with_ci ? `${Math.round(100 * (stats.positive / stats.total_calls_with_ci))}%` : null} />
        <KpiCard label={L.kpi_high_intent} value={stats?.high_intent ?? '—'} sub={stats?.total_calls_with_ci ? `${Math.round(100 * (stats.high_intent / stats.total_calls_with_ci))}%` : null} />
        <KpiCard label={L.kpi_coverage}    value={stats?.next_action_coverage != null ? `${Math.round(100 * stats.next_action_coverage)}%` : '—'} />
      </div>

      {/* ───── OpenAI spend panel (real-money tracking) ───── */}
      <UsagePanel L={L} usage={usage} openaiConfigured={config?.openai_configured} />

      {/* ───── Filters ───── */}
      <div className="bg-white border border-zinc-200 rounded-lg p-3 sm:p-4">
        <div className="text-xs uppercase tracking-wide text-zinc-500 font-semibold mb-2">{L.filters_title}</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
          <Select value={fDirection} onChange={setFDirection} label={L.f_direction}
                  options={[['', L.f_all], ['inbound', 'inbound'], ['outbound', 'outbound']]} testid="ci-filter-direction" />
          <Select value={fSentiment} onChange={setFSentiment} label={L.f_sentiment}
                  options={[['', L.f_all], ['positive', L.sent_positive], ['neutral', L.sent_neutral],
                            ['mixed', L.sent_mixed], ['negative', L.sent_negative]]} testid="ci-filter-sentiment" />
          <Select value={fIntent} onChange={setFIntent} label={L.f_intent}
                  options={[['', L.f_all], ['very_high', L.intent_very_high], ['high', L.intent_high],
                            ['medium', L.intent_medium], ['low', L.intent_low]]} testid="ci-filter-intent" />
          <Select value={fLanguage} onChange={setFLanguage} label={L.f_language}
                  options={[['', L.f_all], ...(config?.supported_languages || []).map(l => [l, l.toUpperCase()])]}
                  testid="ci-filter-language" />
          <Select value={fManager} onChange={setFManager} label={L.f_manager}
                  options={[['', L.f_all], ...managerOptions.map(m => [m.id, m.name])]}
                  testid="ci-filter-manager" />
        </div>
        {/* Search — dedicated full-width row so label length across locales
             never pushes it out of horizontal alignment with the selects. */}
        <div className="mt-3 flex flex-col sm:flex-row sm:items-end gap-2">
          <div className="flex-1 min-w-0">
            <label className="block text-[11px] text-zinc-500 mb-1 truncate" title={L.f_search}>
              {L.f_search}
            </label>
            <div className="relative">
              <MagnifyingGlass size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
              <input
                type="text"
                value={fSearch}
                onChange={(e) => setFSearch(e.target.value)}
                className="w-full h-9 pl-8 pr-3 text-sm rounded-md border border-zinc-200 bg-white text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                placeholder="e.g. deposit, price, callback"
                data-testid="ci-filter-search"
              />
            </div>
          </div>
          <div className="flex items-center justify-between sm:justify-end gap-4 sm:pb-0.5 shrink-0">
            <div className="text-[11px] text-zinc-500 tabular-nums" data-testid="ci-filter-count">
              {filtered.length} / {items.length} {L.list_count}
            </div>
            <button
              type="button"
              onClick={resetFilters}
              className="text-[11px] font-medium text-indigo-600 hover:text-indigo-700 hover:underline"
              data-testid="ci-filter-reset"
            >
              {L.f_reset}
            </button>
          </div>
        </div>
      </div>

      {/* ───── Body: list + detail panel ───── */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px] gap-4 items-start">
        <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-zinc-100 flex items-center gap-2">
            <ChatCenteredDots size={16} weight="duotone" className="text-indigo-600" />
            <div className="text-sm font-semibold text-zinc-900">{L.list_title}</div>
          </div>
          {loading ? (
            <div className="p-6 text-sm text-zinc-500">{L.loading}</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center" data-testid="ci-hub-empty">
              <div className="w-12 h-12 rounded-full bg-zinc-50 flex items-center justify-center mx-auto mb-2">
                <Brain size={22} weight="duotone" className="text-zinc-400" />
              </div>
              <div className="text-sm font-semibold text-zinc-800">{L.empty_title}</div>
              <div className="text-xs text-zinc-500 mt-1 max-w-md mx-auto">{L.empty_hint}</div>
              {config?.can_configure_key && !config.openai_configured && (
                <Link
                  to="/admin/settings?tab=ai"
                  className="inline-flex items-center gap-1.5 mt-3 h-8 px-3 rounded-md border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-semibold"
                >
                  <Brain size={13} weight="duotone" /> {L.configure_openai}
                </Link>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-zinc-100 max-h-[70vh] overflow-y-auto">
              {filtered.map((r) => {
                const isActive = r.call_id === selectedCallId;
                return (
                  <li
                    key={r.call_id}
                    onClick={() => setSelectedCallId(r.call_id)}
                    className={`p-3 sm:p-4 cursor-pointer transition-colors ${isActive ? 'bg-indigo-50/60' : 'hover:bg-zinc-50'}`}
                    data-testid={`ci-hub-row-${r.call_id}`}
                  >
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <DirectionIcon direction={r.direction} />
                      {r.started_at && <span className="text-[11px] text-zinc-500">{fmtDate(r.started_at)}</span>}
                      {r.duration != null && <span className="text-[11px] text-zinc-400">· {fmtDuration(r.duration)}</span>}
                      {r.manager_name && <span className="text-[11px] text-zinc-600">· {r.manager_name}</span>}
                      {r.language && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] uppercase px-1.5 py-0.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 font-medium">
                          <Translate size={10} weight="duotone" /> {String(r.language).toUpperCase()}
                        </span>
                      )}
                      {r.purchase_intent && (
                        <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded-full font-medium ${intentTone(r.purchase_intent)}`}>
                          {String(r.purchase_intent).replace('_', ' ')}
                        </span>
                      )}
                      {r.sentiment && (
                        <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded-full font-medium ${sentimentTone(r.sentiment)}`}>
                          {r.sentiment}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-zinc-900 leading-snug">
                      {r.summary || <span className="italic text-zinc-400">—</span>}
                    </div>
                    {r.transcript_preview && (
                      <div className="mt-1 text-[12px] text-zinc-500 italic leading-snug line-clamp-2">
                        “{r.transcript_preview}”
                      </div>
                    )}
                    {r.next_action && (
                      <div className="mt-1 text-[12px] text-emerald-700 flex items-start gap-1">
                        <ArrowRight size={12} className="mt-0.5 flex-shrink-0" />
                        <span>{r.next_action}</span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Detail panel — anchored below on mobile, side on desktop */}
        <div className="lg:sticky lg:top-4">
          <DetailPanel
            L={L}
            callId={selectedCallId}
            onClose={() => setSelectedCallId(null)}
            onProcessed={reload}
          />
        </div>
      </div>
    </div>
  );
}

// ────────────────────────── KPI CARD ─────────────────────────────────
const KpiCard = ({ label, value, sub }) => (
  <div className="bg-white border border-zinc-200 rounded-lg p-3 sm:p-4">
    <div className="text-[11px] uppercase tracking-wide text-zinc-500 font-medium">{label}</div>
    <div className="mt-1 flex items-baseline gap-2">
      <div className="text-2xl font-semibold text-zinc-900 tabular-nums">{value}</div>
      {sub && <div className="text-xs text-zinc-500">{sub}</div>}
    </div>
  </div>
);

// ────────────────────────── USAGE PANEL ──────────────────────────────
// Real-money OpenAI spend rollup — 4 windows (today · 7d · 30d · 90d)
// + top-model breakdown + last events. Fetches /api/admin/integrations/openai/usage.
const fmtUsd = (n) => {
  const v = Number(n || 0);
  if (!Number.isFinite(v) || v === 0) return '$0.00';
  if (v < 0.01) return `<$0.01`;
  if (v < 1)   return `$${v.toFixed(3)}`;
  if (v < 100) return `$${v.toFixed(2)}`;
  return `$${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
};
const fmtInt = (n) => Number(n || 0).toLocaleString('en-US');

const UsageBucket = ({ label, data, muted }) => (
  <div className={`rounded-lg border ${muted ? 'border-zinc-100 bg-zinc-50' : 'border-zinc-200 bg-white'} p-3 flex flex-col gap-1`}>
    <div className="text-[11px] uppercase tracking-wide text-zinc-500 font-medium truncate" title={label}>{label}</div>
    <div className="text-lg sm:text-xl font-semibold text-zinc-900 tabular-nums leading-none">
      {fmtUsd(data?.cost_usd)}
    </div>
    <div className="text-[11px] text-zinc-500 tabular-nums">
      {fmtInt(data?.requests)} req
      {data?.audio_seconds ? ` · ${(Number(data.audio_seconds) / 60).toFixed(1)} min` : ''}
    </div>
  </div>
);

const UsagePanel = ({ L, usage, openaiConfigured }) => {
  const monthCost = Number(usage?.month?.cost_usd || 0);
  const monthReq  = Number(usage?.month?.requests || 0);
  const avgCall   = monthReq > 0 ? monthCost / monthReq : 0;
  // 30-day rolling → project current-month spend: assume constant rate.
  const projectedMonth = monthCost;
  const hasActivity = (usage?.all_time?.requests ?? 0) > 0;

  return (
    <div className="bg-white border border-zinc-200 rounded-lg p-3 sm:p-4" data-testid="ci-openai-usage-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-emerald-50 border border-emerald-100 flex items-center justify-center">
            <CurrencyDollar size={16} weight="duotone" className="text-emerald-600" />
          </div>
          <div>
            <div className="text-sm font-semibold text-zinc-900 leading-tight">{L.usage_title}</div>
            <div className="text-[11px] text-zinc-500 leading-tight">{L.usage_hint}</div>
          </div>
        </div>
        {hasActivity && (
          <div className="flex items-center gap-3 text-[11px] text-zinc-500">
            <div className="flex items-center gap-1">
              <ChartLineUp size={12} weight="duotone" className="text-indigo-500" />
              <span className="uppercase tracking-wide">{L.usage_projected_month}</span>
              <span className="text-zinc-900 font-semibold tabular-nums">{fmtUsd(projectedMonth)}</span>
            </div>
            <div className="hidden sm:flex items-center gap-1">
              <span className="uppercase tracking-wide">{L.usage_avg_call}</span>
              <span className="text-zinc-900 font-semibold tabular-nums">{fmtUsd(avgCall)}</span>
            </div>
          </div>
        )}
      </div>

      {!openaiConfigured && (
        <div className="mb-3 text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 flex items-start gap-2">
          <WarningOctagon size={14} weight="duotone" className="mt-0.5 shrink-0" />
          <div>{L.usage_configure}</div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <UsageBucket label={L.usage_today}   data={usage?.today} />
        <UsageBucket label={L.usage_week}    data={usage?.week} />
        <UsageBucket label={L.usage_month}   data={usage?.month} />
        <UsageBucket label={L.usage_quarter} data={usage?.quarter} />
      </div>

      {hasActivity && Array.isArray(usage?.by_model) && usage.by_model.length > 0 && (
        <div className="mt-4">
          <div className="text-[11px] uppercase tracking-wide text-zinc-500 font-medium mb-1.5">{L.usage_top_models}</div>
          <div className="flex flex-wrap gap-2">
            {usage.by_model.map((m) => (
              <div
                key={m.model}
                className="inline-flex items-center gap-2 h-7 px-2.5 rounded-full bg-zinc-50 border border-zinc-200 text-[11px] text-zinc-700"
                title={`${m.model} · ${m.kind || ''}`}
              >
                <span className="font-medium">{m.model}</span>
                <span className="text-zinc-400">·</span>
                <span className="text-zinc-500 tabular-nums">{fmtInt(m.requests)}</span>
                <span className="text-zinc-400">·</span>
                <span className="text-emerald-700 font-semibold tabular-nums">{fmtUsd(m.cost_usd)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!hasActivity && (
        <div className="mt-3 text-[12px] text-zinc-500 italic" data-testid="ci-openai-usage-empty">
          {L.usage_no_activity}
        </div>
      )}
    </div>
  );
};

// ────────────────────────── Select ────────────────────────────────────
// The dropdown label is forced onto a SINGLE line (with `truncate` + native
// `title` tooltip) so a long BG/UA translation (e.g. "Мениджър" vs
// "Manager") can never push the underlying <select> out of vertical
// alignment with its siblings. The select itself is 36px tall — matches
// the surrounding inputs and the CRM's white/zinc design language.
const Select = ({ value, onChange, options, label, testid }) => (
  <div className="flex flex-col min-w-0">
    <label
      className="block text-[11px] text-zinc-500 mb-1 truncate"
      title={label}
    >
      {label}
    </label>
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-9 pl-3 pr-8 text-sm rounded-md border border-zinc-200 bg-white text-zinc-900 appearance-none focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 hover:border-zinc-300 transition-colors cursor-pointer"
        data-testid={testid}
      >
        {options.map(([v, lbl]) => (
          <option key={String(v)} value={v}>{lbl}</option>
        ))}
      </select>
      {/* Custom caret — the native select arrow varies by OS/browser and
          clashes with the CRM white/indigo palette; we render our own. */}
      <svg
        aria-hidden
        viewBox="0 0 20 20"
        className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  </div>
);

// ────────────────────────── DETAIL PANEL ─────────────────────────────
const DetailPanel = ({ L, callId, onClose, onProcessed }) => {
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [data,    setData]    = useState(null);
  const [err,     setErr]     = useState(null);

  useEffect(() => {
    if (!callId) { setData(null); setErr(null); return; }
    let cancel = false;
    (async () => {
      setLoading(true); setErr(null);
      try {
        const r = await fetch(`${BACKEND_URL}/api/admin/calls/${encodeURIComponent(callId)}/intelligence`,
          { headers: authHeaders() });
        const j = await r.json();
        if (!cancel) setData(j);
      } catch (e) {
        if (!cancel) setErr(String(e));
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [callId]);

  const runIntelligence = async () => {
    if (!callId) return;
    setRunning(true);
    try {
      await axios.post(
        `${BACKEND_URL}/api/admin/calls/${encodeURIComponent(callId)}/intelligence/process`,
        {},
        { headers: authHeaders() },
      );
      // Refetch after a short delay (Whisper takes 5-25s typically)
      setTimeout(async () => {
        try {
          const r = await fetch(`${BACKEND_URL}/api/admin/calls/${encodeURIComponent(callId)}/intelligence`,
            { headers: authHeaders() });
          const j = await r.json();
          setData(j);
          onProcessed?.();
        } catch { /* noop */ }
        setRunning(false);
      }, 4000);
    } catch (e) {
      setErr(e?.response?.data?.detail || L.err_run);
      setRunning(false);
    }
  };

  if (!callId) {
    return (
      <div className="bg-white border border-zinc-200 border-dashed rounded-lg p-6 text-center">
        <div className="w-11 h-11 rounded-full bg-zinc-50 flex items-center justify-center mx-auto mb-2">
          <ChatCenteredDots size={20} weight="duotone" className="text-zinc-400" />
        </div>
        <div className="text-sm font-medium text-zinc-700">Select a call to see full AI analysis</div>
        <div className="text-xs text-zinc-500 mt-1">Click any row in the list to reveal the transcript, next actions, coaching feedback, objections and risks.</div>
      </div>
    );
  }

  const ci = data?.intelligence || null;
  const tr = data?.transcript   || null;

  return (
    <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden" data-testid="ci-detail-panel">
      <div className="px-3 py-2 border-b border-zinc-100 flex items-center gap-2">
        <Brain size={16} weight="duotone" className="text-indigo-600" />
        <div className="text-sm font-semibold text-zinc-900 flex-1 truncate">Call: {callId}</div>
        <button type="button" onClick={onClose} className="p-1 rounded hover:bg-zinc-50" data-testid="ci-detail-close">
          <X size={16} />
        </button>
      </div>

      <div className="p-3 space-y-3 max-h-[70vh] overflow-y-auto">
        {loading && <div className="text-sm text-zinc-500">{L.loading}</div>}
        {err && <div className="text-sm text-rose-600">{err}</div>}

        {!loading && data && (
          <>
            {/* Chips row */}
            <div className="flex flex-wrap items-center gap-1.5">
              {ci?.language || tr?.language ? (
                <span className="inline-flex items-center gap-0.5 text-[10px] uppercase px-1.5 py-0.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 font-medium">
                  <Translate size={10} weight="duotone" /> {String(ci?.language || tr?.language).toUpperCase()}
                </span>
              ) : null}
              {ci?.purchase_intent && (
                <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded-full font-medium ${intentTone(ci.purchase_intent)}`}>
                  <Target size={10} className="inline mr-0.5" />
                  {String(ci.purchase_intent).replace('_', ' ')}
                </span>
              )}
              {ci?.sentiment && (
                <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded-full font-medium ${sentimentTone(ci.sentiment)}`}>
                  {ci.sentiment}
                </span>
              )}
              {ci?.deal_probability != null && (
                <span className="text-[10px] uppercase px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-100 font-medium">
                  P = {Math.round((ci.deal_probability || 0) * 100)}%
                </span>
              )}
              {ci?.model && (
                <span className="text-[10px] uppercase px-1.5 py-0.5 rounded-full bg-white border border-zinc-200 text-zinc-500">
                  {ci.model}
                </span>
              )}
            </div>

            {/* Deep links to Customer 360 / Lead */}
            {(ci?.customer_id || ci?.lead_id) && (
              <div className="flex flex-wrap gap-2">
                {ci?.customer_id && (
                  <Link
                    to={`/admin/customers/${ci.customer_id}/360`}
                    className="inline-flex items-center gap-1 text-xs text-indigo-700 hover:underline"
                    data-testid="ci-detail-open-customer"
                  >
                    <User size={12} /> {L.open_customer} <ArrowSquareOut size={11} />
                  </Link>
                )}
                {ci?.lead_id && (
                  <Link
                    to={`/admin/leads/${ci.lead_id}`}
                    className="inline-flex items-center gap-1 text-xs text-indigo-700 hover:underline"
                  >
                    <Compass size={12} /> {L.open_lead} <ArrowSquareOut size={11} />
                  </Link>
                )}
              </div>
            )}

            {/* Missing analysis — Run button */}
            {!ci && (
              <div className="border border-amber-200 bg-amber-50 rounded-md p-3 text-xs text-amber-800 space-y-2">
                <div>{L.detail_missing}</div>
                {data?.recording_available ? (
                  <button
                    type="button"
                    onClick={runIntelligence}
                    disabled={running}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 disabled:opacity-50"
                    data-testid="ci-detail-run"
                  >
                    <Sparkle size={13} weight="fill" />
                    {running ? L.running : L.detail_run}
                  </button>
                ) : (
                  <div className="text-[11px] italic">No recording is available for this call.</div>
                )}
              </div>
            )}

            {/* Summary */}
            {ci?.summary && (
              <Section title={L.detail_summary} icon={ChatCenteredDots}>
                <div className="text-sm text-zinc-800 whitespace-pre-wrap leading-snug">
                  {ci.summary}
                </div>
              </Section>
            )}

            {/* Next actions */}
            {Array.isArray(ci?.next_actions) && ci.next_actions.length > 0 && (
              <Section title={L.detail_next} icon={ArrowRight}>
                <ul className="space-y-1">
                  {ci.next_actions.map((a, i) => (
                    <li key={i} className="text-sm text-emerald-800 flex items-start gap-1.5">
                      <CheckCircle size={13} weight="duotone" className="text-emerald-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="font-medium">{a.action || a}</div>
                        {a.priority && (
                          <div className="text-[10px] uppercase text-zinc-500">priority: {a.priority}{a.due_within ? ` · ${a.due_within}` : ''}</div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {/* Objections */}
            {Array.isArray(ci?.objections) && ci.objections.length > 0 && (
              <Section title={L.detail_objections} icon={WarningOctagon}>
                <ul className="space-y-1">
                  {ci.objections.map((o, i) => (
                    <li key={i} className="text-sm text-rose-700">• {typeof o === 'string' ? o : (o.text || JSON.stringify(o))}</li>
                  ))}
                </ul>
              </Section>
            )}

            {/* Risks */}
            {Array.isArray(ci?.risks) && ci.risks.length > 0 && (
              <Section title={L.detail_risks} icon={WarningOctagon}>
                <ul className="space-y-1">
                  {ci.risks.map((r, i) => (
                    <li key={i} className="text-sm text-amber-700">• {typeof r === 'string' ? r : (r.text || JSON.stringify(r))}</li>
                  ))}
                </ul>
              </Section>
            )}

            {/* Coaching feedback */}
            {ci?.coaching_feedback && (
              <Section title={L.detail_coaching} icon={Sparkle}>
                <div className="text-sm text-zinc-800 whitespace-pre-wrap leading-snug bg-indigo-50/50 rounded-md p-2 border border-indigo-100">
                  {typeof ci.coaching_feedback === 'string' ? ci.coaching_feedback : JSON.stringify(ci.coaching_feedback, null, 2)}
                </div>
              </Section>
            )}

            {/* Transcript */}
            <Section title={L.detail_transcript} icon={Waveform}>
              {tr?.full_text ? (
                <pre className="text-xs whitespace-pre-wrap font-mono leading-relaxed text-zinc-700 bg-zinc-50 rounded-md p-2 border border-zinc-100 max-h-64 overflow-y-auto">
                  {tr.full_text}
                </pre>
              ) : (
                <div className="text-xs italic text-zinc-400">{L.detail_transcript_empty}</div>
              )}
            </Section>
          </>
        )}
      </div>
    </div>
  );
};

const Section = ({ title, icon: Icon, children }) => (
  <div>
    <div className="text-[11px] uppercase tracking-wide text-zinc-500 font-semibold mb-1 flex items-center gap-1">
      {Icon && <Icon size={12} weight="duotone" className="text-indigo-600" />}
      {title}
    </div>
    {children}
  </div>
);
