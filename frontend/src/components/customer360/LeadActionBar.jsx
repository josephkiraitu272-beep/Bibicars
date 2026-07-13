/**
 * BIBI Cars — LeadActionBar (Unified CRM, single ecosystem)
 * ------------------------------------------------------------------
 * Surfaced at the top of the full Customer 360 card whenever the card
 * was opened FROM a lead (?lead=<id>) — or when the customer has linked
 * leads. It carries every "quick action" that used to live on the old,
 * separate lead card, so a manager never loses pipeline control after
 * leads & customers were merged into one card:
 *
 *   • Lead pipeline status      (PATCH /api/leads/{id}/status)
 *   • Convert / Win             (status → converted — explicit)
 *   • Quick: Call · Task · Meeting   (jump to the matching card tab)
 *   • Edit lead                 (reuses LeadCreateModal in edit mode)
 *   • Reassign manager          (reuses ReassignDialog, entity=lead)
 *   • Delete lead               (DELETE /api/leads/{id})
 *
 * If the customer has more than one lead, a compact switcher lets the
 * manager pick which lead the bar acts on.
 */

import React, { useMemo, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import {
  Target,
  PencilSimple,
  Trash,
  ArrowsClockwise,
  ListChecks,
  CalendarBlank,
  Trophy,
} from "@phosphor-icons/react";

import { API_URL } from "../../App";
import {
  LEAD_PIPELINE,
  STATUS_THEME,
  statusLabel,
} from "../leads/leadConstants";
import { Select, SelectContent, SelectItem, SelectTrigger } from "../ui/Select";
import LeadCreateModal from "../leads/LeadCreateModal";
import ReassignDialog from "../ui/ReassignDialog";
import QuickCallButton from "../calls/QuickCallButton";
import ViberButton from "../calls/ViberButton";
import { detectCountry, isValidForCountry } from "../ui/PhoneInput";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Local i18n (colocated — same pattern as TasksTab) so the bar is fully
// translated even before translations.js round-trips.
const STR = {
  uk: {
    lead: "Лід",
    status: "Статус",
    convert: "Конвертувати",
    won: "Виграно",
    call: "Дзвінок",
    task: "Задача",
    meeting: "Зустріч",
    edit: "Редагувати",
    reassign: "Переназначити",
    del: "Видалити",
    assignee: "Менеджер",
    unassigned: "не призначено",
    confirmDel: "Видалити цей лід? Дію не можна скасувати.",
    statusSaved: "Статус оновлено",
    deleted: "Лід видалено",
    saved: "Лід збережено",
    err: "Сталася помилка",
    checkFields: "Перевірте поля форми",
    pickLead: "Оберіть лід",
    quick: "Швидкі дії",
    converted: "Лід конвертовано",
  },
  en: {
    lead: "Lead",
    status: "Status",
    convert: "Convert",
    won: "Won",
    call: "Call",
    task: "Task",
    meeting: "Meeting",
    edit: "Edit",
    reassign: "Reassign",
    del: "Delete",
    assignee: "Manager",
    unassigned: "unassigned",
    confirmDel: "Delete this lead? This cannot be undone.",
    statusSaved: "Status updated",
    deleted: "Lead deleted",
    saved: "Lead saved",
    err: "Something went wrong",
    checkFields: "Check the form fields",
    pickLead: "Pick a lead",
    quick: "Quick actions",
    converted: "Lead converted",
  },
  bg: {
    lead: "Лийд",
    status: "Статус",
    convert: "Конвертирай",
    won: "Спечелен",
    call: "Обаждане",
    task: "Задача",
    meeting: "Среща",
    edit: "Редактирай",
    reassign: "Преназначи",
    del: "Изтрий",
    assignee: "Мениджър",
    unassigned: "без назначение",
    confirmDel: "Да изтрия този лийд? Действието е необратимо.",
    statusSaved: "Статусът е обновен",
    deleted: "Лийдът е изтрит",
    saved: "Лийдът е запазен",
    err: "Възникна грешка",
    checkFields: "Проверете полетата",
    pickLead: "Изберете лийд",
    quick: "Бързи действия",
    converted: "Лийдът е конвертиран",
  },
};

const ActionBtn = ({
  icon: Icon,
  label,
  onClick,
  tone = "default",
  testId,
  disabled,
}) => {
  const tones = {
    default:
      "bg-white border-[#E4E4E7] text-[#3F3F46] hover:border-[#A1A1AA] hover:bg-[#FAFAFA]",
    primary: "bg-[#18181B] border-[#18181B] text-white hover:bg-[#27272A]",
    success: "bg-[#16A34A] border-[#16A34A] text-white hover:bg-[#15803D]",
    danger: "bg-white border-[#FCA5A5] text-[#DC2626] hover:bg-[#FEF2F2]",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[12.5px] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${tones[tone]}`}
    >
      <Icon size={15} weight="bold" />
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
};

const LeadActionBar = ({
  leads = [],
  activeLeadId,
  lang = "uk",
  canReassign = false,
  managersMap = {},
  onChanged = () => {},
  onJumpTab = () => {},
  onActiveLeadChange = () => {},
}) => {
  const L = STR[lang] || STR.en;

  // Resolve which lead this bar acts on.
  const activeLead = useMemo(() => {
    if (!leads.length) return null;
    if (activeLeadId) {
      const hit = leads.find((l) => l.id === activeLeadId);
      if (hit) return hit;
    }
    // newest first by created_at
    return [...leads].sort((a, b) =>
      String(b.created_at || "").localeCompare(String(a.created_at || "")),
    )[0];
  }, [leads, activeLeadId]);

  const [statusSaving, setStatusSaving] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [editErrors, setEditErrors] = useState({});
  const [reassignOpen, setReassignOpen] = useState(false);

  if (!activeLead) return null;

  const theme = STATUS_THEME[activeLead.status] || STATUS_THEME.new;
  const isConverted = activeLead.status === "converted";
  const assignee =
    activeLead.managerId && managersMap[activeLead.managerId]
      ? managersMap[activeLead.managerId].name ||
        managersMap[activeLead.managerId].email
      : L.unassigned;

  const changeStatus = async (newStatus) => {
    if (!newStatus || newStatus === activeLead.status) return;
    setStatusSaving(true);
    try {
      await axios.patch(`${API_URL}/api/leads/${activeLead.id}/status`, {
        status: newStatus,
        reason: "card_change",
      });
      toast.success(`${L.statusSaved} → ${statusLabel(lang, newStatus)}`);
      onChanged();
    } catch (err) {
      toast.error(err?.response?.data?.detail || L.err);
    } finally {
      setStatusSaving(false);
    }
  };

  const doConvert = () => changeStatus("converted");

  const openEdit = () => {
    const detected = detectCountry(activeLead.phone);
    setEditForm({
      firstName: activeLead.firstName || "",
      lastName: activeLead.lastName || "",
      email: activeLead.email || "",
      phone: activeLead.phone || "",
      phoneCountry:
        activeLead.phoneCountry || (detected && detected.code) || "BG",
      vehicleInterest: activeLead.vehicleInterest || activeLead.company || "",
      source: activeLead.source || "website",
      description: activeLead.description || activeLead.notes || "",
      budgetEur: activeLead.budgetEur || activeLead.budgetUsd || "",
    });
    setEditErrors({});
    setShowEdit(true);
  };

  const submitEdit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!(editForm.firstName || "").trim()) errs.firstName = "Required";
    if (!(editForm.lastName || "").trim()) errs.lastName = "Required";
    if (!(editForm.email || "").trim()) errs.email = "Required";
    else if (!EMAIL_RE.test(editForm.email.trim()))
      errs.email = "Invalid email";
    if (
      editForm.phone &&
      !isValidForCountry(editForm.phone, editForm.phoneCountry)
    ) {
      errs.phone = "Invalid phone";
    }
    setEditErrors(errs);
    if (Object.keys(errs).length) {
      toast.error(L.checkFields);
      return;
    }
    try {
      await axios.put(`${API_URL}/api/leads/${activeLead.id}`, {
        firstName: editForm.firstName.trim(),
        lastName: editForm.lastName.trim(),
        email: editForm.email.trim(),
        phone: editForm.phone || null,
        phoneCountry: editForm.phoneCountry || null,
        vehicleInterest: editForm.vehicleInterest || null,
        source: editForm.source,
        description: editForm.description || null,
        budgetEur: Number(editForm.budgetEur) || 0,
      });
      toast.success(L.saved);
      setShowEdit(false);
      onChanged();
    } catch (err) {
      toast.error(err?.response?.data?.detail || L.err);
    }
  };

  const doDelete = async () => {
    if (!window.confirm(L.confirmDel)) return;
    try {
      await axios.delete(`${API_URL}/api/leads/${activeLead.id}`);
      toast.success(L.deleted);
      onChanged();
    } catch (err) {
      toast.error(err?.response?.data?.detail || L.err);
    }
  };

  return (
    <div
      className="rounded-2xl border border-[#E4E4E7] bg-white p-4 sm:p-5 shadow-sm"
      data-testid="lead-action-bar"
      style={{ borderLeft: `4px solid ${theme.hex}` }}
    >
      {/* Top row — lead identity + (optional) lead switcher */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: theme.soft }}
          >
            <Target size={18} weight="bold" style={{ color: theme.hex }} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-[#A1A1AA] leading-none">
              {L.lead}
            </p>
            <p className="text-sm font-semibold text-[#18181B] truncate">
              {activeLead.name ||
                `${activeLead.firstName || ""} ${activeLead.lastName || ""}`.trim() ||
                activeLead.email}
            </p>
          </div>
          <span
            className="ml-1 px-2.5 py-1 rounded-full text-[11px] font-semibold shrink-0"
            style={{ background: theme.soft, color: theme.text }}
            data-testid="lead-action-bar-status-pill"
          >
            {statusLabel(lang, activeLead.status)}
          </span>
        </div>

        {/* Lead switcher when the customer has multiple leads */}
        {leads.length > 1 && (
          <Select
            value={activeLead.id}
            onValueChange={(v) => onActiveLeadChange(v)}
          >
            <SelectTrigger
              className="h-9 w-auto min-w-[180px] rounded-xl border-[#E4E4E7] text-[12.5px]"
              data-testid="lead-switcher"
            >
              <span className="truncate">
                {activeLead.name || activeLead.email} ·{" "}
                {statusLabel(lang, activeLead.status)}
              </span>
            </SelectTrigger>
            <SelectContent>
              {[...leads]
                .sort((a, b) =>
                  String(b.created_at || "").localeCompare(
                    String(a.created_at || ""),
                  ),
                )
                .map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name ||
                      `${l.firstName || ""} ${l.lastName || ""}`.trim() ||
                      l.email}{" "}
                    · {statusLabel(lang, l.status)}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Action row */}
      <div className="mt-4 flex items-center gap-2 flex-wrap">
        {/* Pipeline status selector */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider text-[#A1A1AA]">
            {L.status}
          </span>
          <Select
            value={activeLead.status}
            onValueChange={changeStatus}
            disabled={statusSaving}
          >
            <SelectTrigger
              className="h-9 w-auto min-w-[150px] rounded-xl border-[#E4E4E7] text-[12.5px] font-medium"
              data-testid="lead-status-select"
            >
              <span className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: theme.dot }}
                />
                {statusLabel(lang, activeLead.status)}
              </span>
            </SelectTrigger>
            <SelectContent>
              {LEAD_PIPELINE.map((s) => (
                <SelectItem
                  key={s}
                  value={s}
                  data-testid={`lead-status-opt-${s}`}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{
                        background: (STATUS_THEME[s] || STATUS_THEME.new).dot,
                      }}
                    />
                    {statusLabel(lang, s)}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="h-6 w-px bg-[#E4E4E7] mx-1 hidden sm:block" />

        {/* Convert / Win */}
        {!isConverted && (
          <ActionBtn
            icon={Trophy}
            label={L.convert}
            tone="success"
            onClick={doConvert}
            testId="lead-action-convert"
          />
        )}

        {/* Quick communications — Call dials the customer via Ringostat
            (click-to-call); Viber opens a chat by phone; Task & Meeting
            jump to their card tabs. Call/Viber only render with a phone. */}
        {activeLead.phone && (
          <>
            <QuickCallButton
              phone={activeLead.phone}
              lang={lang}
              variant="ghost"
              testId="lead-action-call"
            />
            <ViberButton
              phone={activeLead.phone}
              lang={lang}
              variant="ghost"
              testId="lead-action-viber"
            />
          </>
        )}
        <ActionBtn
          icon={ListChecks}
          label={L.task}
          onClick={() => onJumpTab("tasks")}
          testId="lead-action-task"
        />
        <ActionBtn
          icon={CalendarBlank}
          label={L.meeting}
          onClick={() => onJumpTab("meetings")}
          testId="lead-action-meeting"
        />

        <div className="h-6 w-px bg-[#E4E4E7] mx-1 hidden sm:block" />

        {/* Edit */}
        <ActionBtn
          icon={PencilSimple}
          label={L.edit}
          onClick={openEdit}
          testId="lead-action-edit"
        />

        {/* Reassign */}
        {canReassign && (
          <ActionBtn
            icon={ArrowsClockwise}
            label={L.reassign}
            onClick={() => setReassignOpen(true)}
            testId="lead-action-reassign"
          />
        )}

        {/* Delete */}
        <ActionBtn
          icon={Trash}
          label={L.del}
          tone="danger"
          onClick={doDelete}
          testId="lead-action-delete"
        />

        {/* Assignee chip (read-only, right aligned) */}
        <span className="ml-auto text-[12px] text-[#71717A] hidden md:inline">
          {L.assignee}:{" "}
          <span className="font-medium text-[#3F3F46]">{assignee}</span>
        </span>
      </div>

      {/* Edit modal — reuses the canonical lead form */}
      <LeadCreateModal
        open={showEdit}
        onOpenChange={(open) => {
          setShowEdit(open);
        }}
        formData={editForm}
        setFormData={setEditForm}
        formErrors={editErrors}
        editingLead={activeLead}
        onSubmit={submitEdit}
        lang={lang}
      />

      {/* Reassign dialog */}
      {canReassign && reassignOpen && (
        <ReassignDialog
          open={reassignOpen}
          onClose={() => setReassignOpen(false)}
          entity="lead"
          ids={[activeLead.id]}
          currentManagerId={activeLead.managerId}
          onSuccess={() => {
            setReassignOpen(false);
            onChanged();
          }}
        />
      )}
    </div>
  );
};

export default LeadActionBar;
