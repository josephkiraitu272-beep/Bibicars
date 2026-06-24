/**
 * Ops Policy Settings (/admin/settings/ops-policy)
 *
 * Admin-editable model coefficients that drive the analytics engines:
 *   • Forecasting 360 — close-probability fallback, payment lag, capacity targets
 *   • Operations 360  — SLA time thresholds
 *   • Contract 360    — contract-health grace / expiry windows
 *
 * Backend: GET/PUT /api/admin/settings/ops-policy (read: staff, write: admin).
 * Changing a value updates every downstream calculation immediately.
 */
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API_URL } from '../../App';
import { toast } from 'sonner';
import { FloppyDisk, ArrowsClockwise, SlidersHorizontal, ChartLineUp, Timer, FileText } from '@phosphor-icons/react';

const DEFAULTS = {
  forecast: {
    default_unknown_probability: 0.30,
    default_payment_lag_days: 30,
    manager_target_open_deals: 8,
    carrier_target_open_loads: 12,
  },
  sla: {
    lead_response_minutes: 15,
    deal_stuck_days: 7,
    deposit_pending_days: 3,
    carrier_unassigned_days: 2,
    customs_days: 14,
  },
  contract: {
    unsigned_grace_days: 7,
    expiry_warn_days: 7,
  },
};

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <div className="text-sm font-semibold mb-1" style={{ color: '#0F172A' }}>{label}</div>
      {children}
      {hint && <div className="text-xs mt-1" style={{ color: '#9CA3AF' }}>{hint}</div>}
    </label>
  );
}

function NumberInput({ section, field, value, onChange, step = '1', min = '0', max, testid, disabled }) {
  return (
    <input
      type="number" step={step} min={min} max={max}
      value={value}
      onChange={(e) => onChange(section, field, e.target.value)}
      className="w-full border rounded-md px-3 py-2 text-sm"
      style={{ borderColor: '#D1D5DB' }}
      data-testid={testid}
      disabled={disabled}
    />
  );
}

