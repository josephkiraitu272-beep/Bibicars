/**
 * BIBI Cars — Lead Deposits (Task #5)
 * ------------------------------------------------------------------
 * Replaces the removed "Customers" CRM page. Lists every lead/client who
 * left a deposit, in a Sales-style table. Data comes from the existing
 * enriched GET /api/deposits endpoint (RBAC-scoped: managers see only
 * their own customers' deposits; admin/team-lead see all).
 *
 * Each row opens the unified Customer 360 card (the same card a lead opens
 * into) — keeping the single-ecosystem flow. Quick Call / Viber are inline.
 */

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Wallet, RefreshCw, Search, ArrowUpRight, Users, CheckCircle2, Clock, Coins,
} from 'lucide-react';
import { useLang } from '../i18n';
import QuickCallButton from '../components/calls/QuickCallButton';
import ViberButton from '../components/calls/ViberButton';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const STR = {
  uk: { title: 'Депозити', subtitle: 'Усі ліди, які залишили депозит', search: 'Пошук за іменем, телефоном…',
    all: 'Усі', pending: 'Очікує', paid: 'Сплачено', cancelled: 'Скасовано', refunded: 'Повернуто',
    client: 'Клієнт', source: 'Джерело', manager: 'Менеджер', amount: 'Сума', status: 'Статус', date: 'Дата', actions: 'Дії',
    open: 'Відкрити картку', empty: 'Депозитів не знайдено', loading: 'Завантаження…',
    total: 'Усього депозитів', sumPaid: 'Сплачено', sumPending: 'Очікує', sumAmount: 'Загальна сума', unassigned: 'не призначено' },
  en: { title: 'Deposits', subtitle: 'All leads who left a deposit', search: 'Search by name, phone…',
    all: 'All', pending: 'Pending', paid: 'Paid', cancelled: 'Cancelled', refunded: 'Refunded',
    client: 'Client', source: 'Source', manager: 'Manager', amount: 'Amount', status: 'Status', date: 'Date', actions: 'Actions',
    open: 'Open card', empty: 'No deposits found', loading: 'Loading…',
    total: 'Total deposits', sumPaid: 'Paid', sumPending: 'Pending', sumAmount: 'Total amount', unassigned: 'unassigned' },
  bg: { title: 'Депозити', subtitle: 'Всички лийдове, оставили депозит', search: 'Търсене по име, телефон…',
    all: 'Всички', pending: 'Изчаква', paid: 'Платено', cancelled: 'Отказано', refunded: 'Възстановено',
    client: 'Клиент', source: 'Източник', manager: 'Мениджър', amount: 'Сума', status: 'Статус', date: 'Дата', actions: 'Действия',
    open: 'Отвори картон', empty: 'Няма намерени депозити', loading: 'Зареждане…',
    total: 'Общо депозити', sumPaid: 'Платени', sumPending: 'Изчакват', sumAmount: 'Обща сума', unassigned: 'без назначение' },
};

const STATUS_BADGE = {
  pending:   { bg: '#FEF3C7', text: '#92400E', dot: '#D97706' },
  paid:      { bg: '#DCFCE7', text: '#166534', dot: '#16A34A' },
  cancelled: { bg: '#F4F4F5', text: '#52525B', dot: '#A1A1AA' },
  refunded:  { bg: '#FEE2E2', text: '#991B1B', dot: '#DC2626' },
};

const fmtMoney = (v, cur) => {
  const n = Number(v || 0);
  const sym = cur === 'USD' ? '$' : cur === 'BGN' ? 'лв' : cur === 'UAH' ? '₴' : cur === 'GBP' ? '£' : '€';
  return `${sym}${n.toLocaleString()}`;
};
const fmtDate = (iso) => { if (!iso) return '—'; try { return new Date(iso).toLocaleDateString(); } catch { return '—'; } };

