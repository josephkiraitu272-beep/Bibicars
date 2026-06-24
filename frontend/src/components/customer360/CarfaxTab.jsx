/**
 * Customer 360 — CarFax Tab
 * -------------------------------------------------------------------------
 * Manager-facing workflow (matches the documented BIBI flow):
 *   1. The manager obtains a CarFax report externally (B2B / on their side).
 *   2. Here, inside the customer card, they attach that PDF (file upload OR a
 *      hosted URL) together with the VIN.
 *   3. Backend stores it (status = "uploaded", source = "manager") and it
 *      becomes immediately downloadable in the customer's personal cabinet.
 *
 * Endpoints used (all already exist server-side):
 *   GET    /api/admin/customers/{id}/carfax     — list this customer's reports
 *   POST   /api/admin/customers/{id}/carfax     — attach (multipart: vin, file|pdfUrl, actualCost)
 *   DELETE /api/carfax/{requestId}              — remove a report
 */
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API_URL } from '../../App';
import { useLang } from '../../i18n';
import { toast } from 'sonner';
import {
  FilePdf,
  UploadSimple,
  Trash,
  Link as LinkIcon,
  DownloadSimple,
  Plus,
  CheckCircle,
  Clock,
  XCircle,
} from '@phosphor-icons/react';

const fileHref = (url) => {
  if (!url) return null;
  return url.startsWith('http') ? url : `${API_URL}${url}`;
};

