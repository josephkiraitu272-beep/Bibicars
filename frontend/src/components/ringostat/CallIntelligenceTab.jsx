/**
 * BIBI Cars — Wave 2A-CI — CallIntelligenceTab
 * ==============================================
 *
 * Team-level dashboard for Call Intelligence, rendered inside the
 * Telephony admin page (RingostatAdminPage → tab "intelligence").
 *
 * Two widgets:
 *   1. Coaching Stats  — GET /api/admin/calls/intelligence/stats
 *      Aggregate signals for the whole team (30-day window):
 *         • total calls with CI
 *         • high-intent count
 *         • next-action coverage  (WHAT % of calls have next_actions set)
 *         • price-objection count
 *         • positive vs negative sentiment
 *   2. Deal-risk feed — GET /api/admin/calls/intelligence/at-risk
 *      High purchase-intent calls WITHOUT any next_action → risk of losing
 *      the lead.  Row click opens the call in the standard Sheet drawer.
 *
 * Fully i18n (EN / BG / UK) via useLang.  Mobile-adaptive: KPIs stack from
 * 4-col → 2-col → 1-col; deal-risk list becomes card-style on narrow
 * viewports.  All interactive elements expose data-testid=`ci-tab-*`.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Brain, TrendUp, WarningOctagon, Sparkle, Robot, ArrowRight,
  ChartBar, UserFocus, CurrencyEur, Smiley, SmileyMeh,
  Waveform, Translate, PhoneIncoming, PhoneOutgoing, Phone,
  ChatCenteredDots, ArrowsClockwise,
} from '@phosphor-icons/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useLang } from '../../i18n';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';

const T = {
  en: {
    title: 'Call Intelligence',
    subtitle: 'AI-extracted signals from the last 30 days of calls.',
    ai_disabled_title: 'OpenAI not configured yet',
    ai_disabled_hint: 'Go to Admin → System → AI · OpenAI to paste the API key. Once saved, the next call recording will be transcribed & analysed automatically.',
    kpi_total: 'Analysed calls',
    kpi_high_intent: 'High intent',
    kpi_coverage: 'Next-step coverage',
    kpi_objections_price: 'Price objections',
    kpi_positive: 'Positive sentiment',
    kpi_negative: 'Negative sentiment',
    risk_title: 'Deal-risk feed',
    risk_hint: 'High-intent calls with NO scheduled next action — a lead is likely to be lost.',
    risk_empty: 'No calls at risk in the current window — well done!',
    risk_view: 'Open',
    footer_note: 'Data auto-refreshes every 60 seconds. Backend endpoints: /intelligence/stats, /intelligence/at-risk.',
    loading: 'Loading…',
    zero_state_title: 'No AI analyses yet',
    zero_state_hint: 'Once the first call is transcribed, statistics will appear here.',
    recent_title: 'Recent AI analyses',
    recent_hint: 'The last 20 transcribed & analysed calls, newest first.',
    recent_empty: 'No analysed calls yet. Once a call recording lands in Ringostat and OpenAI is configured, it will show up here.',
    recent_view: 'Open',
    intent_label: 'Intent',
    sentiment_label: 'Sentiment',
    language_label: 'Language',
    lang_pin_label: 'Preferred transcription language',
    lang_auto: 'auto-detect',
    refresh: 'Refresh',
    configure_openai_cta: 'Configure OpenAI',
  },
  bg: {
    title: 'Анализ на разговорите',
    subtitle: 'AI сигнали от последните 30 дни.',
    ai_disabled_title: 'OpenAI все още не е конфигуриран',
    ai_disabled_hint: 'Отидете в Admin → System → AI · OpenAI и въведете API ключа. След това следващият запис ще бъде транскрибиран и анализиран автоматично.',
    kpi_total: 'Анализирани разговори',
    kpi_high_intent: 'Висок интерес',
    kpi_coverage: 'Покритие със следваща стъпка',
    kpi_objections_price: 'Възражения за цената',
    kpi_positive: 'Положителен тон',
    kpi_negative: 'Отрицателен тон',
    risk_title: 'Рискови сделки',
    risk_hint: 'Разговори с висок интерес, но БЕЗ насрочена следваща стъпка — вероятно ще загубим клиента.',
    risk_empty: 'Няма рискови разговори в момента.',
    risk_view: 'Отвори',
    footer_note: 'Данните се опресняват на всеки 60 секунди.',
    loading: 'Зареждаме…',
    zero_state_title: 'Все още няма AI анализи',
    zero_state_hint: 'След първата успешна транскрипция статистиките ще се появят тук.',
    recent_title: 'Скорошни AI анализи',
    recent_hint: 'Последните 20 транскрибирани и анализирани разговора, най-новите отгоре.',
    recent_empty: 'Все още няма анализирани разговори. След като запис пристигне в Ringostat и OpenAI е конфигуриран, ще се появи тук.',
    recent_view: 'Отвори',
    intent_label: 'Интерес',
    sentiment_label: 'Тон',
    language_label: 'Език',
    lang_pin_label: 'Предпочитан език за транскрипция',
    lang_auto: 'авто-детекция',
    refresh: 'Опресни',
    configure_openai_cta: 'Настрой OpenAI',
  },
  uk: {
    title: 'Аналіз розмов',
    subtitle: 'AI-сигнали за останні 30 днів.',
    ai_disabled_title: 'OpenAI ще не налаштовано',
    ai_disabled_hint: 'Перейдіть у Admin → System → AI · OpenAI і додайте API ключ. Наступний запис буде транскрибовано автоматично.',
    kpi_total: 'Проаналізовано дзвінків',
    kpi_high_intent: 'Високий інтерес',
    kpi_coverage: 'Покриття наступного кроку',
    kpi_objections_price: 'Заперечення за ціною',
    kpi_positive: 'Позитивний тон',
    kpi_negative: 'Негативний тон',
    risk_title: 'Стрічка ризикових угод',
    risk_hint: 'Дзвінки з високим наміром і БЕЗ запланованої наступної дії.',
    risk_empty: 'Ризикових дзвінків зараз немає.',
    risk_view: 'Відкрити',
    footer_note: 'Дані оновлюються кожні 60 секунд.',
    loading: 'Завантаження…',
    zero_state_title: 'Ще немає AI аналізів',
    zero_state_hint: 'Після першої транскрипції з’явиться статистика.',
    recent_title: 'Останні AI аналізи',
    recent_hint: 'Останні 20 розшифрованих та проаналізованих дзвінків, найновіші зверху.',
    recent_empty: 'Ще немає проаналізованих дзвінків. Після того як запис потрапить у Ringostat і OpenAI буде налаштовано, він з’явиться тут.',
    recent_view: 'Відкрити',
    intent_label: 'Інтерес',
    sentiment_label: 'Тон',
    language_label: 'Мова',
    lang_pin_label: 'Бажана мова транскрипції',
    lang_auto: 'авто-детекція',
    refresh: 'Оновити',
    configure_openai_cta: 'Налаштувати OpenAI',
  },
};

const pickLang = (raw) => {
  const c = (raw || 'en').toLowerCase();
  if (c.startsWith('bg')) return 'bg';
  if (c.startsWith('uk') || c.startsWith('ua')) return 'uk';
  return 'en';
};

const authHeaders = () => {
  const token = (() => {
    try { return localStorage.getItem('token') || ''; } catch { return ''; }
  })();
  return {
    'Content-Type': 'application/json',
    Authorization: token ? `Bearer ${token}` : '',
  };
};

const KpiCard = ({ icon: Icon, label, value, tone = 'zinc', testid }) => (
  <Card data-testid={testid} className="border-[#E4E4E7]">
    <CardContent className="p-4">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-zinc-500">
        {Icon && <Icon size={14} weight="duotone" className={
          tone === 'green'  ? 'text-emerald-600'  :
          tone === 'red'    ? 'text-rose-600'     :
          tone === 'amber'  ? 'text-amber-600'    :
          tone === 'blue'   ? 'text-sky-600'      :
          tone === 'indigo' ? 'text-indigo-600'   :
                              'text-zinc-500'
        } />}
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold ${
        tone === 'green' ? 'text-emerald-700' :
        tone === 'red'   ? 'text-rose-700'    :
        tone === 'amber' ? 'text-amber-700'   :
        tone === 'blue'  ? 'text-sky-700'     :
                            'text-zinc-900'
      }`}>{value}</div>
    </CardContent>
  </Card>
);

export default function CallIntelligenceTab({ onOpenCall }) {
  const langCtx = useLang();
  const L = T[pickLang(langCtx?.lang)] || T.en;

  const [config, setConfig] = useState(null);
  const [stats, setStats]   = useState(null);
  const [risk, setRisk]     = useState({ items: [], count: 0 });
  const [recent, setRecent] = useState({ items: [], count: 0 });
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const [cfgR, stR, riskR, recentR] = await Promise.all([
        fetch(`${BACKEND_URL}/api/admin/calls/intelligence/config`,   { headers: authHeaders() }),
        fetch(`${BACKEND_URL}/api/admin/calls/intelligence/stats`,    { headers: authHeaders() }),
        fetch(`${BACKEND_URL}/api/admin/calls/intelligence/at-risk`,  { headers: authHeaders() }),
        fetch(`${BACKEND_URL}/api/admin/calls/intelligence/recent?limit=20`, { headers: authHeaders() }),
      ]);
      const cfg  = await cfgR.json().catch(() => ({}));
      const st   = await stR.json().catch(() => ({}));
      const rk   = await riskR.json().catch(() => ({ items: [] }));
      const rc   = await recentR.json().catch(() => ({ items: [] }));
      setConfig(cfg);
      setStats(st?.stats || null);
      setRisk({ items: rk?.items || [], count: rk?.count || 0 });
      setRecent({ items: rc?.items || [], count: rc?.count || 0 });
    } catch (e) { /* noop */ } // eslint-disable-line no-empty
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    reload();
    const iv = setInterval(reload, 60_000);
    return () => clearInterval(iv);
  }, [reload]);

  const total       = stats?.total_calls_with_ci ?? 0;
  const highIntent  = stats?.high_intent ?? 0;
  const coveragePct = Math.round(((stats?.next_action_coverage ?? 0) * 100));
  const priceObj    = stats?.objection_price ?? 0;
  const positive    = stats?.positive ?? 0;
  const negative    = stats?.negative ?? 0;

  return (
    <div className="space-y-4" data-testid="ci-tab-root">
      {/* Heading */}
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center">
          <Brain size={22} weight="duotone" className="text-indigo-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-lg font-semibold text-zinc-900">{L.title}</div>
          <div className="text-sm text-zinc-500">{L.subtitle}</div>
          {config?.openai_configured && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 font-medium">
                <Sparkle size={11} weight="fill" /> OpenAI ready
              </span>
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
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700"
                  title={L.lang_pin_label}
                >
                  <Translate size={11} weight="duotone" /> {config.transcribe_language === 'auto' ? L.lang_auto : config.transcribe_language.toUpperCase()}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={reload}
            disabled={loading}
            data-testid="ci-tab-refresh"
            className="gap-1.5"
          >
            <ArrowsClockwise size={14} weight={loading ? 'fill' : 'duotone'} className={loading ? 'animate-spin' : ''} />
            {L.refresh}
          </Button>
          {config?.can_configure_key && (
            <a
              href="/admin/settings?tab=ai"
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 text-xs font-semibold"
              data-testid="ci-tab-configure-openai-header"
            >
              <Brain size={14} weight="duotone" />
              {L.configure_openai_cta}
            </a>
          )}
        </div>
      </div>

      {/* OpenAI not configured banner */}
      {config && !config.openai_configured && (
        <div className="border border-amber-200 bg-amber-50 rounded-lg p-4" data-testid="ci-tab-openai-missing">
          <div className="flex items-center gap-2 font-medium text-amber-900">
            <WarningOctagon size={18} weight="fill" className="text-amber-700" />
            {L.ai_disabled_title}
          </div>
          <p className="text-xs text-amber-800 mt-1">{L.ai_disabled_hint}</p>
          {config.can_configure_key && (
            <a
              href="/admin/settings?tab=ai"
              className="inline-flex items-center gap-1 mt-2 h-8 px-3 rounded-md bg-amber-900 text-white text-xs font-semibold hover:bg-amber-800"
              data-testid="ci-tab-openai-link"
            >
              Configure OpenAI <ArrowRight size={12} />
            </a>
          )}
        </div>
      )}

      {/* KPI grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={ChartBar}    label={L.kpi_total}            value={total}         tone="indigo" testid="ci-kpi-total" />
        <KpiCard icon={Sparkle}     label={L.kpi_high_intent}      value={highIntent}    tone="green"  testid="ci-kpi-high-intent" />
        <KpiCard icon={UserFocus}   label={L.kpi_coverage}         value={`${coveragePct}%`} tone={coveragePct >= 70 ? 'green' : coveragePct >= 40 ? 'amber' : 'red'} testid="ci-kpi-coverage" />
        <KpiCard icon={CurrencyEur} label={L.kpi_objections_price} value={priceObj}      tone="amber"  testid="ci-kpi-price-obj" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <KpiCard icon={Smiley}     label={L.kpi_positive} value={positive} tone="green" testid="ci-kpi-positive" />
        <KpiCard icon={SmileyMeh}  label={L.kpi_negative} value={negative} tone="red"   testid="ci-kpi-negative" />
      </div>

      {/* Deal-risk feed */}
      <Card className="border-[#E4E4E7]">
        <CardHeader className="pb-3">
          <div className="flex items-start gap-2">
            <WarningOctagon size={18} weight="duotone" className="text-rose-600 mt-0.5" />
            <div className="flex-1">
              <CardTitle className="text-base">{L.risk_title}</CardTitle>
              <div className="text-xs text-zinc-500 mt-0.5">{L.risk_hint}</div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-zinc-500">{L.loading}</div>
          ) : risk.items.length === 0 ? (
            total === 0 && !config?.openai_configured ? (
              <div className="text-sm text-zinc-500" data-testid="ci-risk-zero">
                <div className="font-medium text-zinc-700">{L.zero_state_title}</div>
                <div className="mt-0.5">{L.zero_state_hint}</div>
              </div>
            ) : (
              <div className="text-sm text-emerald-700 flex items-center gap-2" data-testid="ci-risk-empty">
                <TrendUp size={16} weight="duotone" />
                {L.risk_empty}
              </div>
            )
          ) : (
            <ul className="divide-y divide-[#F4F4F5]" data-testid="ci-risk-list">
              {risk.items.map((r) => (
                <li key={r._id || r.call_id} className="py-2.5 flex flex-col sm:flex-row sm:items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-zinc-900 truncate">{r.summary || <span className="italic text-zinc-400">—</span>}</div>
                    <div className="text-[11px] text-zinc-500 flex flex-wrap items-center gap-2 mt-0.5">
                      <span className="capitalize">Intent: <b>{String(r.purchase_intent || '').replace('_',' ')}</b></span>
                      {r.sentiment && <span className="capitalize">· Sentiment: {r.sentiment}</span>}
                      {r.created_at && <span>· {new Date(r.created_at).toLocaleString()}</span>}
                    </div>
                  </div>
                  {onOpenCall && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onOpenCall(r.call_id)}
                      data-testid={`ci-risk-open-${r.call_id}`}
                      className="self-start sm:self-auto"
                    >
                      {L.risk_view}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Recent AI analyses feed */}
      <Card className="border-[#E4E4E7]" data-testid="ci-recent-card">
        <CardHeader className="pb-3">
          <div className="flex items-start gap-2">
            <ChatCenteredDots size={18} weight="duotone" className="text-indigo-600 mt-0.5" />
            <div className="flex-1">
              <CardTitle className="text-base">{L.recent_title}</CardTitle>
              <div className="text-xs text-zinc-500 mt-0.5">{L.recent_hint}</div>
            </div>
            {recent?.count > 0 && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 font-medium">
                {recent.count}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-zinc-500">{L.loading}</div>
          ) : recent.items.length === 0 ? (
            <div className="text-sm text-zinc-500 py-4" data-testid="ci-recent-empty">
              {L.recent_empty}
            </div>
          ) : (
            <ul className="divide-y divide-[#F4F4F5]" data-testid="ci-recent-list">
              {recent.items.map((r) => {
                const dirIcon = r.direction === 'inbound' ? (
                  <PhoneIncoming size={14} weight="duotone" className="text-emerald-600" />
                ) : r.direction === 'outbound' ? (
                  <PhoneOutgoing size={14} weight="duotone" className="text-sky-600" />
                ) : (
                  <Phone size={14} weight="duotone" className="text-zinc-500" />
                );
                const intentTone =
                  r.purchase_intent === 'very_high' ? 'bg-emerald-100 text-emerald-800' :
                  r.purchase_intent === 'high'      ? 'bg-emerald-50 text-emerald-700' :
                  r.purchase_intent === 'medium'    ? 'bg-amber-50 text-amber-700' :
                                                     'bg-zinc-100 text-zinc-600';
                const sentimentTone =
                  r.sentiment === 'positive' ? 'bg-emerald-50 text-emerald-700' :
                  r.sentiment === 'negative' ? 'bg-rose-50 text-rose-700' :
                  r.sentiment === 'mixed'    ? 'bg-amber-50 text-amber-700' :
                                              'bg-zinc-100 text-zinc-600';
                return (
                  <li key={r.call_id} className="py-3 flex flex-col sm:flex-row sm:items-start gap-2.5" data-testid={`ci-recent-row-${r.call_id}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        {dirIcon}
                        {r.started_at && (
                          <span className="text-[11px] text-zinc-500">{new Date(r.started_at).toLocaleString()}</span>
                        )}
                        {r.manager_name && (
                          <span className="text-[11px] text-zinc-600">· {r.manager_name}</span>
                        )}
                        {r.language && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] uppercase px-1.5 py-0.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 font-medium">
                            <Translate size={10} weight="duotone" /> {String(r.language).toUpperCase()}
                          </span>
                        )}
                        {r.purchase_intent && (
                          <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded-full font-medium ${intentTone}`}>
                            {L.intent_label}: {String(r.purchase_intent).replace('_', ' ')}
                          </span>
                        )}
                        {r.sentiment && (
                          <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded-full font-medium ${sentimentTone}`}>
                            {L.sentiment_label}: {r.sentiment}
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
                    </div>
                    {onOpenCall && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onOpenCall(r.call_id)}
                        data-testid={`ci-recent-open-${r.call_id}`}
                        className="self-start sm:self-auto shrink-0"
                      >
                        {L.recent_view}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="text-[10px] text-zinc-400 pt-2">
        {L.footer_note}
      </div>
    </div>
  );
}

/* ─────────────────────────── Small helpers ─────────────────────── */

// (kept below the default export to avoid churn in the module boundary)
