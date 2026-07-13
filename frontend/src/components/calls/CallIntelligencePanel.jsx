/**
 * BIBI Cars — Wave 2A-CI — CallIntelligencePanel
 * =================================================
 *
 * AI Summary + Transcript panel rendered inside CallDrawer / Manager Calls
 * sheet / Customer360 → Calls.
 *
 * i18n:  EN + BG + UK (only staff cabinets), driven by useLang().
 * RBAC:  read/process/apply → admin | team_lead | manager (backend enforces).
 *        Configure-OpenAI hint changes wording for admins vs managers.
 * Mobile: fully responsive — desktop grid collapses to a single column
 *         under 480 px; tabs stack and buttons grow to full-width.
 *
 * All interactive elements expose `data-testid="call-ci-*"` for E2E tests.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Brain,
  Sparkle,
  CheckCircle,
  WarningOctagon,
  ArrowClockwise,
  ChatCircleText,
  Target,
  Calendar,
  CurrencyEur,
  Compass,
  Wrench,
  FlagBanner,
  UserFocus,
  Robot,
  ArrowSquareOut,
} from '@phosphor-icons/react';
import { API_URL } from '../../api-config';
import { useLang } from '../../i18n';

/* ─── inline i18n (self-contained, no touching the giant translations.js) ── */

