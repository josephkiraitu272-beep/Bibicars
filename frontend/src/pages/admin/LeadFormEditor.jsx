/**
 * LeadFormEditor — full form builder (Setup / Content / Fields / Routing &
 * Attribution / Tracking / Publish & Share / Analytics). Everything a form
 * needs is configured here, in the master-admin, in UK/BG/EN.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '../../api-config';
import { useLang } from '../../i18n';
import { toast } from 'sonner';
import {
  ArrowLeft, FloppyDisk, Plus, Trash, ArrowUp, ArrowDown, Copy, ArrowSquareOut,
  CheckCircle,
} from '@phosphor-icons/react';
import WhiteSelect from '../../components/ui/WhiteSelect';

const BASE_PATH = '/api/admin/lead-forms';
const LANGS = ['bg', 'en', 'uk'];
const TABS = ['setup', 'content', 'design', 'fields', 'routing', 'tracking', 'publish', 'analytics'];
const WIDGET_OPTIONS = ['auto', 'cards', 'chips', 'toggle', 'brand', 'textarea', 'input'];

const Field = ({ label, children, hint }) => (
  <div>
    <label className="mb-1.5 block text-[13px] font-medium text-[#3a3a38]">{label}</label>
    {children}
    {hint ? <p className="mt-1 text-[11px] text-[#A1A1AA]">{hint}</p> : null}
  </div>
);
const inputCls = 'w-full rounded-lg border border-[#E4E4E7] px-3 py-2 text-sm text-[#18181B] outline-none focus:border-[#FEAE00] focus:ring-2 focus:ring-[#FEAE00]/20';

export default function LeadFormEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, lang } = useLang();
  const [sp, setSp] = useSearchParams();
  const BASE = `${API_URL}${BASE_PATH}`;
  const [tab, setTab] = useState(sp.get('tab') || 'setup');
  const [form, setForm] = useState(null);
  const [registry, setRegistry] = useState([]);
  const [customTypes, setCustomTypes] = useState([]);
  const [managers, setManagers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [analytics, setAnalytics] = useState(null);
  const [copied, setCopied] = useState('');

  const load = async () => {
    const [f, reg, staff] = await Promise.all([
      axios.get(`${BASE}/${id}`),
      axios.get(`${BASE}/meta/field-registry`),
      axios.get(`${API_URL}/api/staff`).catch(() => ({ data: { items: [] } })),
    ]);
    setForm(f.data.form);
    setRegistry(reg.data.fields || []);
    setCustomTypes(reg.data.custom_types || []);
    setManagers((staff.data.items || []).filter((s) => s.role === 'manager'));
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);
  useEffect(() => {
    if (tab === 'analytics' && form) {
      axios.get(`${BASE}/${id}/analytics`).then(({ data }) => setAnalytics(data)).catch(() => {});
    }
  }, [tab, id, form]);

  const regMap = useMemo(() => Object.fromEntries(registry.map((r) => [r.key, r])), [registry]);
  const labelFor = (key) => (regMap[key]?.labels?.[form?.language] || regMap[key]?.labels?.en || key);

  const setField = (path, value) => {
    setForm((s) => {
      const next = { ...s };
      const parts = path.split('.');
      let cur = next;
      for (let i = 0; i < parts.length - 1; i++) { cur[parts[i]] = { ...(cur[parts[i]] || {}) }; cur = cur[parts[i]]; }
      cur[parts[parts.length - 1]] = value;
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        name: form.name, internal_name: form.internal_name, language: form.language, slug: form.slug,
        content: form.content, fields: form.fields, attribution: form.attribution,
        routing: form.routing, sla: form.sla, duplicate_policy: form.duplicate_policy,
        thankyou: form.thankyou, tracking: form.tracking, settings: form.settings,
      };
      const { data } = await axios.put(`${BASE}/${id}`, payload);
      setForm(data.form);
      toast.success(t('lf_saved'));
    } catch (e) {
      const d = e?.response?.data?.detail;
      const msg = (d && typeof d === 'object' && d.message) ? d.message : (typeof d === 'string' ? d : t('lf_pub_error'));
      toast.error(msg);
    } finally { setSaving(false); }
  };

  const publish = async (status) => {
    try {
      await axios.post(`${BASE}/${id}/publish`, { status });
      setForm((s) => ({ ...s, status }));
      toast.success(status === 'published' ? t('lf_published') : t('lf_draft'));
    } catch (e) { toast.error(t('lf_pub_error')); }
  };

  // ---- Fields tab helpers ----
  const selectedKeys = useMemo(() => new Set((form?.fields || []).map((f) => f.key)), [form]);
  const addField = (key) => setForm((s) => ({ ...s, fields: [...s.fields, { key, required: false, custom: false, order: s.fields.length }] }));
  const addCustom = () => setForm((s) => {
    const key = `custom_${Date.now().toString(36)}`;
    return { ...s, fields: [...s.fields, { key, type: 'text', label: 'Custom field', required: false, custom: true, options: [], order: s.fields.length }] };
  });
  const removeField = (i) => setForm((s) => ({ ...s, fields: s.fields.filter((_, idx) => idx !== i) }));
  const moveField = (i, dir) => setForm((s) => {
    const arr = [...s.fields]; const j = i + dir;
    if (j < 0 || j >= arr.length) return s;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    return { ...s, fields: arr.map((f, idx) => ({ ...f, order: idx })) };
  });
  const patchField = (i, patch) => setForm((s) => ({ ...s, fields: s.fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)) }));

  const origin = window.location.origin;
  // Short public URL: bibicars.bg/{slug} (no /f/ prefix). The /f/{slug} route
  // remains available as a fallback for legacy links.
  const publicUrl = form ? `${origin}/${form.slug}` : '';
  const shortDisplayUrl = form ? `${origin.replace(/^https?:\/\//, '')}/${form.slug}` : '';
  // Preview URL always works for staff (draft or published) via ?preview=1.
  const previewUrl = form ? `${publicUrl}?preview=1` : '';
  const embedCode = form ? `<iframe src="${publicUrl}" style="width:100%;max-width:480px;height:640px;border:0;" loading="lazy" title="${form.name}"></iframe>` : '';
  const webhookUrl = form ? `${API_URL}/api/public/forms/${form.slug}/submit` : '';
  const copy = (text, key) => { navigator.clipboard.writeText(text); setCopied(key); toast.success(t('lf_copied')); setTimeout(() => setCopied(''), 1500); };

  // Local editable slug state — validated inline; committed to `form.slug` on
  // blur or explicit save. Keeps the input responsive without spamming errors.
  const [slugDraft, setSlugDraft] = useState(form?.slug || '');
  const [slugErr, setSlugErr] = useState('');
  useEffect(() => { if (form?.slug) setSlugDraft(form.slug); }, [form?.slug]);
  const cleanSlug = (raw) => String(raw || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  const commitSlug = () => {
    const cleaned = cleanSlug(slugDraft);
    if (!cleaned || cleaned.length < 2) { setSlugErr(t('lf_slug_invalid') || 'Slug must be at least 2 characters (letters, numbers, dashes).'); return; }
    setSlugErr('');
    setSlugDraft(cleaned);
    if (cleaned !== form.slug) setField('slug', cleaned);
  };

  if (!form) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-2 border-[#FEAE00] border-t-transparent rounded-full" /></div>;
  }

  const tabLabels = {
    setup: t('lf_tab_setup'), content: t('lf_tab_content'), design: t('lf_tab_design'), fields: t('lf_tab_fields'),
    routing: t('lf_tab_routing'), tracking: t('lf_tab_tracking'), publish: t('lf_tab_publish'), analytics: t('lf_tab_analytics'),
  };

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/admin/lead-forms')} className="p-2 rounded-lg hover:bg-[#F4F4F5] text-[#52525B]"><ArrowLeft size={18} /></button>
          <div>
            <h1 className="text-lg font-semibold text-[#18181B]">{form.name}</h1>
            <div className="text-[11px] font-mono text-[#A1A1AA]">/{form.slug}</div>
          </div>
          <span className={`ml-2 inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${form.status === 'published' ? 'bg-[#DCFCE7] text-[#166534]' : 'bg-[#F4F4F5] text-[#52525B]'}`}>{t('lf_' + form.status)}</span>
        </div>
        <div className="flex items-center gap-2">
          {form.status === 'published'
            ? <button onClick={() => publish('draft')} className="px-3 h-9 rounded-lg border border-[#E4E4E7] text-sm text-[#52525B] hover:bg-[#FAFAFA]">{t('lf_unpublish')}</button>
            : <button onClick={() => publish('published')} data-testid="lf-publish-btn" className="px-3 h-9 rounded-lg bg-[#166534] text-white text-sm hover:brightness-110">{t('lf_publish')}</button>}
          <button onClick={save} disabled={saving} data-testid="lf-save-btn" className="inline-flex items-center gap-1.5 px-4 h-9 rounded-lg bg-[#18181B] text-white text-sm font-medium hover:bg-[#27272A] disabled:opacity-60">
            <FloppyDisk size={16} /> {t('lf_save')}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-5 flex flex-wrap gap-1 border-b border-[#E4E4E7]">
        {TABS.map((tk) => (
          <button key={tk} onClick={() => { setTab(tk); setSp(tk === 'setup' ? {} : { tab: tk }); }}
            data-testid={`lf-tab-${tk}`}
            className={`px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${tab === tk ? 'border-[#FEAE00] text-[#18181B]' : 'border-transparent text-[#A1A1AA] hover:text-[#52525B]'}`}>
            {tabLabels[tk]}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-[#E4E4E7] p-5 sm:p-6 max-w-4xl">
        {/* SETUP */}
        {tab === 'setup' && (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t('lf_name')}><input className={inputCls} value={form.name || ''} onChange={(e) => setField('name', e.target.value)} data-testid="lf-name" /></Field>
            <Field label={t('lf_internal_name')}><input className={inputCls} value={form.internal_name || ''} onChange={(e) => setField('internal_name', e.target.value)} /></Field>
            <Field label={t('lf_language')}>
              <WhiteSelect value={form.language} onChange={(e) => setField('language', e.target.value)} data-testid="lf-language">
                {LANGS.map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
              </WhiteSelect>
            </Field>
            <Field label={t('lf_template')}><input className={inputCls + ' bg-[#FAFAFA]'} value={form.template} readOnly /></Field>

            {/* Slug editor + live shareable link — spans full width for clarity */}
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-[13px] font-medium text-[#3a3a38]">
                {t('lf_slug') || 'Public URL slug'}
              </label>
              <div className="flex flex-wrap items-stretch gap-2">
                <div className="flex flex-1 min-w-[260px] items-center overflow-hidden rounded-lg border border-[#E4E4E7] bg-white focus-within:border-[#FEAE00] focus-within:ring-2 focus-within:ring-[#FEAE00]/20"
                  style={{ borderColor: slugErr ? '#DC2626' : undefined }}>
                  <span className="select-none whitespace-nowrap bg-[#FAFAFA] px-3 py-2 font-mono text-[13px] text-[#71717A] border-r border-[#E4E4E7]">
                    {origin.replace(/^https?:\/\//, '')}/
                  </span>
                  <input
                    className="flex-1 px-3 py-2 font-mono text-[13px] text-[#18181B] outline-none min-w-0"
                    value={slugDraft}
                    onChange={(e) => { setSlugDraft(e.target.value); if (slugErr) setSlugErr(''); }}
                    onBlur={commitSlug}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitSlug(); e.currentTarget.blur(); } }}
                    placeholder="promo"
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                    data-testid="lf-slug-input"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => copy(publicUrl, 'setup-link')}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-[#E4E4E7] px-3 py-2 text-sm text-[#52525B] hover:bg-[#FAFAFA]"
                  title={t('lf_copied') || 'Copy link'}
                  data-testid="lf-slug-copy"
                >
                  {copied === 'setup-link' ? <CheckCircle size={16} className="text-[#166534]" /> : <Copy size={16} />}
                  <span className="hidden sm:inline">{copied === 'setup-link' ? (t('lf_copied') || 'Copied') : (t('lf_copy_link') || 'Copy')}</span>
                </button>
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-[#E4E4E7] px-3 py-2 text-sm text-[#52525B] hover:bg-[#FAFAFA]"
                  title={t('lf_preview') || 'Preview'}
                >
                  <ArrowSquareOut size={16} />
                </a>
              </div>
              {slugErr ? (
                <p className="mt-1.5 text-[12px] text-[#DC2626]">{slugErr}</p>
              ) : (
                <p className="mt-1.5 text-[11px] text-[#A1A1AA]">
                  {t('lf_slug_hint') || 'Lowercase letters, numbers and dashes. Example: promo, spring-sale, black-friday.'}
                </p>
              )}
              <p className="mt-1 text-[11px] text-[#A1A1AA] font-mono">
                <span className="text-[#71717A]">{t('lf_shareable') || 'Shareable link:'}</span>{' '}
                <span className="text-[#18181B]">{shortDisplayUrl}</span>
              </p>
            </div>
          </div>
        )}

        {/* CONTENT */}
        {tab === 'content' && (
          <div className="grid gap-5">
            <Field label={t('lf_c_title')}><input className={inputCls} value={form.content?.title || ''} onChange={(e) => setField('content.title', e.target.value)} data-testid="lf-c-title" /></Field>
            <Field label={t('lf_c_subtitle')}><input className={inputCls} value={form.content?.subtitle || ''} onChange={(e) => setField('content.subtitle', e.target.value)} /></Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label={t('lf_c_cta')}><input className={inputCls} value={form.content?.cta || ''} onChange={(e) => setField('content.cta', e.target.value)} /></Field>
              <Field label={t('lf_c_success')}><input className={inputCls} value={form.content?.success || ''} onChange={(e) => setField('content.success', e.target.value)} /></Field>
            </div>
          </div>
        )}

        {/* DESIGN */}
        {tab === 'design' && (
          <div className="grid gap-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label={t('lf_layout')}>
                <WhiteSelect value={form.settings?.layout || 'wizard'} onChange={(e) => setField('settings.layout', e.target.value)} data-testid="lf-layout">
                  <option value="wizard">{t('lf_wizard')}</option>
                  <option value="single">{t('lf_single')}</option>
                </WhiteSelect>
              </Field>
              <Field label={t('lf_accent')}>
                <div className="flex items-center gap-2">
                  <input type="color" value={form.settings?.accent_color || '#FEAE00'} onChange={(e) => setField('settings.accent_color', e.target.value)}
                    className="h-10 w-14 cursor-pointer rounded-lg border border-[#E4E4E7]" data-testid="lf-accent" />
                  <input className={inputCls} value={form.settings?.accent_color || '#FEAE00'} onChange={(e) => setField('settings.accent_color', e.target.value)} />
                </div>
              </Field>
            </div>
            <Field label={t('lf_hero')}><input className={inputCls} value={form.settings?.hero_headline || ''} onChange={(e) => setField('settings.hero_headline', e.target.value)} /></Field>
            <Field label={t('lf_trust')}><input className={inputCls} value={form.settings?.trust_badge || ''} onChange={(e) => setField('settings.trust_badge', e.target.value)} /></Field>
            <Field label={t('lf_benefits')}>
              <textarea className={inputCls} rows={4} value={(form.settings?.benefits || []).join('\n')}
                onChange={(e) => setField('settings.benefits', e.target.value.split('\n').map((x) => x.trim()).filter(Boolean))} data-testid="lf-benefits" />
            </Field>
            <div className="flex flex-wrap gap-5">
              <label className="flex items-center gap-2 text-sm text-[#52525B]">
                <input type="checkbox" className="accent-[#FEAE00]" checked={form.settings?.show_benefits !== false} onChange={(e) => setField('settings.show_benefits', e.target.checked)} />
                {t('lf_show_benefits')}
              </label>
              <label className="flex items-center gap-2 text-sm text-[#52525B]">
                <input type="checkbox" className="accent-[#FEAE00]" checked={form.settings?.show_progress !== false} onChange={(e) => setField('settings.show_progress', e.target.checked)} />
                {t('lf_show_progress')}
              </label>
            </div>
            <a href={previewUrl} target="_blank" rel="noreferrer"
              className="inline-flex w-max items-center gap-1.5 rounded-lg border border-[#E4E4E7] px-3 py-2 text-sm text-[#52525B] hover:bg-[#FAFAFA]">
              <ArrowSquareOut size={16} /> {t('lf_preview')}
            </a>

            {/* Live Preview — inline iframe of the real public/preview form. */}
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-[#18181B]">{t('lf_live_preview') || 'Live Preview'}</h4>
                <span className="text-[11px] text-[#A1A1AA]">
                  {t('lf_live_preview_hint') || 'Save first to see latest changes'}
                </span>
              </div>
              <div className="rounded-xl border border-[#E4E4E7] bg-[#FAFAFA] p-3">
                <div className="mx-auto max-w-[420px] overflow-hidden rounded-2xl border border-[#E4E4E7] bg-white shadow-sm">
                  <iframe
                    key={form.updated_at || form.id}
                    title="live-preview"
                    src={previewUrl}
                    className="block h-[720px] w-full"
                    loading="lazy"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* FIELDS */}
        {tab === 'fields' && (
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h4 className="mb-3 text-sm font-semibold text-[#18181B]">{t('lf_available_fields')}</h4>
              <div className="flex flex-wrap gap-2">
                {registry.filter((r) => !selectedKeys.has(r.key)).map((r) => (
                  <button key={r.key} onClick={() => addField(r.key)}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#E4E4E7] px-2.5 py-1.5 text-xs text-[#52525B] hover:border-[#FEAE00] hover:text-[#18181B]">
                    <Plus size={12} /> {r.labels?.[form.language] || r.labels?.en}
                  </button>
                ))}
              </div>
              <button onClick={addCustom} className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#F4F4F5] px-3 py-2 text-xs font-medium text-[#18181B] hover:bg-[#E4E4E7]">
                <Plus size={14} /> {t('lf_add_custom')}
              </button>
            </div>
            <div>
              <h4 className="mb-3 text-sm font-semibold text-[#18181B]">{t('lf_selected_fields')}</h4>
              <div className="space-y-2">
                {(form.fields || []).map((f, i) => (
                  <div key={f.key} className="rounded-lg border border-[#E4E4E7] p-3" data-testid={`lf-selfield-${f.key}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        {f.custom ? (
                          <input className="w-full rounded border border-[#E4E4E7] px-2 py-1 text-sm" value={f.label || ''} onChange={(e) => patchField(i, { label: e.target.value })} />
                        ) : (
                          <span className="text-sm font-medium text-[#18181B]">{labelFor(f.key)}</span>
                        )}
                        <div className="text-[11px] text-[#A1A1AA]">{f.custom ? f.type : (regMap[f.key]?.type || 'text')}{f.custom ? ' · custom' : ''}</div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => moveField(i, -1)} className="p-1 text-[#A1A1AA] hover:text-[#18181B]"><ArrowUp size={14} /></button>
                        <button onClick={() => moveField(i, 1)} className="p-1 text-[#A1A1AA] hover:text-[#18181B]"><ArrowDown size={14} /></button>
                        <button onClick={() => removeField(i)} className="p-1 text-[#DC2626] hover:bg-[#FEE2E2] rounded"><Trash size={14} /></button>
                      </div>
                    </div>
                    {f.custom && ['select', 'radio'].includes(f.type) && (
                      <input className="mt-2 w-full rounded border border-[#E4E4E7] px-2 py-1 text-xs" placeholder={t('lf_options')}
                        value={(f.options || []).join(', ')} onChange={(e) => patchField(i, { options: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} />
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      {f.custom && (
                        <div className="w-32">
                          <WhiteSelect value={f.type} onChange={(e) => patchField(i, { type: e.target.value })}>
                            {customTypes.map((ct) => <option key={ct} value={ct}>{ct}</option>)}
                          </WhiteSelect>
                        </div>
                      )}
                      <label className="flex items-center gap-1.5 text-xs text-[#52525B]">
                        <span className="text-[#A1A1AA]">{t('lf_widget')}:</span>
                        <div className="w-36">
                          <WhiteSelect value={f.widget || 'auto'}
                            onChange={(e) => patchField(i, { widget: e.target.value === 'auto' ? undefined : e.target.value })}
                            data-testid={`lf-widget-${f.key}`}>
                            {WIDGET_OPTIONS.map((w) => <option key={w} value={w}>{t('lf_widget_' + w)}</option>)}
                          </WhiteSelect>
                        </div>
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-[#52525B]">
                        <input type="checkbox" className="accent-[#FEAE00]" checked={!!f.required} onChange={(e) => patchField(i, { required: e.target.checked })} data-testid={`lf-req-${f.key}`} />
                        {t('lf_required')}
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ROUTING & ATTRIBUTION */}
        {tab === 'routing' && (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t('lf_lead_source')}><input className={inputCls} value={form.attribution?.lead_source || ''} onChange={(e) => setField('attribution.lead_source', e.target.value)} /></Field>
            <Field label={t('lf_campaign')}><input className={inputCls} value={form.attribution?.campaign || ''} onChange={(e) => setField('attribution.campaign', e.target.value)} /></Field>
            <Field label={t('lf_tags')}><input className={inputCls} value={(form.attribution?.tags || []).join(', ')} onChange={(e) => setField('attribution.tags', e.target.value.split(',').map((x) => x.trim()).filter(Boolean))} /></Field>
            <Field label={t('lf_lead_status')}>
              <WhiteSelect value={form.attribution?.lead_status || 'new'} onChange={(e) => setField('attribution.lead_status', e.target.value)}>
                {['new', 'contacted', 'qualification', 'negotiation'].map((s) => <option key={s} value={s}>{s}</option>)}
              </WhiteSelect>
            </Field>
            <Field label={t('lf_priority')}>
              <WhiteSelect value={form.attribution?.priority || 'normal'} onChange={(e) => setField('attribution.priority', e.target.value)}>
                {['low', 'normal', 'high', 'urgent'].map((s) => <option key={s} value={s}>{s}</option>)}
              </WhiteSelect>
            </Field>
            <Field label={t('lf_routing_mode')}>
              <WhiteSelect value={form.routing?.mode || 'round_robin'} onChange={(e) => setField('routing.mode', e.target.value)} data-testid="lf-routing-mode">
                <option value="round_robin">{t('lf_rr')}</option>
                <option value="manual">{t('lf_manual')}</option>
              </WhiteSelect>
            </Field>
            {form.routing?.mode === 'manual' && (
              <Field label={t('lf_default_manager')}>
                <WhiteSelect value={form.routing?.default_manager_id || ''} onChange={(e) => setField('routing.default_manager_id', e.target.value)}>
                  <option value="">—</option>
                  {managers.map((m) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
                </WhiteSelect>
              </Field>
            )}
            <Field label={t('lf_sla_minutes')}><input type="number" className={inputCls} value={form.sla?.first_response_minutes || 15} onChange={(e) => setField('sla.first_response_minutes', parseInt(e.target.value || '15', 10))} /></Field>
            <Field label={t('lf_dup_policy')}>
              <WhiteSelect value={form.duplicate_policy || 'update'} onChange={(e) => setField('duplicate_policy', e.target.value)} data-testid="lf-dup-policy">
                <option value="update">{t('lf_dup_update')}</option>
                <option value="reactivate">{t('lf_dup_reactivate')}</option>
                <option value="always_new">{t('lf_dup_new')}</option>
              </WhiteSelect>
            </Field>
            <Field label={t('lf_thankyou')}>
              <WhiteSelect value={form.thankyou?.behaviour || 'message'} onChange={(e) => setField('thankyou.behaviour', e.target.value)}>
                <option value="message">{t('lf_ty_message')}</option>
                <option value="redirect">{t('lf_ty_redirect')}</option>
              </WhiteSelect>
            </Field>
            {form.thankyou?.behaviour === 'redirect' && (
              <Field label={t('lf_redirect_url')}><input className={inputCls} value={form.thankyou?.redirect_url || ''} onChange={(e) => setField('thankyou.redirect_url', e.target.value)} placeholder="https://..." /></Field>
            )}
          </div>
        )}

        {/* TRACKING */}
        {tab === 'tracking' && (
          <div className="grid gap-5">
            <p className="text-xs text-[#A1A1AA]">{t('lf_tracking_hint')}</p>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label={t('lf_meta_pixel')}><input className={inputCls} value={form.tracking?.meta_pixel_id || ''} onChange={(e) => setField('tracking.meta_pixel_id', e.target.value)} placeholder="e.g. 123456789012345" /></Field>
              <Field label={t('lf_ga4')}><input className={inputCls} value={form.tracking?.ga4_measurement_id || ''} onChange={(e) => setField('tracking.ga4_measurement_id', e.target.value)} placeholder="G-XXXXXXX" /></Field>
              <Field label={t('lf_gads_id')}><input className={inputCls} value={form.tracking?.google_ads_conversion_id || ''} onChange={(e) => setField('tracking.google_ads_conversion_id', e.target.value)} placeholder="AW-XXXXXXXXX" /></Field>
              <Field label={t('lf_gads_label')}><input className={inputCls} value={form.tracking?.google_ads_conversion_label || ''} onChange={(e) => setField('tracking.google_ads_conversion_label', e.target.value)} /></Field>
            </div>
          </div>
        )}

        {/* PUBLISH & SHARE */}
        {tab === 'publish' && (
          <div className="grid gap-5">
            {form.status !== 'published' && (
              <div className="rounded-lg bg-[#FEF9C3] px-4 py-3 text-sm text-[#854D0E]">{t('lf_publish_first')}</div>
            )}
            {[['lf_public_link', publicUrl, 'link', true], ['lf_embed_code', embedCode, 'embed', false], ['lf_webhook_url', webhookUrl, 'hook', false]].map(([lk, val, key, openable]) => (
              <Field key={key} label={t(lk)}>
                <div className="flex gap-2">
                  <input className={inputCls + ' font-mono text-xs'} value={val} readOnly onFocus={(e) => e.target.select()} data-testid={`lf-${key}`} />
                  <button onClick={() => copy(val, key)} className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-[#E4E4E7] px-3 text-sm text-[#52525B] hover:bg-[#FAFAFA]">
                    {copied === key ? <CheckCircle size={16} className="text-[#166534]" /> : <Copy size={16} />}
                  </button>
                  {openable && <a href={form.status === 'published' ? val : previewUrl} target="_blank" rel="noreferrer" className="shrink-0 inline-flex items-center rounded-lg border border-[#E4E4E7] px-3 text-[#52525B] hover:bg-[#FAFAFA]"><ArrowSquareOut size={16} /></a>}
                </div>
              </Field>
            ))}
          </div>
        )}

        {/* ANALYTICS */}
        {tab === 'analytics' && (
          <div className="grid gap-6">
            {!analytics ? <div className="text-sm text-[#A1A1AA]">…</div> : (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                  {[['lf_views', 'views'], ['lf_starts', 'starts'], ['lf_submissions', 'submissions'], ['lf_valid_leads', 'valid_leads'], ['lf_duplicates', 'duplicates'], ['lf_deals', 'deals'], ['lf_won', 'won']].map(([lk, k]) => (
                    <div key={k} className="rounded-xl border border-[#E4E4E7] p-3">
                      <div className="text-[11px] text-[#A1A1AA]">{t(lk)}</div>
                      <div className="text-2xl font-bold text-[#18181B]">{analytics.analytics.funnel[k]}</div>
                    </div>
                  ))}
                </div>
                <div>
                  <h4 className="mb-2 text-sm font-semibold text-[#18181B]">{t('lf_conv_rates')}</h4>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[['View→Submit', 'view_to_submit'], ['Submit→Lead', 'submit_to_lead'], ['Lead→Deal', 'lead_to_deal'], ['Deal→Won', 'deal_to_won']].map(([lbl, k]) => (
                      <div key={k} className="rounded-xl bg-[#FAFAFA] p-3">
                        <div className="text-[11px] text-[#A1A1AA]">{lbl}</div>
                        <div className="text-lg font-bold text-[#18181B]">{analytics.analytics.rates[k]}%</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  {[['lf_by_channel', 'channel'], ['lf_by_campaign', 'campaign'], ['lf_by_language', 'language']].map(([lk, dim]) => (
                    <div key={dim} className="rounded-xl border border-[#E4E4E7] p-3">
                      <div className="mb-2 text-xs font-semibold text-[#18181B]">{t(lk)}</div>
                      {Object.entries(analytics.analytics.breakdown[dim] || {}).length === 0 ? <div className="text-[11px] text-[#A1A1AA]">—</div> :
                        Object.entries(analytics.analytics.breakdown[dim]).map(([k, v]) => (
                          <div key={k} className="flex justify-between text-xs py-0.5"><span className="text-[#52525B]">{k}</span><span className="font-medium text-[#18181B]">{v}</span></div>
                        ))}
                    </div>
                  ))}
                </div>
                <div>
                  <h4 className="mb-2 text-sm font-semibold text-[#18181B]">{t('lf_recent_leads')}</h4>
                  <div className="rounded-xl border border-[#E4E4E7] divide-y divide-[#F4F4F5]">
                    {(analytics.recent_leads || []).length === 0 ? <div className="p-4 text-xs text-[#A1A1AA]">—</div> :
                      analytics.recent_leads.map((l) => (
                        <button key={l.id} onClick={() => navigate(`/admin/leads/${l.id}`)} className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-[#FAFAFA]">
                          <div><div className="text-sm font-medium text-[#18181B]">{l.name}</div><div className="text-[11px] text-[#A1A1AA]">{l.phone} · {l.source} · {l.campaign || '—'}</div></div>
                          <span className="text-[11px] rounded-full bg-[#F4F4F5] px-2 py-0.5 text-[#52525B]">{l.status}</span>
                        </button>
                      ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