function SectionCard({ icon: Icon, title, subtitle, children }) {
  return (
    <div className="rounded-xl border bg-white p-6 space-y-4" style={{ borderColor: '#E5E7EB' }}>
      <div className="flex items-center gap-2">
        <Icon size={18} weight="bold" style={{ color: '#FFA800' }} />
        <h2 className="text-lg font-bold" style={{ color: '#0F172A' }}>{title}</h2>
      </div>
      {subtitle && <p className="text-xs -mt-2" style={{ color: '#9CA3AF' }}>{subtitle}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
    </div>
  );
}

export default function OpsPolicySettingsPage() {
  const [value, setValue] = useState(DEFAULTS);
  const [meta, setMeta] = useState({ updated_at: null, updated_by: null });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const r = await axios.get(`${API_URL}/api/admin/settings/ops-policy`);
      const d = r.data.data || {};
      setValue({
        forecast: { ...DEFAULTS.forecast, ...(d.forecast || {}) },
        sla: { ...DEFAULTS.sla, ...(d.sla || {}) },
        contract: { ...DEFAULTS.contract, ...(d.contract || {}) },
      });
      setMeta({ updated_at: d.updated_at, updated_by: d.updated_by });
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load ops policy');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const setField = (section, field, v) =>
    setValue((prev) => ({ ...prev, [section]: { ...prev[section], [field]: v } }));

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        forecast: {
          default_unknown_probability: Number(value.forecast.default_unknown_probability),
          default_payment_lag_days: parseInt(value.forecast.default_payment_lag_days, 10),
          manager_target_open_deals: parseInt(value.forecast.manager_target_open_deals, 10),
          carrier_target_open_loads: parseInt(value.forecast.carrier_target_open_loads, 10),
        },
        sla: {
          lead_response_minutes: parseInt(value.sla.lead_response_minutes, 10),
          deal_stuck_days: parseInt(value.sla.deal_stuck_days, 10),
          deposit_pending_days: parseInt(value.sla.deposit_pending_days, 10),
          carrier_unassigned_days: parseInt(value.sla.carrier_unassigned_days, 10),
          customs_days: parseInt(value.sla.customs_days, 10),
        },
        contract: {
          unsigned_grace_days: parseInt(value.contract.unsigned_grace_days, 10),
          expiry_warn_days: parseInt(value.contract.expiry_warn_days, 10),
        },
      };
      const r = await axios.put(`${API_URL}/api/admin/settings/ops-policy`, payload);
      const d = r.data.data || {};
      setMeta({ updated_at: d.updated_at, updated_by: d.updated_by });
      toast.success('Operations policy saved');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const reset = () => setValue(DEFAULTS);

  return (
    <div className="p-6 max-w-4xl mx-auto" data-testid="ops-policy-page">
      <div className="flex items-center gap-2 mb-2">
        <SlidersHorizontal size={22} weight="bold" style={{ color: '#FFA800' }} />
        <h1 className="text-2xl font-bold" style={{ color: '#0F172A' }}>Operations Policy</h1>
      </div>
      <p className="text-sm mb-6" style={{ color: '#6B7280' }}>
        Tunable coefficients that drive <strong>Forecasting 360</strong>, the{' '}
        <strong>Operations 360</strong> SLA monitor and <strong>Contract 360</strong> health.
        Changes apply to every calculation immediately.
      </p>

      {error && (
        <div className="rounded-md border p-3 mb-4 text-sm" style={{ background: '#FEF2F2', borderColor: '#FECACA', color: '#7F1D1D' }}>
          {error}
        </div>
      )}

      <div className="space-y-5">
        <SectionCard icon={ChartLineUp} title="Forecasting" subtitle="Revenue / pipeline / capacity model parameters.">
          <Field label="Unknown-stage probability" hint="Close probability used when a deal stage is not in the model (0–1).">
            <NumberInput section="forecast" field="default_unknown_probability" value={value.forecast.default_unknown_probability} onChange={setField} step="0.01" min="0" max="1" testid="op-fc-unknown" disabled={loading} />
          </Field>
          <Field label="Payment lag (days)" hint="Assumed days until payment when a deal has no ETA.">
            <NumberInput section="forecast" field="default_payment_lag_days" value={value.forecast.default_payment_lag_days} onChange={setField} step="1" min="0" max="365" testid="op-fc-lag" disabled={loading} />
          </Field>
          <Field label="Manager target open deals" hint="Comfortable simultaneous open-deal load per manager (utilisation %).">
            <NumberInput section="forecast" field="manager_target_open_deals" value={value.forecast.manager_target_open_deals} onChange={setField} step="1" min="1" max="100" testid="op-fc-mgr-target" disabled={loading} />
          </Field>
          <Field label="Carrier target open loads" hint="Comfortable simultaneous loads per carrier.">
            <NumberInput section="forecast" field="carrier_target_open_loads" value={value.forecast.carrier_target_open_loads} onChange={setField} step="1" min="1" max="100" testid="op-fc-carrier-target" disabled={loading} />
          </Field>
        </SectionCard>

        <SectionCard icon={Timer} title="SLA thresholds" subtitle="Operations 360 violation limits.">
          <Field label="Lead first response (minutes)">
            <NumberInput section="sla" field="lead_response_minutes" value={value.sla.lead_response_minutes} onChange={setField} step="1" min="1" max="1440" testid="op-sla-lead" disabled={loading} />
          </Field>
          <Field label="Deal stuck (days)">
            <NumberInput section="sla" field="deal_stuck_days" value={value.sla.deal_stuck_days} onChange={setField} step="1" min="1" max="365" testid="op-sla-deal" disabled={loading} />
          </Field>
          <Field label="Deposit pending (days)">
            <NumberInput section="sla" field="deposit_pending_days" value={value.sla.deposit_pending_days} onChange={setField} step="1" min="1" max="365" testid="op-sla-deposit" disabled={loading} />
          </Field>
          <Field label="Carrier not assigned (days)">
            <NumberInput section="sla" field="carrier_unassigned_days" value={value.sla.carrier_unassigned_days} onChange={setField} step="1" min="1" max="365" testid="op-sla-carrier" disabled={loading} />
          </Field>
          <Field label="Customs (days)">
            <NumberInput section="sla" field="customs_days" value={value.sla.customs_days} onChange={setField} step="1" min="1" max="365" testid="op-sla-customs" disabled={loading} />
          </Field>
        </SectionCard>

        <SectionCard icon={FileText} title="Contract health" subtitle="Contract 360 grace / warning windows.">
          <Field label="Unsigned grace (days)" hint="A contract sent longer ago than this and still unsigned is flagged.">
            <NumberInput section="contract" field="unsigned_grace_days" value={value.contract.unsigned_grace_days} onChange={setField} step="1" min="0" max="365" testid="op-ct-unsigned" disabled={loading} />
          </Field>
          <Field label="Expiry warning (days)" hint="Add a warning when a contract is within this many days of expiry.">
            <NumberInput section="contract" field="expiry_warn_days" value={value.contract.expiry_warn_days} onChange={setField} step="1" min="0" max="365" testid="op-ct-expiry" disabled={loading} />
          </Field>
        </SectionCard>

        <div className="flex items-center justify-between pt-2">
          <div className="text-xs" style={{ color: '#9CA3AF' }}>
            {meta.updated_at ? (
              <>Last saved {new Date(meta.updated_at).toLocaleString()} by {meta.updated_by || 'admin'}</>
            ) : 'Not saved yet'}
          </div>
          <div className="flex gap-2">
            <button
              onClick={reset}
              className="px-3 py-2 rounded-md text-sm font-semibold border"
              style={{ borderColor: '#E5E7EB', color: '#6B7280', background: '#FFFFFF' }}
              disabled={loading || saving}
              data-testid="op-reset"
            >
              <ArrowsClockwise size={14} className="inline mr-1" /> Reset to defaults
            </button>
            <button
              onClick={save}
              className="px-4 py-2 rounded-md text-sm font-semibold"
              style={{ background: '#FFA800', color: '#111' }}
              disabled={loading || saving}
              data-testid="op-save"
            >
              <FloppyDisk size={14} className="inline mr-1" /> {saving ? 'Saving…' : 'Save policy'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