const CI_I18N = {
  en: {
    heading:              'Call Intelligence',
    tab_summary:          'AI Summary',
    tab_transcript:       'Transcript',
    status_not_started:   'Not analysed yet',
    status_pending:       'Analysing…',
    status_running:       'Analysing…',
    status_ready:         'Ready',
    status_failed:        'Failed',
    status_analyze_failed:'Analysis failed',
    status_no_recording:  'No recording',
    status_empty_transcript:'Empty transcript',
    empty_title:          'Analyse this call with AI',
    empty_hint:           'We\'ll transcribe the recording, then extract summary, budget, objections and next steps.',
    process_cta:          'Analyse now',
    processing_cta:       'Working…',
    processing_note:      'Transcribing & analysing — this usually takes 20–40 seconds…',
    reanalyse:            'Re-analyse',
    reanalyse_title:      'Re-run analysis',
    retry:                'Retry',
    no_recording:         'No recording available for this call — nothing to transcribe.',
    loading:              'Loading Call Intelligence…',
    no_summary:           'No summary yet.',
    no_transcript:        'No transcript available.',
    sentiment:            'Sentiment',
    intent:               'Intent',
    deal:                 'Deal',
    conf:                 'conf',
    customer_intent:      'Customer intent',
    budget:               'Budget',
    country:              'Country',
    vehicle_prefs:        'Vehicle preferences',
    objections:           'Objections',
    agreements:           'Agreements',
    next_actions:         'Next actions',
    risks:                'Deal risks',
    due:                  'Due',
    lang:                 'Language',
    model:                'Model',
    auto_task:            'Follow-up task auto-created',
    openai_missing:       'OpenAI is not configured',
    openai_hint_admin_html:'Add your OpenAI API key in <b>Admin → Integrations → OpenAI</b>, then click <b>Analyse now</b>.',
    openai_hint_manager:  'Ask your admin to add an OpenAI API key in Admin → Integrations → OpenAI, then this call will be transcribed automatically.',
    openai_link:          'Open Integrations',
  },
  bg: {
    heading:              'Анализ на разговора',
    tab_summary:          'AI Обобщение',
    tab_transcript:       'Транскрипция',
    status_not_started:   'Все още не е анализиран',
    status_pending:       'Анализира се…',
    status_running:       'Анализира се…',
    status_ready:         'Готово',
    status_failed:        'Неуспешно',
    status_analyze_failed:'Анализът пропадна',
    status_no_recording:  'Няма запис',
    status_empty_transcript:'Празна транскрипция',
    empty_title:          'Анализирайте разговора с AI',
    empty_hint:           'Ще транскрибираме записа и ще извлечем обобщение, бюджет, възражения и следващи стъпки.',
    process_cta:          'Анализирай сега',
    processing_cta:       'Обработка…',
    processing_note:      'Транскрибираме и анализираме — обикновено отнема 20–40 секунди…',
    reanalyse:            'Повторен анализ',
    reanalyse_title:      'Пусни отново анализа',
    retry:                'Опитай отново',
    no_recording:         'Няма запис за този разговор — няма какво да се транскрибира.',
    loading:              'Зареждаме Call Intelligence…',
    no_summary:           'Все още няма обобщение.',
    no_transcript:        'Няма налична транскрипция.',
    sentiment:            'Тон',
    intent:               'Интерес',
    deal:                 'Сделка',
    conf:                 'дов.',
    customer_intent:      'Намерение на клиента',
    budget:               'Бюджет',
    country:              'Държава',
    vehicle_prefs:        'Предпочитания за автомобил',
    objections:           'Възражения',
    agreements:           'Договорености',
    next_actions:         'Следващи стъпки',
    risks:                'Рискове по сделката',
    due:                  'Срок',
    lang:                 'Език',
    model:                'Модел',
    auto_task:            'Автоматично създадена follow-up задача',
    openai_missing:       'OpenAI не е конфигуриран',
    openai_hint_admin_html:'Добавете OpenAI API ключа си в <b>Admin → Integrations → OpenAI</b> и натиснете <b>Анализирай сега</b>.',
    openai_hint_manager:  'Помолете администратора да добави OpenAI API ключ в Admin → Integrations → OpenAI — тогава този разговор ще бъде транскрибиран автоматично.',
    openai_link:          'Отвори интеграциите',
  },
  uk: {
    heading:              'Аналіз розмови',
    tab_summary:          'AI резюме',
    tab_transcript:       'Транскрипція',
    status_not_started:   'Ще не аналізовано',
    status_pending:       'Аналізуємо…',
    status_running:       'Аналізуємо…',
    status_ready:         'Готово',
    status_failed:        'Помилка',
    status_analyze_failed:'Аналіз не вдався',
    status_no_recording:  'Немає запису',
    status_empty_transcript:'Порожня транскрипція',
    empty_title:          'Проаналізувати дзвінок з AI',
    empty_hint:           'Ми транскрибуємо запис і витягнемо резюме, бюджет, заперечення та наступні кроки.',
    process_cta:          'Аналізувати зараз',
    processing_cta:       'Обробка…',
    processing_note:      'Транскрибуємо та аналізуємо — зазвичай 20–40 секунд…',
    reanalyse:            'Повторний аналіз',
    reanalyse_title:      'Перезапустити аналіз',
    retry:                'Повторити',
    no_recording:         'Для цього дзвінка немає запису — транскрибувати нічого.',
    loading:              'Завантажуємо Call Intelligence…',
    no_summary:           'Ще немає резюме.',
    no_transcript:        'Транскрипція недоступна.',
    sentiment:            'Тон',
    intent:               'Наміри',
    deal:                 'Угода',
    conf:                 'впев.',
    customer_intent:      'Намір клієнта',
    budget:               'Бюджет',
    country:              'Країна',
    vehicle_prefs:        'Побажання щодо авто',
    objections:           'Заперечення',
    agreements:           'Домовленості',
    next_actions:         'Наступні кроки',
    risks:                'Ризики угоди',
    due:                  'Термін',
    lang:                 'Мова',
    model:                'Модель',
    auto_task:            'Follow-up задачу створено автоматично',
    openai_missing:       'OpenAI не налаштовано',
    openai_hint_admin_html:'Додайте OpenAI API ключ у <b>Admin → Integrations → OpenAI</b> і натисніть <b>Аналізувати зараз</b>.',
    openai_hint_manager:  'Попросіть адміністратора додати OpenAI API ключ у Admin → Integrations → OpenAI — після цього дзвінок буде транскрибовано автоматично.',
    openai_link:          'Відкрити інтеграції',
  },
};

const pickLang = (raw) => {
  const code = (raw || 'en').toLowerCase();
  if (code.startsWith('bg')) return 'bg';
  if (code.startsWith('uk') || code.startsWith('ua')) return 'uk';
  return 'en';
};

/* ─── HTTP helpers ───────────────────────────────────────────────────── */

const authHeaders = () => {
  const token = (() => {
    try { return localStorage.getItem('token') || ''; } catch { return ''; }
  })();
  return {
    'Content-Type': 'application/json',
    Authorization: token ? `Bearer ${token}` : '',
  };
};

