/**
 * LeadFormsPage — admin list of Lead Forms + create-from-template.
 * Light admin theme (white cards, #18181B text, #FEAE00 brand accent).
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '../../api-config';
import { useLang } from '../../i18n';
import { toast } from 'sonner';
import {
  Plus, PencilSimple, Copy, Trash, Eye, Article, ChartLineUp, X,
} from '@phosphor-icons/react';
import ControlPageHeader from '../../components/admin/ControlPageHeader';
import WhiteSelect from '../../components/ui/WhiteSelect';

const STATUS_STYLES = {
  published: 'bg-[#DCFCE7] text-[#166534]',
  draft: 'bg-[#F4F4F5] text-[#52525B]',
  disabled: 'bg-[#FEE2E2] text-[#991B1B]',
};

export default function LeadFormsPage() {
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const BASE = `${API_URL}/api/admin/lead-forms`;
  const [items, setItems] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTpl, setNewTpl] = useState('general_lead');
  const [newName, setNewName] = useState('');
  const [newLang, setNewLang] = useState(lang === 'uk' || lang === 'bg' ? lang : 'bg');

  const load = async () => {
    try {
      const { data } = await axios.get(BASE);
      setItems(data.items || []);
    } catch (e) {
      toast.error('Failed to load forms');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    axios.get(`${BASE}/meta/templates`).then(({ data }) => setTemplates(data.templates || [])).catch(() => {});
  }, []);

  const tplLabel = (tpl) => (tpl.labels?.[lang] || tpl.labels?.en || tpl.key);

  // Compute steps preview for a template (mirrors LeadFormPublicPage grouping).
  // Backend groups fields into: intent · vehicle · budget · extra · contact.
  const GROUP_ORDER = ['intent', 'vehicle', 'budget', 'extra', 'contact'];
  const GROUP_LABEL = {
    en: { intent: 'Intent', vehicle: 'Vehicle', budget: 'Budget', extra: 'Extra', contact: 'Contact' },
    bg: { intent: 'Намерение', vehicle: 'Автомобил', budget: 'Бюджет', extra: 'Още', contact: 'Контакт' },
    uk: { intent: 'Намір', vehicle: 'Авто', budget: 'Бюджет', extra: 'Ще', contact: 'Контакт' },
  };
  const stepsFromFields = (fields) => {
    const groups = [];
    const bag = {};
    (fields || []).forEach((f) => {
      const g = f.group || 'extra';
      (bag[g] = bag[g] || []).push(f);
    });
    GROUP_ORDER.forEach((g) => { if (bag[g]?.length) groups.push({ group: g, fields: bag[g] }); });
    Object.keys(bag).forEach((g) => { if (!GROUP_ORDER.includes(g)) groups.push({ group: g, fields: bag[g] }); });
    return groups;
  };
  const gLbl = (g) => (GROUP_LABEL[lang]?.[g] || GROUP_LABEL.en[g] || g);
  const stepsWord = { en: 'steps', bg: 'стъпки', uk: 'кроки' }[lang] || 'steps';
  const fieldsWord = { en: 'fields', bg: 'полета', uk: 'поля' }[lang] || 'fields';

  const create = async () => {
    setCreating(true);
    try {
      const { data } = await axios.post(BASE, {
        template: newTpl,
        language: newLang,
        name: newName.trim() || undefined,
      });
      toast.success(t('lf_saved'));
      setShowCreate(false);
      setNewName('');
      navigate(`/admin/lead-forms/${data.form.id}`);
    } catch (e) {
      toast.error(t('lf_pub_error'));
    } finally {
      setCreating(false);
    }
  };

  const togglePublish = async (form) => {
    const next = form.status === 'published' ? 'draft' : 'published';
    try {
      await axios.post(`${BASE}/${form.id}/publish`, { status: next });
      setItems((s) => s.map((f) => (f.id === form.id ? { ...f, status: next } : f)));
      toast.success(next === 'published' ? t('lf_published') : t('lf_draft'));
    } catch (e) { toast.error(t('lf_pub_error')); }
  };

  const duplicate = async (form) => {
    try {
      const { data } = await axios.post(`${BASE}/${form.id}/duplicate`);
      setItems((s) => [data.form, ...s]);
      toast.success(t('lf_saved'));
    } catch (e) { toast.error(t('lf_pub_error')); }
  };

  const remove = async (form) => {
    if (!window.confirm(t('lf_confirm_delete'))) return;
    try {
      await axios.delete(`${BASE}/${form.id}`);
      setItems((s) => s.filter((f) => f.id !== form.id));
      toast.success(t('lf_saved'));
    } catch (e) { toast.error(t('lf_pub_error')); }
  };

  const conv = (c) => {
    const v = c?.views || 0; const s = c?.submissions || 0;
    return v ? `${Math.round((s / v) * 100)}%` : '—';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-[#FEAE00] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="space-y-5 sm:space-y-6">
        <ControlPageHeader
          icon={Article}
          iconColor="#FEAE00"
          title={t('lf_title')}
          subtitle={t('lf_subtitle')}
          action={(
            <button
              data-testid="lf-create-btn"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-1.5 px-3 sm:px-4 h-10 bg-[#18181B] text-white rounded-lg hover:bg-[#27272A] transition-colors text-xs sm:text-sm font-medium whitespace-nowrap shadow-sm"
            >
              <Plus size={16} weight="bold" />
              <span>{t('lf_new_form')}</span>
            </button>
          )}
        />

        {items.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#E4E4E7] p-10 text-center text-sm text-[#71717A]">
            {t('lf_empty')}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-[#E4E4E7] overflow-hidden">
            <table className="w-full text-sm table-auto">
              <thead>
                <tr className="bg-[#FAFAFA] text-left text-[11px] uppercase tracking-wide text-[#A1A1AA]">
                  <th className="px-3 sm:px-4 py-3 font-medium">{t('lf_name')}</th>
                  <th className="hidden md:table-cell px-3 sm:px-4 py-3 font-medium">{t('lf_template')}</th>
                  <th className="hidden sm:table-cell px-3 sm:px-4 py-3 font-medium">{t('lf_language')}</th>
                  <th className="px-3 sm:px-4 py-3 font-medium">{t('lf_status')}</th>
                  <th className="hidden lg:table-cell px-2 py-3 font-medium text-center">{t('lf_views')}</th>
                  <th className="hidden lg:table-cell px-2 py-3 font-medium text-center">{t('lf_submissions')}</th>
                  <th className="hidden xl:table-cell px-2 py-3 font-medium text-center">{t('lf_valid_leads')}</th>
                  <th className="hidden lg:table-cell px-2 py-3 font-medium text-center">Conv.</th>
                  <th className="px-3 sm:px-4 py-3 font-medium text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F4F4F5]">
                {items.map((f) => (
                  <tr key={f.id} className="hover:bg-[#FAFAFA]" data-testid={`lf-row-${f.id}`}>
                    <td className="px-3 sm:px-4 py-3 min-w-0">
                      <button onClick={() => navigate(`/admin/lead-forms/${f.id}`)}
                        className="font-medium text-[#18181B] hover:text-[#FEAE00] text-left break-words">
                        {f.name}
                      </button>
                      <div className="text-[11px] text-[#A1A1AA] font-mono truncate">/{f.slug}</div>
                    </td>
                    <td className="hidden md:table-cell px-3 sm:px-4 py-3 text-[#52525B]">{f.template}</td>
                    <td className="hidden sm:table-cell px-3 sm:px-4 py-3 uppercase text-[#52525B]">{f.language}</td>
                    <td className="px-3 sm:px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_STYLES[f.status] || STATUS_STYLES.draft}`}>
                        {t('lf_' + f.status)}
                      </span>
                    </td>
                    <td className="hidden lg:table-cell px-2 py-3 text-center text-[#52525B]">{f.counters?.views || 0}</td>
                    <td className="hidden lg:table-cell px-2 py-3 text-center text-[#52525B]">{f.counters?.submissions || 0}</td>
                    <td className="hidden xl:table-cell px-2 py-3 text-center text-[#52525B]">{f.counters?.valid_leads || 0}</td>
                    <td className="hidden lg:table-cell px-2 py-3 text-center font-semibold text-[#18181B]">{conv(f.counters)}</td>
                    <td className="px-3 sm:px-4 py-3">
                      <div className="flex items-center justify-end gap-0.5 sm:gap-1">
                        <button title={t('lf_publish')} onClick={() => togglePublish(f)}
                          data-testid={`lf-publish-${f.id}`}
                          className={`p-1.5 rounded-md hover:bg-[#F4F4F5] ${f.status === 'published' ? 'text-[#166534]' : 'text-[#A1A1AA]'}`}>
                          <Eye size={16} weight={f.status === 'published' ? 'fill' : 'regular'} />
                        </button>
                        <button title={t('lf_analytics')} onClick={() => navigate(`/admin/lead-forms/${f.id}?tab=analytics`)}
                          className="p-1.5 rounded-md hover:bg-[#F4F4F5] text-[#4F46E5]">
                          <ChartLineUp size={16} />
                        </button>
                        <button title={t('lf_edit')} onClick={() => navigate(`/admin/lead-forms/${f.id}`)}
                          className="p-1.5 rounded-md hover:bg-[#F4F4F5] text-[#52525B]">
                          <PencilSimple size={16} />
                        </button>
                        <button title={t('lf_duplicate')} onClick={() => duplicate(f)}
                          className="hidden sm:inline-flex p-1.5 rounded-md hover:bg-[#F4F4F5] text-[#52525B]">
                          <Copy size={16} />
                        </button>
                        <button title={t('lf_delete')} onClick={() => remove(f)}
                          className="p-1.5 rounded-md hover:bg-[#FEE2E2] text-[#DC2626]">
                          <Trash size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowCreate(false)}>
          <div className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[#18181B]">{t('lf_choose_template')}</h3>
              <button onClick={() => setShowCreate(false)} className="p-1 text-[#A1A1AA] hover:text-[#18181B]"><X size={20} /></button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 lg:grid-cols-2">
              {templates.map((tpl) => {
                const steps = stepsFromFields(tpl.fields);
                const active = newTpl === tpl.key;
                return (
                  <button key={tpl.key} onClick={() => setNewTpl(tpl.key)}
                    data-testid={`lf-tpl-${tpl.key}`}
                    className={`rounded-xl border p-4 text-left text-sm transition ${active ? 'border-[#FEAE00] bg-[#FEAE00]/10 ring-2 ring-[#FEAE00]/30' : 'border-[#E4E4E7] hover:border-[#D4D4D8]'}`}>
                    <div className="font-semibold text-[#18181B]">{tplLabel(tpl)}</div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-[#71717A]">
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#F4F4F5] px-2 py-0.5 font-medium text-[#18181B]">
                        {steps.length} {stepsWord}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#F4F4F5] px-2 py-0.5 font-medium text-[#18181B]">
                        {tpl.fields.length} {fieldsWord}
                      </span>
                    </div>
                    <ol className="mt-2 space-y-1">
                      {steps.map((s, i) => (
                        <li key={s.group} className="flex items-start gap-2 text-[11px] text-[#52525B]">
                          <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#FEAE00]/20 text-[9px] font-bold text-[#18181B]">{i + 1}</span>
                          <span className="truncate"><b className="text-[#18181B]">{gLbl(s.group)}</b> <span className="text-[#A1A1AA]">· {s.fields.length}</span></span>
                        </li>
                      ))}
                    </ol>
                  </button>
                );
              })}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#52525B]">{t('lf_name')}</label>
                <input value={newName} onChange={(e) => setNewName(e.target.value)}
                  data-testid="lf-new-name"
                  className="w-full rounded-lg border border-[#E4E4E7] px-3 py-2 text-sm outline-none focus:border-[#FEAE00]" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#52525B]">{t('lf_language')}</label>
                <WhiteSelect value={newLang} onChange={(e) => setNewLang(e.target.value)}>
                  <option value="bg">BG</option>
                  <option value="en">EN</option>
                  <option value="uk">UK</option>
                </WhiteSelect>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-[#52525B] hover:text-[#18181B]">{t('lf_cancel')}</button>
              <button onClick={create} disabled={creating}
                data-testid="lf-create-confirm"
                className="px-4 py-2 rounded-lg bg-[#FEAE00] text-sm font-medium text-[#18181B] hover:brightness-95 disabled:opacity-60">
                {t('lf_new_form')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