const Tile = ({ icon: Icon, label, value, color }) => (
  <div className="card bg-white p-4 flex items-center gap-3" data-testid="deposit-tile">
    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${color}1A` }}>
      <Icon size={18} style={{ color }} />
    </div>
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wider text-[#A1A1AA] truncate">{label}</p>
      <p className="text-lg font-bold text-[#18181B] tabular-nums">{value}</p>
    </div>
  </div>
);

const LeadDeposits = () => {
  const { lang } = useLang();
  const L = STR[lang] || STR.en;
  const navigate = useNavigate();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [q, setQ] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      p.append('limit', '500');
      if (statusFilter) p.append('status', statusFilter);
      const r = await axios.get(`${API_URL}/api/deposits?${p}`);
      setItems(r.data?.items || []);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to load deposits');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((d) =>
      `${d.customerName || ''} ${d.customerPhone || ''} ${d.managerName || ''} ${d.leadSource || ''}`
        .toLowerCase()
        .includes(needle)
    );
  }, [items, q]);

  const stats = useMemo(() => {
    const paid = items.filter((i) => (i.status || '').toLowerCase() === 'paid');
    const pending = items.filter((i) => ['pending', ''].includes((i.status || '').toLowerCase()));
    const sum = items.reduce((acc, i) => acc + Number(i.amount || 0), 0);
    return { total: items.length, paid: paid.length, pending: pending.length, sum };
  }, [items]);

  const STATUS_TABS = ['', 'pending', 'paid', 'cancelled', 'refunded'];

  return (
    <motion.div data-testid="lead-deposits-page" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      {/* Header */}
      <div className="flex flex-row items-start justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-[#7360F2]/10 flex items-center justify-center">
            <Wallet size={22} className="text-[#7360F2]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[#18181B]">{L.title}</h1>
            <p className="text-sm text-[#71717A]">{L.subtitle}</p>
          </div>
        </div>
        <button onClick={fetchData} className="btn-secondary inline-flex items-center gap-2" data-testid="deposits-refresh">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> 
        </button>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Tile icon={Users} label={L.total} value={stats.total} color="#4F46E5" />
        <Tile icon={CheckCircle2} label={L.sumPaid} value={stats.paid} color="#16A34A" />
        <Tile icon={Clock} label={L.sumPending} value={stats.pending} color="#D97706" />
        <Tile icon={Coins} label={L.sumAmount} value={fmtMoney(stats.sum, 'EUR')} color="#7360F2" />
      </div>

      {/* Toolbar — status tabs + search */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div className="flex items-center gap-1.5 flex-wrap">
          {STATUS_TABS.map((s) => {
            const active = statusFilter === s;
            const label = s === '' ? L.all : L[s];
            return (
              <button
                key={s || 'all'}
                onClick={() => setStatusFilter(s)}
                data-testid={`deposit-status-tab-${s || 'all'}`}
                className={`px-3 py-1.5 rounded-lg text-[12.5px] font-medium border transition-colors ${
                  active ? 'bg-[#18181B] text-white border-[#18181B]' : 'bg-white text-[#3F3F46] border-[#E4E4E7] hover:border-[#A1A1AA]'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <div className="relative sm:ml-auto sm:w-72">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A1A1AA]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={L.search}
            data-testid="deposits-search"
            className="w-full h-9 pl-9 pr-3 rounded-xl border border-[#E4E4E7] bg-white text-[13px] focus:outline-none focus:border-[#4F46E5]"
          />
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden bg-white" data-testid="lead-deposits-table">
        <div className="overflow-x-auto">
          <table className="table-premium min-w-[760px] w-full">
            <thead>
              <tr>
                <th>{L.client}</th>
                <th>{L.source}</th>
                <th>{L.manager}</th>
                <th className="text-right">{L.amount}</th>
                <th>{L.status}</th>
                <th>{L.date}</th>
                <th className="text-right">{L.actions}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-12 text-[#71717A]">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-[#18181B] border-t-transparent rounded-full animate-spin" />
                    {L.loading}
                  </div>
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-[#71717A]" data-testid="deposits-empty">{L.empty}</td></tr>
              ) : filtered.map((d, idx) => {
                const badge = STATUS_BADGE[(d.status || 'pending').toLowerCase()] || STATUS_BADGE.pending;
                const openCard = () => d.customerId && navigate(`/admin/customers/${d.customerId}/360`);
                return (
                  <tr key={d.id || idx} data-testid={`deposit-row-${d.id || idx}`} className="hover:bg-[#FAFAFA]">
                    <td className="font-medium text-[#18181B]">
                      <div className="truncate max-w-[200px]">{d.customerName || '—'}</div>
                      {d.customerPhone ? <div className="text-[11px] text-[#A1A1AA] tabular-nums">{d.customerPhone}</div> : null}
                    </td>
                    <td className="text-xs text-[#71717A]">{d.leadSource || '—'}</td>
                    <td className="text-xs text-[#3F3F46]">{d.managerName || <span className="text-[#A1A1AA] italic">{L.unassigned}</span>}</td>
                    <td className="text-right font-semibold text-[#16A34A] tabular-nums">{fmtMoney(d.amount, d.currency)}</td>
                    <td>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold" style={{ background: badge.bg, color: badge.text }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: badge.dot }} />
                        {L[(d.status || 'pending').toLowerCase()] || d.status}
                      </span>
                    </td>
                    <td className="text-xs text-[#71717A] tabular-nums">{fmtDate(d.date || d.created_at)}</td>
                    <td>
                      <div className="flex items-center justify-end gap-1.5">
                        {d.customerPhone ? <QuickCallButton phone={d.customerPhone} lang={lang} variant="icon" testId={`deposit-call-${d.id || idx}`} /> : null}
                        {d.customerPhone ? <ViberButton phone={d.customerPhone} lang={lang} variant="icon" testId={`deposit-viber-${d.id || idx}`} /> : null}
                        <button
                          onClick={openCard}
                          disabled={!d.customerId}
                          data-testid={`deposit-open-${d.id || idx}`}
                          title={L.open}
                          className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl border border-[#E4E4E7] text-[12px] font-medium text-[#18181B] hover:bg-[#F4F4F5] disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <ArrowUpRight size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
};

export default LeadDeposits;