/* ─── style tokens ───────────────────────────────────────────────────── */

const SENTIMENT_COLORS = {
  positive: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  neutral:  'bg-zinc-50 text-zinc-700 border-zinc-200',
  negative: 'bg-rose-50 text-rose-700 border-rose-200',
  mixed:    'bg-amber-50 text-amber-700 border-amber-200',
};

const INTENT_COLORS = {
  low:        'bg-zinc-100 text-zinc-600',
  medium:     'bg-sky-100 text-sky-700',
  high:       'bg-emerald-100 text-emerald-700',
  very_high:  'bg-emerald-200 text-emerald-800 font-semibold',
};

/* ─── small primitives ───────────────────────────────────────────────── */

const FieldRow = ({ icon: Icon, label, children, testid }) => (
  <div className="flex items-start gap-2.5" data-testid={testid}>
    {Icon && <Icon size={15} weight="duotone" className="text-indigo-600 mt-0.5 shrink-0" />}
    <div className="flex-1 min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="text-sm text-zinc-900 break-words">{children}</div>
    </div>
  </div>
);

const Chip = ({ children, tone = 'zinc' }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${
    tone === 'red'    ? 'bg-rose-50 text-rose-700 border-rose-200'    :
    tone === 'amber'  ? 'bg-amber-50 text-amber-700 border-amber-200' :
    tone === 'green'  ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
    tone === 'blue'   ? 'bg-sky-50 text-sky-700 border-sky-200'       :
    'bg-zinc-50 text-zinc-700 border-zinc-200'
  }`}>
    {children}
  </span>
);

/* ─────────────────────────────────────────────────────────────────── */

export default function CallIntelligencePanel({ callId, recordingAvailable }) {
  const langCtx = useLang();
  const L = CI_I18N[pickLang(langCtx?.lang)] || CI_I18N.en;

  const [data, setData]         = useState(null);
  const [config, setConfig]     = useState(null);
  const [loading, setLoading]   = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError]       = useState(null);
  const [tab, setTab]           = useState('summary');
  const pollRef = useRef(null);

  // ── Load config (OpenAI configured? + user role) once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API_URL}/api/admin/calls/intelligence/config`, {
          headers: authHeaders(),
        });
        const j = await r.json();
        if (!cancelled) setConfig(j);
      } catch {
        if (!cancelled) setConfig({ openai_configured: false, can_configure_key: false });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const fetchData = useCallback(async () => {
    if (!callId) return null;
    try {
      const r = await fetch(`${API_URL}/api/admin/calls/${encodeURIComponent(callId)}/intelligence`, {
        headers: authHeaders(),
      });
      const j = await r.json();
      setData(j);
      setError(null);
      return j;
    } catch (e) {
      setError(String(e));
      return null;
    } finally {
      setLoading(false);
    }
  }, [callId]);

  useEffect(() => {
    setLoading(true);
    fetchData();
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId]);

  useEffect(() => {
    const status = data?.status;
    const shouldPoll = status === 'pending' || status === 'running';
    if (shouldPoll && !pollRef.current) {
      pollRef.current = setInterval(fetchData, 5000);
    }
    if (!shouldPoll && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return undefined;
  }, [data?.status, fetchData]);

  const process = useCallback(async (force = false) => {
    if (!callId) return;
    setProcessing(true);
    setError(null);
    try {
      const r = await fetch(
        `${API_URL}/api/admin/calls/${encodeURIComponent(callId)}/intelligence/process`,
        { method: 'POST', headers: authHeaders(), body: JSON.stringify({ force }) },
      );
      const j = await r.json();
      if (j?.success === false && j?.error) setError(j.error);
      await fetchData();
    } catch (e) {
      setError(String(e));
    } finally {
      setProcessing(false);
    }
  }, [callId, fetchData]);

  const ci = data?.intelligence || null;
  const tr = data?.transcript || null;
  const status = data?.status || 'not_started';

  const canConfigure   = !!config?.can_configure_key;
  const showConfigCta  = config && !config.openai_configured;
  const showProcessCta =
    !ci &&
    !processing &&
    recordingAvailable &&
    !showConfigCta &&
    ['not_started', 'failed', 'analyze_failed', 'empty_transcript'].includes(status);

  const summaryLine = ci?.summary || '';

  /* ─────── render ─────── */

  if (loading) {
    return (
      <div className="border border-[#E4E4E7] rounded-md p-3 text-sm text-zinc-500 flex items-center gap-2">
        <Brain size={16} weight="duotone" className="text-indigo-500 animate-pulse" />
        {L.loading}
      </div>
    );
  }

  const STATUS_LABEL = {
    not_started:      L.status_not_started,
    pending:          L.status_pending,
    running:          L.status_running,
    ready:            L.status_ready,
    failed:           L.status_failed,
    analyze_failed:   L.status_analyze_failed,
    no_recording:     L.status_no_recording,
    empty_transcript: L.status_empty_transcript,
  };

  return (
    <div data-testid="call-ci-panel" className="space-y-3 w-full">
      {/* Header — stacks on mobile */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="text-[11px] uppercase tracking-wide text-zinc-500 flex items-center gap-1.5">
          <Sparkle size={14} weight="duotone" className="text-indigo-600" />
          {L.heading}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] uppercase tracking-wider font-medium ${
              status === 'ready' ? 'bg-emerald-50 text-emerald-700' :
              status === 'pending' || status === 'running' ? 'bg-amber-50 text-amber-700' :
              status.includes('failed') || status === 'empty_transcript' ? 'bg-rose-50 text-rose-700' :
              'bg-zinc-100 text-zinc-600'
            }`}
            data-testid="call-ci-status"
          >
            {STATUS_LABEL[status] || status}
          </span>
          {ci && (
            <button
              type="button"
              onClick={() => process(true)}
              disabled={processing}
              className="h-7 px-2 rounded-md text-[11px] font-medium bg-zinc-100 hover:bg-zinc-200 text-zinc-700 disabled:opacity-50 flex items-center gap-1"
              data-testid="call-ci-reprocess"
              title={L.reanalyse_title}
            >
              <ArrowClockwise size={12} />
              {L.reanalyse}
            </button>
          )}
        </div>
      </div>

      {/* Configure OpenAI CTA — differs for admin vs manager */}
      {showConfigCta && (
        <div className="border border-amber-200 bg-amber-50 rounded-md p-3 text-sm text-amber-900" data-testid="call-ci-openai-missing">
          <div className="font-medium flex items-center gap-1.5">
            <WarningOctagon size={16} weight="fill" className="text-amber-700" />
            {L.openai_missing}
          </div>
          {canConfigure ? (
            <>
              <p className="text-xs mt-1 text-amber-800"
                 dangerouslySetInnerHTML={{ __html: L.openai_hint_admin_html }} />
              <a
                href="/admin/integrations?provider=openai"
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-900 hover:underline"
                data-testid="call-ci-openai-link"
              >
                {L.openai_link} <ArrowSquareOut size={12} />
              </a>
            </>
          ) : (
            <p className="text-xs mt-1 text-amber-800" data-testid="call-ci-openai-hint-manager">
              {L.openai_hint_manager}
            </p>
          )}
        </div>
      )}

      {/* No recording */}
      {!recordingAvailable && (
        <div className="border border-dashed border-zinc-200 bg-zinc-50 rounded-md p-3 text-sm text-zinc-500" data-testid="call-ci-no-recording">
          {L.no_recording}
        </div>
      )}

      {/* Empty state / Process CTA */}
      {showProcessCta && (
        <div className="border border-indigo-200 bg-indigo-50/50 rounded-md p-3" data-testid="call-ci-empty">
          <div className="text-sm text-zinc-900 font-medium flex items-center gap-1.5">
            <Robot size={16} weight="duotone" className="text-indigo-600" />
            {L.empty_title}
          </div>
          <p className="text-xs text-zinc-600 mt-1">
            {L.empty_hint}{' '}
            {config?.transcribe_model && (
              <span className="text-zinc-500">
                (<code className="px-1 rounded bg-white/70">{config.transcribe_model}</code> + <code className="px-1 rounded bg-white/70">{config.analyze_model}</code>)
              </span>
            )}
          </p>
          <button
            type="button"
            onClick={() => process(false)}
            disabled={processing}
            className="mt-2 h-9 px-4 w-full sm:w-auto rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
            data-testid="call-ci-process"
          >
            <Sparkle size={13} weight="fill" />
            {processing ? L.processing_cta : L.process_cta}
          </button>
        </div>
      )}

      {/* Processing */}
      {(status === 'pending' || status === 'running' || processing) && !ci && (
        <div className="border border-amber-200 bg-amber-50 rounded-md p-3 text-sm text-amber-900 flex items-center gap-2" data-testid="call-ci-processing">
          <div className="w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          {L.processing_note}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="border border-rose-200 bg-rose-50 rounded-md p-3 text-xs text-rose-800" data-testid="call-ci-error">
          <div className="flex items-center gap-1.5 font-medium">
            <WarningOctagon size={14} weight="fill" />
            <span className="break-words">{String(error)}</span>
          </div>
          <button
            type="button"
            onClick={() => process(true)}
            className="mt-2 h-7 px-2 rounded-md bg-rose-600 text-white text-[11px] font-medium hover:bg-rose-700"
            data-testid="call-ci-retry"
          >
            {L.retry}
          </button>
        </div>
      )}

      {/* Ready — Summary + Transcript */}
      {ci && (
        <div className="border border-indigo-200 rounded-md overflow-hidden bg-white">
          {/* Tab bar */}
          <div className="flex border-b border-indigo-100 bg-indigo-50/40">
            <button
              type="button"
              onClick={() => setTab('summary')}
              className={`flex-1 px-3 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 ${
                tab === 'summary' ? 'text-indigo-700 border-b-2 border-indigo-600' : 'text-zinc-500 hover:text-zinc-700'
              }`}
              data-testid="call-ci-tab-summary"
            >
              <Brain size={13} weight="duotone" /> {L.tab_summary}
            </button>
            <button
              type="button"
              onClick={() => setTab('transcript')}
              className={`flex-1 px-3 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 ${
                tab === 'transcript' ? 'text-indigo-700 border-b-2 border-indigo-600' : 'text-zinc-500 hover:text-zinc-700'
              }`}
              data-testid="call-ci-tab-transcript"
            >
              <ChatCircleText size={13} weight="duotone" /> {L.tab_transcript}
            </button>
          </div>

          {tab === 'summary' && (
            <div className="p-3 space-y-3" data-testid="call-ci-summary">
              {/* Sentiment / intent chips */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {ci.sentiment && (
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] border ${SENTIMENT_COLORS[ci.sentiment] || SENTIMENT_COLORS.neutral}`}
                        data-testid="call-ci-sentiment">
                    {L.sentiment}: <b className="ml-1 capitalize">{ci.sentiment}</b>
                  </span>
                )}
                {ci.purchase_intent && (
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] ${INTENT_COLORS[ci.purchase_intent] || INTENT_COLORS.low}`}
                        data-testid="call-ci-intent">
                    {L.intent}: <b className="ml-1 capitalize">{String(ci.purchase_intent).replace('_',' ')}</b>
                  </span>
                )}
                {ci.deal_probability && (
                  <Chip tone={ci.deal_probability === 'high' ? 'green' : ci.deal_probability === 'medium' ? 'blue' : 'zinc'}>
                    {L.deal}: <span className="ml-0.5 capitalize">{ci.deal_probability}</span>
                  </Chip>
                )}
                {ci.confidence != null && (
                  <span className="text-[10px] text-zinc-500 ml-auto">
                    {L.conf} {Math.round((ci.confidence || 0) * 100)}%
                  </span>
                )}
              </div>

              {/* Summary text */}
              <p className="text-sm text-zinc-900 leading-relaxed" data-testid="call-ci-summary-text">
                {summaryLine || <span className="italic text-zinc-400">{L.no_summary}</span>}
              </p>

              {/* Grid — 1 col on mobile, 2 on ≥ sm */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FieldRow icon={Target} label={L.customer_intent} testid="call-ci-intent-text">
                  {ci.customer_intent || <span className="text-zinc-400">—</span>}
                </FieldRow>
                <FieldRow icon={CurrencyEur} label={L.budget} testid="call-ci-budget">
                  {ci.budget || <span className="text-zinc-400">—</span>}
                </FieldRow>
                <FieldRow icon={Compass} label={L.country} testid="call-ci-country">
                  {ci.country || <span className="text-zinc-400">—</span>}
                </FieldRow>
                <FieldRow icon={Wrench} label={L.vehicle_prefs} testid="call-ci-vehicle-prefs">
                  {(ci.vehicle_preferences || []).length ? (
                    <div className="flex flex-wrap gap-1">
                      {(ci.vehicle_preferences || []).map((p, i) => (<Chip key={i} tone="blue">{p}</Chip>))}
                    </div>
                  ) : <span className="text-zinc-400">—</span>}
                </FieldRow>
              </div>

              {(ci.objections || []).length > 0 && (
                <div data-testid="call-ci-objections">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 flex items-center gap-1">
                    <WarningOctagon size={12} weight="duotone" className="text-rose-500" /> {L.objections}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {(ci.objections || []).map((o, i) => (<Chip key={i} tone="red">{o}</Chip>))}
                  </div>
                </div>
              )}

              {(ci.agreements || []).length > 0 && (
                <div data-testid="call-ci-agreements">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 flex items-center gap-1">
                    <CheckCircle size={12} weight="duotone" className="text-emerald-600" /> {L.agreements}
                  </div>
                  <ul className="text-sm text-zinc-800 space-y-0.5 list-disc list-inside">
                    {(ci.agreements || []).map((a, i) => <li key={i}>{a}</li>)}
                  </ul>
                </div>
              )}

              {(ci.next_actions || []).length > 0 && (
                <div data-testid="call-ci-next-actions">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 flex items-center gap-1">
                    <FlagBanner size={12} weight="duotone" className="text-indigo-600" /> {L.next_actions}
                  </div>
                  <ul className="text-sm text-zinc-900 space-y-1">
                    {(ci.next_actions || []).map((a, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <UserFocus size={13} weight="duotone" className="text-zinc-500 mt-0.5 shrink-0" />
                        <div className="flex-1">
                          <div>{a?.action}</div>
                          {a?.due_date && (
                            <div className="text-[11px] text-zinc-500 flex items-center gap-0.5 mt-0.5">
                              <Calendar size={11} />
                              {L.due}: {a.due_date}
                            </div>
                          )}
                        </div>
                        {a?.owner && (<Chip tone={a.owner === 'manager' ? 'blue' : 'zinc'}>{a.owner}</Chip>)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {data?.auto_task_id && (
                <div className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-1 inline-flex items-center gap-1" data-testid="call-ci-auto-task">
                  <CheckCircle size={12} weight="fill" />
                  {L.auto_task} ({String(data.auto_task_id).slice(0,8)}…)
                </div>
              )}

              {(ci.risks || []).length > 0 && (
                <div data-testid="call-ci-risks">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">{L.risks}</div>
                  <div className="flex flex-wrap gap-1">
                    {(ci.risks || []).map((r, i) => (<Chip key={i} tone="amber">{r}</Chip>))}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'transcript' && (
            <div className="p-3 text-sm" data-testid="call-ci-transcript">
              {tr?.full_text ? (
                <>
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 flex flex-wrap items-center gap-2">
                    <span>{L.lang}: <b className="text-zinc-700">{tr.language || 'auto'}</b></span>
                    {tr.duration != null && <span>· {Math.round(tr.duration)}s</span>}
                    {tr.model && <span className="sm:ml-auto text-zinc-400">{tr.model}</span>}
                  </div>
                  <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed text-zinc-800 bg-zinc-50 border border-zinc-200 rounded-md p-2 max-h-[420px] overflow-y-auto"
                       data-testid="call-ci-transcript-text">
                    {tr.full_text}
                  </pre>
                </>
              ) : (
                <div className="text-zinc-400 italic">{L.no_transcript}</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Metadata footer */}
      {ci && (
        <div className="text-[10px] text-zinc-400 flex flex-wrap items-center gap-2">
          <span>{L.model}: {ci.model || config?.analyze_model || 'gpt-4o'}</span>
          {ci.analyzed_at && <span>· {new Date(ci.analyzed_at).toLocaleString()}</span>}
        </div>
      )}
    </div>
  );
}