const StatusBadge = ({ status }) => {
  const map = {
    uploaded: { cls: 'bg-emerald-100 text-emerald-700', Icon: CheckCircle },
    completed: { cls: 'bg-emerald-100 text-emerald-700', Icon: CheckCircle },
    pending: { cls: 'bg-amber-100 text-amber-700', Icon: Clock },
    processing: { cls: 'bg-blue-100 text-blue-700', Icon: Clock },
    rejected: { cls: 'bg-red-100 text-red-700', Icon: XCircle },
  };
  const { cls, Icon } = map[status] || { cls: 'bg-[#F4F4F5] text-[#71717A]', Icon: Clock };
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full ${cls}`}>
      <Icon size={13} weight="bold" />
      {status || '—'}
    </span>
  );
};

const CarfaxTab = ({ customerId, defaultVin = '' }) => {
  const { t } = useLang();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // form state
  const [mode, setMode] = useState('file'); // 'file' | 'url'
  const [vin, setVin] = useState(defaultVin || '');
  const [file, setFile] = useState(null);
  const [pdfUrl, setPdfUrl] = useState('');
  const [actualCost, setActualCost] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/api/admin/customers/${customerId}/carfax`);
      setReports(res.data?.data || []);
    } catch (err) {
      console.error('Failed to load CarFax reports', err);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    load();
  }, [load]);

  const resetForm = () => {
    setMode('file');
    setVin(defaultVin || '');
    setFile(null);
    setPdfUrl('');
    setActualCost('');
    setShowForm(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanVin = (vin || '').trim().toUpperCase();
    if (!cleanVin) {
      toast.error(t('adm_carfax_vin_required') || 'VIN is required');
      return;
    }
    if (mode === 'file' && !file) {
      toast.error(t('adm_carfax_file_required') || 'Please choose a PDF file');
      return;
    }
    if (mode === 'url' && !pdfUrl.trim()) {
      toast.error(t('adm_carfax_url_required') || 'Please provide a PDF URL');
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('vin', cleanVin);
      if (mode === 'file') {
        fd.append('file', file);
      } else {
        fd.append('pdfUrl', pdfUrl.trim());
      }
      if (actualCost !== '') fd.append('actualCost', String(actualCost));
      await axios.post(`${API_URL}/api/admin/customers/${customerId}/carfax`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success(t('adm_carfax_attached') || 'CarFax report attached — now visible in the customer cabinet');
      resetForm();
      setLoading(true);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || t('errorGeneric') || 'Failed to attach CarFax');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t('adm_carfax_delete_confirm') || 'Delete this CarFax report?')) return;
    try {
      await axios.delete(`${API_URL}/api/carfax/${id}`);
      toast.success(t('adm_carfax_deleted') || 'CarFax report deleted');
      setReports((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      toast.error(err.response?.data?.detail || t('errorGeneric') || 'Failed to delete');
    }
  };

  return (
    <div className="space-y-4" data-testid="customer360-carfax-tab">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 bg-white border border-[#E4E4E7] rounded-2xl p-5">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[#FEF2F2] flex items-center justify-center shrink-0">
            <FilePdf size={20} className="text-[#DC2626]" weight="fill" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-[#18181B]">{t('adm_carfax_reports') || 'CarFax Reports'}</h2>
            <p className="text-xs text-[#71717A]">
              {t('adm_carfax_tab_hint') || 'Attach a CarFax PDF you obtained externally — it becomes downloadable in the client cabinet.'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((s) => !s)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium bg-[#18181B] text-white rounded-xl hover:bg-[#27272A] shrink-0"
          data-testid="carfax-attach-toggle"
        >
          <Plus size={16} weight="bold" />
          {t('adm_carfax_attach_btn') || 'Attach report'}
        </button>
      </div>

      {/* Attach form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-white border border-[#E4E4E7] rounded-2xl p-5 space-y-4"
          data-testid="carfax-attach-form"
        >
          <div>
            <label className="block text-xs font-medium text-[#71717A] mb-1">VIN *</label>
            <input
              type="text"
              value={vin}
              onChange={(e) => setVin(e.target.value.toUpperCase())}
              placeholder="1HGCM82633A123456"
              className="w-full px-3 py-2 text-sm border border-[#E4E4E7] rounded-xl focus:outline-none focus:border-[#18181B] uppercase"
              data-testid="carfax-vin-input"
            />
          </div>

          {/* Mode switch */}
          <div className="inline-flex bg-[#F4F4F5] rounded-xl p-1">
            <button
              type="button"
              onClick={() => setMode('file')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg ${mode === 'file' ? 'bg-white shadow-sm text-[#18181B] font-medium' : 'text-[#71717A]'}`}
              data-testid="carfax-mode-file"
            >
              <UploadSimple size={15} /> {t('adm_carfax_mode_file') || 'Upload PDF'}
            </button>
            <button
              type="button"
              onClick={() => setMode('url')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg ${mode === 'url' ? 'bg-white shadow-sm text-[#18181B] font-medium' : 'text-[#71717A]'}`}
              data-testid="carfax-mode-url"
            >
              <LinkIcon size={15} /> {t('adm_carfax_mode_url') || 'By URL'}
            </button>
          </div>

          {mode === 'file' ? (
            <div>
              <label className="block text-xs font-medium text-[#71717A] mb-1">{t('adm_carfax_pdf_file') || 'PDF file'} *</label>
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="block w-full text-sm text-[#3F3F46] file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-sm file:font-medium file:bg-[#EEF2FF] file:text-[#4F46E5] hover:file:bg-[#E0E7FF]"
                data-testid="carfax-file-input"
              />
              {file && <p className="text-xs text-[#71717A] mt-1">{file.name}</p>}
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-[#71717A] mb-1">{t('adm_carfax_pdf_url') || 'PDF URL'} *</label>
              <input
                type="url"
                value={pdfUrl}
                onChange={(e) => setPdfUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 text-sm border border-[#E4E4E7] rounded-xl focus:outline-none focus:border-[#18181B]"
                data-testid="carfax-url-input"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[#71717A] mb-1">{t('adm_carfax_actual_cost') || 'Actual cost (EUR, optional)'}</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={actualCost}
              onChange={(e) => setActualCost(e.target.value)}
              placeholder="0.00"
              className="w-40 px-3 py-2 text-sm border border-[#E4E4E7] rounded-xl focus:outline-none focus:border-[#18181B]"
              data-testid="carfax-cost-input"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium bg-[#18181B] text-white rounded-xl disabled:opacity-50"
              data-testid="carfax-submit"
            >
              {submitting ? (t('adm3_034bf16d6c') || 'Saving...') : (t('adm_carfax_attach_btn') || 'Attach report')}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 text-sm font-medium bg-[#F4F4F5] text-[#3F3F46] rounded-xl"
              data-testid="carfax-cancel"
            >
              {t('cancel') || 'Cancel'}
            </button>
          </div>
        </form>
      )}

      {/* List */}
      {loading ? (
        <div className="bg-white border border-[#E4E4E7] rounded-2xl p-8 text-center text-sm text-[#71717A]">
          {t('loading') || 'Loading...'}
        </div>
      ) : reports.length === 0 ? (
        <div className="bg-white border border-[#E4E4E7] rounded-2xl p-8 text-center" data-testid="carfax-empty">
          <FilePdf size={32} className="text-[#D4D4D8] mx-auto mb-2" />
          <p className="text-sm text-[#71717A]">{t('adm3_1a811ebb86') || 'No CarFax reports'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => {
            const href = fileHref(r.pdfUrl);
            return (
              <div
                key={r.id}
                className="bg-white border border-[#E4E4E7] rounded-2xl p-4 flex items-center justify-between gap-3"
                data-testid={`carfax-row-${r.id}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-[#FEF2F2] flex items-center justify-center shrink-0">
                    <FilePdf size={18} className="text-[#DC2626]" weight="fill" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#18181B] truncate">VIN: {r.vin}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <StatusBadge status={r.status} />
                      <span className="text-xs text-[#71717A]">
                        {r.source === 'manager' ? (t('adm_carfax_src_manager') || 'attached by manager') : (t('adm_carfax_src_customer') || 'customer request')}
                      </span>
                      {(r.uploadedAt || r.createdAt) && (
                        <span className="text-xs text-[#A1A1AA]">
                          · {new Date(r.uploadedAt || r.createdAt).toLocaleDateString()}
                        </span>
                      )}
                      {r.actualCost != null && (
                        <span className="text-xs text-[#A1A1AA]">· €{r.actualCost}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {href && (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#EEF2FF] text-[#4F46E5] rounded-lg hover:bg-[#E0E7FF]"
                      data-testid={`carfax-download-${r.id}`}
                    >
                      <DownloadSimple size={14} weight="bold" />
                      {t('adm_download_pdf') || 'Download PDF'}
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(r.id)}
                    className="inline-flex items-center justify-center w-8 h-8 text-[#A1A1AA] hover:text-[#DC2626] hover:bg-[#FEF2F2] rounded-lg"
                    title={t('delete') || 'Delete'}
                    data-testid={`carfax-delete-${r.id}`}
                  >
                    <Trash size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CarfaxTab;
