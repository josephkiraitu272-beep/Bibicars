/**
 * BIBI Cars — Unified CRM (single ecosystem)
 * ------------------------------------------------------------------
 * A lead no longer has its own separate "lead card". Opening a lead
 * now opens the FULL client card (Customer 360) — the same rich,
 * cross-cutting card used everywhere (leads · customers · deals ·
 * orders all live in one ecosystem and link to each other).
 *
 * Lifecycle (best-CRM model):
 *   • On open we IDEMPOTENTLY ensure a customer record exists for this
 *     lead (lead → contact). We pass `keep_status: true` so the lead's
 *     pipeline status is NEVER silently changed just by viewing it —
 *     winning/converting stays an explicit quick action on the card.
 *   • Then we redirect to /admin/customers/{customerId}/360, carrying
 *     the originating lead id (?lead=) so the card can surface and act
 *     on that specific lead (status pipeline quick action).
 */

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { ArrowLeft } from '@phosphor-icons/react';

import { API_URL } from '../api-config';
import { useLang } from '../i18n';

const Lead360 = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useLang();
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const openAsCustomer = async () => {
      try {
        // 1) Fast path — if the lead already links a customer, reuse it.
        let cid = null;
        try {
          const r = await axios.get(`${API_URL}/api/leads/${id}/360`);
          cid = r?.data?.lead?.customerId || null;
        } catch (e) {
          const code = e?.response?.status;
          if (code === 404) { toast.error(t('l360_leadNotFound') || 'Lead not found'); navigate('/admin/leads', { replace: true }); return; }
          if (code === 403) { toast.error(t('l360_cannotView') || 'You cannot view this lead'); navigate('/admin/leads', { replace: true }); return; }
          // other read errors → fall through to convert attempt
        }

        // 2) Otherwise ensure a customer exists (idempotent, keep_status).
        if (!cid) {
          const c = await axios.post(`${API_URL}/api/leads/${id}/convert`, { keep_status: true });
          cid = c?.data?.customer?.id || c?.data?.customerId || null;
        }

        if (!cid) throw new Error('no_customer');
        if (!cancelled) navigate(`/admin/customers/${cid}/360?lead=${id}`, { replace: true });
      } catch (e) {
        const code = e?.response?.status;
        if (cancelled) return;
        if (code === 404) { toast.error(t('l360_leadNotFound') || 'Lead not found'); navigate('/admin/leads', { replace: true }); }
        else if (code === 403) { toast.error(t('l360_cannotView') || 'You cannot view this lead'); navigate('/admin/leads', { replace: true }); }
        else setError(e?.response?.data?.detail || (t('l360_openFailed') || 'Failed to open lead'));
      }
    };

    openAsCustomer();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4" data-testid="lead360-redirect-error">
        <p className="text-sm text-[#71717A]">{error}</p>
        <Link to="/admin/leads" className="inline-flex items-center gap-2 text-sm font-medium text-[#4F46E5] hover:underline">
          <ArrowLeft size={16} /> {t('l360_backToLeads') || 'Back to leads'}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3" data-testid="lead360-redirecting">
      <div className="animate-spin w-8 h-8 border-2 border-[#4F46E5] border-t-transparent rounded-full" />
      <p className="text-sm text-[#71717A]">{t('l360_openingCard') || 'Opening client card…'}</p>
    </div>
  );
};

export default Lead360;
