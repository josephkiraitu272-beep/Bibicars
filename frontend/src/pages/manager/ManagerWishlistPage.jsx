/**
 * Manager Wishlist Builder  —  /manager/wishlist
 * ───────────────────────────────────────────────
 * Главная рабочая страница менеджера для блока «Top Deals of the Week».
 * Менеджер курирует подборку, тимлид её апрувит.
 *
 * Структура: переиспользуемая форма WishlistDealForm + список собственных
 * заявок со статусами.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Trash, CheckCircle, XCircle, Clock, Car } from "@phosphor-icons/react";
import { useLang } from "../../i18n";
import WishlistDealForm from "../../components/wishlist/WishlistDealForm";

const API_URL = "https://backend-production-ae6d.up.railway.app";

const STATUS_PILL = {
  pending: { color: "#D97706", bg: "#FEF3C7", key: "pending", Icon: Clock },
  approved: {
    color: "#059669",
    bg: "#D1FAE5",
    key: "approved",
    Icon: CheckCircle,
  },
  rejected: { color: "#DC2626", bg: "#FEE2E2", key: "rejected", Icon: XCircle },
};

// Localized UI strings (en / uk / bg — no Russian).
const L = {
  header: {
    en: "Top Deals of the Week — Builder",
    uk: "Топ пропозиції тижня — Конструктор",
    bg: "Топ оферти на седмицата — Конструктор",
  },
  desc: {
    en: "Curate the homepage wishlist. Submit cards by VIN → team-lead approves → public block updates.",
    uk: "Кураторська добірка для головної. Додавайте картки за VIN → тимлід підтверджує → публічний блок оновлюється.",
    bg: "Селекция за началната страница. Добавяйте карти по VIN → тийм-лийдът одобрява → публичният блок се обновява.",
  },
  pending: { en: "Pending", uk: "Очікує", bg: "Очаква" },
  approved: { en: "Approved", uk: "Підтверджено", bg: "Одобрено" },
  rejected: { en: "Rejected", uk: "Відхилено", bg: "Отказано" },
  all: { en: "All", uk: "Усі", bg: "Всички" },
  mine: { en: "Mine", uk: "Мої", bg: "Мои" },
  loading: { en: "Loading…", uk: "Завантаження…", bg: "Зареждане…" },
  empty: {
    en: "No wishlist cards yet — create your first pick above.",
    uk: "Ще немає карток — створіть першу вище.",
    bg: "Все още няма карти — създайте първата по-горе.",
  },
  del_confirm: {
    en: "Delete this wishlist card?",
    uk: "Видалити цю картку?",
    bg: "Изтриване на тази карта?",
  },
  deleted: { en: "Deleted", uk: "Видалено", bg: "Изтрито" },
  del_failed: {
    en: "Delete failed",
    uk: "Не вдалося видалити",
    bg: "Неуспешно изтриване",
  },
  week: { en: "Week", uk: "Тиждень", bg: "Седмица" },
  created_by: { en: "Created by", uk: "Створив", bg: "Създадено от" },
  by_approved: { en: "approved by", uk: "підтвердив", bg: "одобрено от" },
  by_rejected: { en: "rejected by", uk: "відхилив", bg: "отказано от" },
  del: { en: "Delete", uk: "Видалити", bg: "Изтриване" },
  load_failed: {
    en: "Failed to load wishlist",
    uk: "Не вдалося завантажити",
    bg: "Неуспешно зареждане",
  },
};

const ManagerWishlistPage = () => {
  const { t, lang } = useLang();
  const tr = (k) => (L[k] && (L[k][lang] || L[k].en)) || k;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all"); // all|mine|pending|approved|rejected

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filter === "mine") params.mine_only = true;
      if (["pending", "approved", "rejected"].includes(filter))
        params.status = filter;
      const { data } = await axios.get(
        `${API_URL}/api/manager/wishlist-deals`,
        { params },
      );
      setItems(Array.isArray(data?.data) ? data.data : []);
    } catch {
      toast.error(t("loadingError") || tr("load_failed"));
    } finally {
      setLoading(false);
    }
  }, [filter, t]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleDelete = async (id) => {
    if (!window.confirm(tr("del_confirm"))) return;
    try {
      await axios.delete(`${API_URL}/api/manager/wishlist-deals/${id}`);
      toast.success(tr("deleted"));
      setItems((prev) => prev.filter((x) => x.id !== id));
    } catch (err) {
      toast.error(err?.response?.data?.detail || tr("del_failed"));
    }
  };

  const grouped = useMemo(() => {
    const out = { pending: [], approved: [], rejected: [] };
    items.forEach((it) => {
      const k = it.status || "pending";
      if (out[k]) out[k].push(it);
    });
    return out;
  }, [items]);

  return (
    <motion.div
      data-testid="manager-wishlist-page"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-5"
    >
      {/* Header */}
      <div>
        <h1
          className="text-2xl font-bold text-[#18181B]"
          style={{
            fontFamily: "Mazzard, Mazzard H, Mazzard M, system-ui, sans-serif",
          }}
        >
          {tr("header")}
        </h1>
        <p className="text-sm text-[#71717A] mt-1">{tr("desc")}</p>
      </div>

      {/* Builder form (shared component) */}
      <WishlistDealForm onCreated={fetchItems} />

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: "all", label: `${tr("all")} (${items.length})` },
          { id: "mine", label: tr("mine") },
          {
            id: "pending",
            label: `${tr("pending")} (${grouped.pending.length})`,
          },
          {
            id: "approved",
            label: `${tr("approved")} (${grouped.approved.length})`,
          },
          {
            id: "rejected",
            label: `${tr("rejected")} (${grouped.rejected.length})`,
          },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            data-testid={`wishlist-filter-${f.id}`}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
              filter === f.id
                ? "bg-[#18181B] text-white border-[#18181B]"
                : "bg-white text-[#18181B] border-[#E4E4E7] hover:border-[#A1A1AA]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl border border-[#E4E4E7] overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm text-[#71717A]">
            {tr("loading")}
          </div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-sm text-[#71717A]">
            {tr("empty")}
          </div>
        ) : (
          <div
            className="divide-y divide-[#E4E4E7]"
            data-testid="wishlist-items-list"
          >
            <AnimatePresence>
              {items.map((it) => {
                const pill = STATUS_PILL[it.status] || STATUS_PILL.pending;
                const Icon = pill.Icon;
                const s = it.snapshot || {};
                return (
                  <motion.div
                    key={it.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    className="p-4 flex items-center gap-4 hover:bg-[#FAFAFA]"
                    data-testid={`wishlist-item-${it.id}`}
                  >
                    {s.image ? (
                      <img
                        src={s.image}
                        alt={it.vin}
                        className="w-20 h-14 rounded-lg object-cover bg-[#F4F4F5]"
                      />
                    ) : (
                      <div className="w-20 h-14 rounded-lg bg-[#F4F4F5] flex items-center justify-center">
                        <Car size={20} className="text-[#A1A1AA]" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-[#18181B] truncate">
                          {[s.year, s.make, s.model]
                            .filter(Boolean)
                            .join(" ") ||
                            s.title ||
                            it.vin}
                        </span>
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                          style={{ color: pill.color, background: pill.bg }}
                        >
                          <Icon size={10} weight="fill" /> {tr(pill.key)}
                        </span>
                      </div>
                      <div className="text-xs text-[#71717A] truncate">
                        VIN {it.vin} · {it.category} · {it.budget} ·{" "}
                        {tr("week")} {it.week_start}
                        {it.note ? ` · "${it.note}"` : ""}
                      </div>
                      <div className="text-[10px] text-[#A1A1AA] mt-0.5">
                        {tr("created_by")} {it.created_by_name || it.created_by}
                        {it.approved_by_name
                          ? ` · ${it.status === "rejected" ? tr("by_rejected") : tr("by_approved")} ${it.approved_by_name}`
                          : ""}
                        {it.reject_reason ? ` · ${it.reject_reason}` : ""}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(it.id)}
                      title={tr("del")}
                      data-testid={`wishlist-delete-${it.id}`}
                      className="p-2 text-[#A1A1AA] hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                    >
                      <Trash size={16} />
                    </button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default ManagerWishlistPage;
