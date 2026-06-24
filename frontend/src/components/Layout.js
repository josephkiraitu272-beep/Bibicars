import React, { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../App';
import { useLang, LANGUAGES } from '../i18n';
import NotificationBell from './NotificationBell';
import RingostatManager from './ringostat/RingostatManager';
import RingostatLiveBar from './ringostat/RingostatLiveBar';
import RingostatSupervisionPanel from './ringostat/RingostatSupervisionPanel';
import { useRingostatPrefs } from '../hooks/useRingostatPrefs';
import { 
  ChartPieSlice,
  UsersThree,
  UserCircle,
  Handshake,
  Wallet,
  FileText,
  CarProfile,
  MagnifyingGlass,
  Calculator,
  UsersFour,
  ClipboardText,
  GearSix,
  Database,
  SignOut,
  CaretDown,
  CaretUp,
  ChartLine,
  Megaphone,
  ChartBar,
  UserPlus,
  CreditCard,
  Receipt,
  Car,
  Barcode,
  Percent,
  Users,
  ListChecks,
  Sliders,
  Wrench,
  TrendUp,
  Target,
  List,
  X,
  Globe,
  Phone,
  PhoneCall,
  Anchor,
  Heart,
  Shield,
  ShieldCheck,
  Plugs, // eslint-disable-line no-unused-vars -- kept for legacy refs; safe to remove later
  Path,
  Timer,
  Lightning,
  Briefcase,
  Stack,
  Truck,
  Bell,
  ArrowsClockwise,
  Fire,
  ChartLineUp,
  Kanban,
  User,
  Warning,
  Gauge,
  Scales,
  LockKey,
  Crown,
  Storefront,
  Compass,
  CurrencyDollar as Banknote,
  CalendarCheck,
  BookOpenText,
  Pulse,
} from '@phosphor-icons/react';

/* ──────────────────────────────────────────────────────────────────
 * Sidebar tooltips → CRM Guide
 * Hover any sidebar item to see a 1–2 sentence description of the
 * module plus a deep link to the relevant guide section. Maps key=path
 * → { sec, uk, en, bg } so the tooltip text follows the active locale.
 * ────────────────────────────────────────────────────────────────── */
const SIDEBAR_TIPS = {
  '/admin': { sec: 'm-dashboard',
    uk: 'Загальний пульс системи: нові ліди, відкриті угоди, прострочені задачі. Те, що пульсує червоним — відкривайте першим.',
    en: "The system's pulse: new leads, open deals, overdue tasks. Anything pulsing red is what to handle first.",
    bg: 'Пулсът на системата: нови лийдове, отворени сделки, просрочени задачи. Червеното пулсиращо — отваряйте първо.',
  },
  '/admin/guide': { sec: 'intro',
    uk: 'Внутрішня «біла книга» CRM: усі модулі, ролі, бізнес-процеси та FAQ.',
    en: 'The internal CRM whitepaper: every module, role, business flow, and FAQ.',
    bg: 'Вътрешната „бяла книга“ на CRM: всички модули, роли, процеси и FAQ.',
  },
  '/admin/executive': { sec: 'm-executive',
    uk: 'Сторінка тімліда/адміна — швидко зрозуміти хто тоне і кому треба допомогти.',
    en: 'Team-lead/admin view — quickly see who is drowning and who needs help.',
    bg: 'Изглед за тимлийд/администратор — кой се дави и на кого да помогнем.',
  },
  '/admin/action-center': { sec: 'm-action',
    uk: 'Системно згенеровані дії, які треба зробити просто зараз. Починайте день звідси.',
    en: 'System-generated work that needs to happen right now. Start the day here.',
    bg: 'Системно генерирани действия за веднага. Започвайте деня оттук.',
  },
  '/admin/notifications': { sec: 'm-notif',
    uk: 'Сповіщення в реальному часі: нові ліди, оплати, вебхуки, ескалації SLA.',
    en: 'Realtime notifications: new leads, payments, webhooks, SLA escalations.',
    bg: 'Известия в реално време: нови лийдове, плащания, webhook-и, SLA ескалации.',
  },
  '/admin/leads': { sec: 'm-leads',
    uk: 'Lead Workspace — канбан і таблиця лідів зі smart-фільтрами та bulk-діями.',
    en: 'Lead Workspace — Kanban + table view, smart filters, bulk actions.',
    bg: 'Lead Workspace — канбан + таблица, smart филтри и групови действия.',
  },
  '/admin/customers': { sec: 'm-customers',
    uk: 'Картка 360° клієнта: вся історія, дорожня карта, контракти, документи, тайм-лайн.',
    en: 'Customer 360° card: full history, roadmap, contracts, documents, timeline.',
    bg: 'Карта 360° на клиента: пълна история, пътна карта, договори, документи.',
  },
  '/admin/sales': { sec: 'm-sales',
    uk: 'Угоди, які дійшли до контракту й грошей: салдо, валюти, виплати.',
    en: 'Deals that reached contract + money: balances, currencies, payouts.',
    bg: 'Сделки, които стигнаха до договор и пари: салда, валути, плащания.',
  },
  '/admin/meetings': { sec: 'm-sales',
    uk: 'Календар зустрічей з клієнтами — очні та онлайн, з нагадуваннями.',
    en: 'Customer meeting calendar — in-person and online, with reminders.',
    bg: 'Календар на срещите с клиенти — на живо и онлайн, с напомняния.',
  },
  '/admin/customer-portal': { sec: 'm-portal',
    uk: 'Адмін-погляд на кабінет клієнта — корисно для розборів «чому клієнт нічого не бачить».',
    en: 'Admin view of the customer cabinet — handy when the customer says "I see nothing".',
    bg: 'Изглед на админ върху клиентския кабинет — за случаите „не виждам нищо“.',
  },
  '/admin/roadmaps': { sec: 'm-roadmaps',
    uk: 'Покрокові плани замовлень: купівля, документи, доставка, передача.',
    en: 'Step-by-step order plans: purchase, paperwork, shipping, hand-over.',
    bg: 'Стъпков план на поръчките: покупка, документи, доставка, предаване.',
  },
  '/admin/document-templates': { sec: 'm-docs',
    uk: 'Готові заготовки договорів і документів — PDF за 5 секунд.',
    en: 'Ready-made contract/document templates — PDF in 5 seconds.',
    bg: 'Готови шаблони на договори и документи — PDF за 5 секунди.',
  },
  '/admin/contracts': { sec: 'm-contracts',
    uk: 'Lifecycle договору: Чернетка → Надіслано → Підписано → Архів. Підпис онлайн.',
    en: 'Contract lifecycle: Draft → Sent → Signed → Archive. Online signing.',
    bg: 'Жизнен цикъл на договора: Чернова → Изпратен → Подписан → Архив.',
  },
  '/admin/finance': { sec: 'm-finance',
    uk: 'Фінанси, інвойси, депозити, Stripe-платежі та outstanding по клієнтах.',
    en: 'Finance: invoices, deposits, Stripe payments, customer outstanding.',
    bg: 'Финанси: фактури, депозити, Stripe плащания, дължими суми.',
  },
  '/admin/delivery': { sec: 'm-delivery',
    uk: 'Доставка 360: від аукціонного паркінгу до клієнта — ETA, CMR, GPS.',
    en: 'Delivery 360: from auction lot to customer — ETA, CMR, GPS tracking.',
    bg: 'Доставка 360: от аукционния паркинг до клиента — ETA, CMR, GPS.',
  },
  '/admin/operations': { sec: 'm-operations',
    uk: 'Операції 360 — вузькі місця компанії, навантаження команди, проблемні зони.',
    en: 'Operations 360 — bottlenecks, team load, trouble zones.',
    bg: 'Операции 360 — тесни места, натовареност на екипа, проблемни зони.',
  },
  '/admin/forecasting': { sec: 'm-forecasting',
    uk: 'Прогноз закриття угод і грошового потоку на місяць вперед.',
    en: 'Deal-closing and cash-flow forecast for the month ahead.',
    bg: 'Прогноза за затваряне на сделки и паричен поток за месеца напред.',
  },
  '/admin/calculator': { sec: 'm-calc',
    uk: 'Калькулятор пригону: VIN/лот → собівартість з усіма зборами для клієнта.',
    en: 'Import calculator: VIN/lot → landed cost with all fees for the customer.',
    bg: 'Калкулатор за внос: VIN/лот → крайна цена с всички такси за клиента.',
  },
  '/admin/parser': { sec: 'm-vin',
    uk: 'VIN Engine: ручна перевірка VIN і управління кешем шести парсерів.',
    en: 'VIN Engine: manual VIN test + cache control for the six parsers.',
    bg: 'VIN Engine: ръчна проверка на VIN и кеш на шестте парсера.',
  },
  '/admin/staff': { sec: 'm-staff',
    uk: 'Команда: додавання менеджерів, призначення ролей, статистика навантаження.',
    en: 'Staff directory: add managers, assign roles, see load and stats.',
    bg: 'Екип: добавяне на мениджъри, роли, натовареност и статистика.',
  },
  '/admin/team-dashboard': { sec: 'm-staff',
    uk: 'Особистий дашборд тімліда — ліди, задачі та KPI його команди.',
    en: "Team lead's personal dashboard — their team's leads, tasks, KPIs.",
    bg: 'Личен дашборд на тимлийда — лийдове, задачи и KPI на екипа му.',
  },
  '/admin/my-workspace': { sec: 'm-staff',
    uk: 'Мій простір — особиста сторінка менеджера: свої ліди, задачі, цілі.',
    en: 'My Workspace — manager personal page: own leads, tasks, goals.',
    bg: 'Моето пространство — лична страница на мениджъра: лийдове, задачи, цели.',
  },
  '/admin/integrations': { sec: 'integrations',
    uk: 'Налаштування Stripe, Resend, SMS, Ringostat, SMTP — всі ключі в одному місці.',
    en: 'Stripe, Resend, SMS, Ringostat, SMTP — all keys in one place.',
    bg: 'Stripe, Resend, SMS, Ringostat, SMTP — всички ключове на едно място.',
  },
  '/admin/login-audit': { sec: 'auth',
    uk: 'Login Audit — журнал входів: хто, коли, з якого IP.',
    en: 'Login audit — sign-in log: who, when, from which IP.',
    bg: 'Login Audit — журнал на влизанията: кой, кога, от кой IP.',
  },
  '/admin/manager-instructions': { sec: 'roles',
    uk: 'Інструкції адміна для менеджерів. Редагує лише адмін, читають усі.',
    en: 'Admin-authored instructions for managers. Edited by admin, read by all.',
    bg: 'Инструкции от админа за мениджърите. Редактира само админ, четат всички.',
  },
};

const SidebarTooltip = ({ path, lang, children }) => {
  // Find tooltip data — exact match first, then strip query/hash to find prefix match
  const norm = (path || '').split('?')[0].split('#')[0];
  const tip = SIDEBAR_TIPS[norm];
  if (!tip) return children;
  const safeLang = ['uk', 'en', 'bg'].includes(lang) ? lang : 'uk';
  const txt = tip[safeLang] || tip.uk;
  const openLabel = ({ uk: 'Відкрити в гайді →', en: 'Open in guide →', bg: 'Отвори в ръководството →' })[safeLang];
  return (
    <span className="relative group block">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none group-hover:pointer-events-auto absolute left-full top-1/2 -translate-y-1/2 ml-2 w-72 z-50 opacity-0 group-hover:opacity-100 transition-opacity duration-150 hidden lg:block"
        data-testid={`tip-${norm}`}
      >
        <span className="block rounded-xl bg-[#18181B] text-white shadow-xl px-3 py-2.5 text-[12px] leading-relaxed">
          <span className="block mb-1.5">{txt}</span>
          <a
            href={`/admin/guide#${tip.sec}`}
            className="inline-block text-[11px] font-semibold text-[#A5B4FC] hover:text-white underline underline-offset-2"
          >
            {openLabel}
          </a>
        </span>
      </span>
    </span>
  );
};


const Layout = () => {
  const { user, logout, token } = useAuth();
  const { prefs: ringostatPrefs, role: ringostatRole, loading: loadingPrefs } = useRingostatPrefs();
  const { t, lang, changeLang, languages } = useLang();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Mobile menu state
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // Language dropdown state
  const [isLangDropdownOpen, setIsLangDropdownOpen] = useState(false);
  const langDropdownRef = useRef(null);
  
  // Mobile search state
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [automationExceptionsCount, setAutomationExceptionsCount] = useState(0);
  
  // Track expanded sections - all collapsed by default
  const [expandedSections, setExpandedSections] = useState({
    crm: false,
    finance: false,
    auto: false,
    team: false,
    teamWorkspace: false,
    managerWorkspace: false,
    control: false,
    settings: false,
    marketing: false
  });

  // Auto-expand the sidebar group that contains the active route, so the
  // highlighted child is always visible when the user navigates directly
  // to a deep URL (e.g. /admin/legal?tab=deal_pipeline → expand CRM).
  // This only OPENS groups; it never closes a manually-expanded one.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const urlTab = new URLSearchParams(location.search).get('tab');
    const targets = {};
    for (const g of navGroups || []) {
      if (g.type !== 'group' || !Array.isArray(g.items)) continue;
      const hit = g.items.some((it) => {
        const [basePath, q] = (it.path || '').split('?');
        if (basePath !== location.pathname) {
          if (it.matchPrefix && location.pathname.startsWith(basePath + '/')) {
            // matchPrefix items only own the prefix, not the tab — count it.
            return true;
          }
          return false;
        }
        // pathname matches; if either side has no tab spec, consider it a hit
        // when the URL also has no tab; otherwise require an exact tab match.
        const itTab = q ? new URLSearchParams(q).get('tab') : null;
        if (!itTab) return true; // "main" items always match the bare pathname
        return itTab === urlTab;
      });
      if (hit) targets[g.id] = true;
    }
    if (Object.keys(targets).length > 0) {
      setExpandedSections((prev) => ({ ...prev, ...targets }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // Close mobile menu on escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        setIsMobileMenuOpen(false);
        setIsLangDropdownOpen(false);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  // Close language dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (langDropdownRef.current && !langDropdownRef.current.contains(e.target)) {
        setIsLangDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Global search index is built dynamically from `navGroups` further below
  // (after `visibleGroups` is computed) so it always covers EVERY section the
  // current user can reach — see `searchIndex` / `filteredSearchItems`.

  const handleSearchSelect = (path) => {
    navigate(resolveSearchPath(path));
    setSearchQuery('');
    setIsMobileSearchOpen(false);
  };

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isMobileMenuOpen]);

  // Phase E badge — poll pending resolver/transfer exceptions every 30 s.
  useEffect(() => {
    if (!user || !['master_admin', 'admin'].includes(user?.role)) return;
    let cancelled = false;
    const API = process.env.REACT_APP_BACKEND_URL || '';
    const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
    if (!token) return;
    const load = () => {
      fetch(`${API}/api/admin/identity/exceptions/count`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (d && !cancelled) setAutomationExceptionsCount(d.pending || 0); })
        .catch(() => {});
    };
    load();
    const timer = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [user]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // Check if any item in section is active (uses smart resolver below)
  const isSectionActive = (items) => {
    return items.some(item => isItemActive(item.path));
  };

  // Navigation structure with groups - using translations
  // Roles: master_admin (admin), team_lead, manager
  const navGroups = [
    {
      id: 'dashboard',
      type: 'single',
      item: { path: '/admin', icon: ChartPieSlice, labelKey: 'dashboard' },
      roles: ['master_admin', 'admin', 'team_lead', 'manager']
    },
    {
      // Внутрішній гайд по CRM — повна біла книга для нових співробітників.
      // На цьому етапі написано лише українською; інші мови додамо пізніше.
      id: 'guide',
      type: 'single',
      item: { path: '/admin/guide', icon: BookOpenText, labelKey: 'guideTitle' },
      roles: ['master_admin', 'admin', 'team_lead', 'manager']
    },
    {
      // Wave 16 — Executive Center. Owner-level governance lens that mounts
      // ABOVE every operational 360 (Ops / Forecast / Contract / Finance / Delivery).
      // Five tabs: dashboard / forecast / bottlenecks / risks / team.
      id: 'executive',
      type: 'single',
      item: { path: '/admin/executive', icon: Crown, labelKey: 'w16_title' },
      roles: ['master_admin', 'admin']
    },
    {
      // Wave 17 — Action Center. Execution layer on top of every risk/bottleneck
      // surfaced by Ops360 / Forecast360 / Contract360 / Delivery360.
      // Inbox / My Actions / Team / Analytics.
      id: 'actions',
      type: 'single',
      item: { path: '/admin/actions', icon: Lightning, labelKey: 'w17_title' },
      roles: ['master_admin', 'admin', 'team_lead', 'manager']
    },
    {
      // Wave 18 — Communication & Notification Center. First delivery channel
      // layer driven by the Action lifecycle (Wave 17). Inbox / Preferences /
      // Analytics / SLA Engine (Wave 18.1) — auto-escalates overdue actions
      // 24h → owner, 72h → team_lead, 7d → admin.
      id: 'notifications-center',
      type: 'single',
      item: { path: '/admin/notifications-center', icon: Bell, labelKey: 'w18_title' },
      roles: ['master_admin', 'admin', 'team_lead', 'manager']
    },
    {
      id: 'crm',
      type: 'group',
      labelKey: 'crm',
      icon: UsersThree,
      items: [
        { path: '/admin/leads', icon: UserPlus, labelKey: 'leads' },
        // Tasks #4/#5 — the standalone "Customers" page was removed (all client
        // work happens inside a lead → full Customer 360 card). Its CRM slot is
        // replaced by "Deposits": every lead that left a deposit, in a
        // Sales-style list.
        { path: '/admin/lead-deposits', icon: Wallet, labelKey: 'crmDeposits_nav' },
        // Phase Final / Block 2 — Sales entity (sold vehicles, USA/Korea/Other).
        { path: '/admin/sales', icon: Banknote, labelKey: 'sales_nav' },
        // Phase Final / Block 3 — Meetings + Calendar (.ics export).
        { path: '/admin/meetings', icon: CalendarCheck, labelKey: 'meetings_nav' },
        // Wave 19 — Customer Portal View. Cross-cutting read-only screen
        // (manager / team_lead / admin) that answers "what is the customer
        // currently seeing about their order?" via 5 read-only blocks:
        // My Car · Delivery Timeline · Documents · Payments · Notifications.
        { path: '/admin/customer-portal', icon: Storefront, labelKey: 'cp_portal_title' },
        // Sprint 3.5 — Customer Roadmaps. Company-wide vehicle journey
        // dashboard (auction → handover) with SLA breach surfacing for
        // Team Lead / Master Admin.
        { path: '/admin/roadmaps', icon: Compass, labelKey: 'roadmaps_nav' },
        // Mini Sprint Contracts Final — Document Templates editor.
        // Master-admin can edit the Jinja2/HTML templates that the PDF
        // Engine uses to generate contracts / invoices / acceptance acts.
        { path: '/admin/document-templates', icon: FileText, labelKey: 'doctpl_nav' },
        // "Deals" removed — it was a `?tab=deal_pipeline` shortcut to Legal Workflow.
        // Legal Workflow page now serves as the single entry; Deal Pipeline lives
        // as the second horizontal tab within it.
      ],
      roles: ['master_admin', 'admin', 'team_lead', 'manager']
    },
    {
      // Wave 14 — Operations 360. CEO/Owner-grade overview that sits ABOVE
      // every other 360 (Lead/Customer/Deal/Finance/Delivery). Lives at the
      // very top of the sidebar so the owner lands on it first thing every
      // morning.
      id: 'operations',
      type: 'single',
      item: { path: '/admin/operations', icon: Lightning, labelKey: 'w14_title' },
      roles: ['master_admin', 'admin', 'team_lead', 'manager']
    },
    {
      // Wave 12C — Forecasting 360. Deterministic forecaster (no AI/ML):
      // revenue weighted by stage probability, cash flow projection,
      // pipeline buckets, capacity load and forecast risk.
      id: 'forecast',
      type: 'single',
      item: { path: '/admin/forecast', icon: ChartLineUp, labelKey: 'w12c_title' },
      roles: ['master_admin', 'admin', 'team_lead', 'manager']
    },
    {
      // Wave 15 — Contract 360. Contract Lifecycle Management — templates,
      // approval flow (manager → team_lead → admin → customer), signatures,
      // amendments, attachments, contract health scorer (8 segments).
      id: 'contracts',
      type: 'single',
      item: { path: '/admin/contracts', icon: FileText, labelKey: 'w15_title' },
      roles: ['master_admin', 'admin', 'team_lead', 'manager']
    },
    {
      id: 'finance',
      type: 'group',
      labelKey: 'finance',
      icon: Wallet,
      items: [
        // Wave 12A — Finance 360. Operational money control center
        // (Overview / Transactions journal / Outstanding). Scope-aware:
        // admin = company-wide, team_lead = team, manager = own deals.
        { path: '/admin/finance', icon: ChartLine, labelKey: 'w12a_title' },
        // Finance — единая точка входа в финансовый workflow:
        //   Legal Workflow → 6 горизонтальных табов (Customer Legal · Deal Pipeline ·
        //   Deposit · Contract · Financials & Payments · Calculations).
        // Documents и Payment Analytics вынесены в Analytics & Insights, чтобы
        // в этом разделе не было дубликатов с тем, что уже доступно как вкладки
        // внутри Legal Workflow.
        { path: '/admin/legal', icon: Scales, labelKey: 'legalWorkflow' },
        { path: '/admin/invoice-reminders', icon: PhoneCall, labelKey: 'invoiceReminders', roles: ['master_admin', 'admin', 'team_lead'] },
      ],
      roles: ['master_admin', 'admin', 'team_lead', 'manager']
    },
    {
      // Wave 13 — Delivery 360. "Where is the car?" control plane:
      // milestones, carrier center, ETA engine, delivery documents.
      id: 'delivery',
      type: 'single',
      item: { path: '/admin/delivery', icon: Truck, labelKey: 'w13_title' },
      roles: ['master_admin', 'admin', 'team_lead', 'manager']
    },
    {
      // Calculator — flat single item (was: nested under "Авто" group along with
      // Parser Sources Control, Vehicle DB, Quote Analytics — all of those
      // were removed because Parser tooling already lives under /admin/parser*
      // and is not a duplicate of "Auto" tab).
      id: 'calculator',
      type: 'single',
      item: { path: '/admin/calculator', icon: Percent, labelKey: 'calculatorAdmin' },
      roles: ['master_admin', 'moderator', 'admin', 'team_lead', 'manager']
    },
    {
      id: 'team',
      type: 'group',
      labelKey: 'staffSection',
      icon: UsersFour,
      items: [
        { path: '/admin/team-lead', icon: Shield, labelKey: 'teamLeadPanel', roles: ['team_lead'] },
        { path: '/admin/staff', icon: Users, labelKey: 'staff' },
        { path: '/admin/tasks', icon: ListChecks, labelKey: 'tasks' },
        // Block 7.3 — Manager Instructions (admin editor + read-only for staff)
        { path: '/admin/manager-instructions', icon: FileText, label: 'Manager Instructions', roles: ['master_admin', 'admin'] },
        { path: '/admin/manager-instructions/view', icon: FileText, label: 'Manager Instructions', roles: ['team_lead', 'manager'] },
        // Wave 7.5 — Login Audit moved here from "Settings": it's a staff-
        // management tool (who logged in / when / from where / how), not
        // a configuration knob. Lives with Staff + Tasks where you actually
        // manage people.
        { path: '/admin/login-audit', icon: Shield, label: 'Login Audit', roles: ['master_admin', 'admin'] },
      ],
      roles: ['master_admin', 'admin', 'team_lead', 'manager']
    },
    {
      id: 'teamWorkspace',
      type: 'single',
      // Sub-pages (Manager Load Board, Team Leads, Team Tasks, Payments Watch,
      // Team Orders, Shipping Watch, Alerts Feed, Reassignments, Team Performance)
      // are reachable from inside Team Dashboard — no need to clutter the sidebar
      // with the same links. Each sub-page has a Back-to-Dashboard button.
      item: { path: '/team/dashboard', icon: Kanban, labelKey: 'teamDashboard', matchPrefix: true },
      roles: ['master_admin', 'admin', 'team_lead']
    },
    {
      id: 'managerWorkspace',
      type: 'single',
      // Sub-pages (My Tasks, My Invoices, My Orders, My Shipments, My Calls) are
      // reachable from inside the Manager Workspace dashboard. Each sub-page has
      // a Back-to-Workspace button.
      item: { path: '/manager', icon: User, labelKey: 'myWorkspace', matchPrefix: true },
      roles: ['master_admin', 'admin', 'team_lead', 'manager']
    },
    {
      // Wave-8 — User Engagement folded into /admin/insights → Traffic & Engagement tab.
      // The standalone entry is removed; we keep the route alias above for old bookmarks.
      // Old top-level item removed (was here in Wave 7.5).
      id: 'userEngagement',
      type: 'single',
      item: { path: '/admin/insights?tab=traffic', icon: Heart, labelKey: 'userEngagement' },
      roles: []  // hidden — accessible inside Insights → Traffic tab
    },
    {
      // «Top Deals Builder» — основная рабочая страница менеджера для
      // подборок. У тимлида/админа есть та же логика прямо внутри
      // «Top Deals Approvals» (кнопка «+ Create Top Deal»), поэтому
      // отдельный пункт меню им НЕ нужен, чтобы не плодить дубли.
      id: 'managerWishlist',
      type: 'single',
      item: { path: '/manager/wishlist', icon: Fire, labelKey: 'topDealsBuilder' },
      roles: ['master_admin', 'manager']
    },
    {
      // Team-lead approval queue for the wishlist cards above.
      // Only team_lead + admin see this entry.
      id: 'teamWishlistApprovals',
      type: 'single',
      item: { path: '/team/wishlist-approvals', icon: Lightning, labelKey: 'topDealsApprovals' },
      roles: ['master_admin', 'admin', 'team_lead']
    },
    {
      // CarFax — cross-cutting staff capability. One entry per role, each
      // pointing at the role's own working route (same management page +
      // per-customer attach via Customer 360). Backend RBAC already permits
      // admin / team_lead / manager (require_manager_or_admin).
      id: 'carfaxAdmin',
      type: 'single',
      item: { path: '/admin/carfax', icon: FileText, labelKey: 'adm_carfax' },
      roles: ['master_admin', 'admin']
    },
    {
      id: 'carfaxTeam',
      type: 'single',
      item: { path: '/team/carfax', icon: FileText, labelKey: 'adm_carfax' },
      roles: ['team_lead']
    },
    {
      id: 'carfaxManager',
      type: 'single',
      item: { path: '/manager/carfax', icon: FileText, labelKey: 'adm_carfax' },
      roles: ['manager']
    },
    {
      id: 'control',
      type: 'single',
      // Control is a hub. The page itself renders a horizontal sub-nav at
      // the top with all 5 sections (Business Metrics · Provider Pressure ·
      // Routing Rules · Cadences · Score Rules) — no need to duplicate them
      // in the sidebar dropdown. The sidebar entry points to the first
      // Control page and `matchPrefix` keeps it highlighted on every
      // Control sub-page.
      item: {
        path: '/admin/business-metrics',
        icon: Lightning,
        labelKey: 'control',
        // also match all Control sub-routes so the entry stays highlighted
        extraMatch: [
          '/admin/provider-health',
          '/admin/routing-rules',
          '/admin/cadences',
          '/admin/score-rules',
        ],
      },
      roles: ['master_admin', 'admin'],
    },
    {
      id: 'settings',
      type: 'group',
      labelKey: 'settings',
      icon: Sliders,
      items: [
        { path: '/admin/payments', icon: CreditCard, label: t('i18n_payments_stripe_c21776'), roles: ['master_admin', 'admin'] },
        { path: '/admin/services', icon: Stack, label: t('i18n_services_catalog_16a322'), roles: ['master_admin', 'admin'] },
        { path: '/admin/settings/notifications', icon: Bell, label: t('hub_sidebar_label'), roles: ['master_admin', 'admin'] },
        // Tracking-hub items moved to top-level `/admin/tracking` (see TrackingLayout.jsx)
        { path: '/admin/ringostat', icon: Phone, labelKey: 'ringostat', roles: ['master_admin', 'admin'] },
        {
          // Unified Tracking hub (VesselFinder · Shipment journey ·
          // Shipment/Automation exceptions · HMAC ext-clients).
          // Nested routes live under /admin/tracking/* — see TrackingLayout.jsx.
          path: '/admin/tracking',
          icon: Anchor,
          label: t('i18n_tracking_f7f54d'),
          badge: 'automationExceptions',
          matchPrefix: true,
          roles: ['master_admin', 'admin'],
        },
        { path: '/admin/parser', icon: Database, label: t('i18n_vin_parser_4ae3fa') },
        { path: '/admin/security', icon: Shield, label: 'Security & 2FA', roles: ['master_admin', 'admin'] },
        // Login Audit moved to Staff group (Wave 7.5) — it's staff management,
        // not configuration. See team group above.
        // Unified System hub: combines old "System" + "Auth & URLs" + "Email outbox"
        { path: '/admin/settings', icon: Wrench, label: 'System', matchPrefix: true, roles: ['master_admin', 'admin'] },
        { path: '/admin/system-settings', icon: Globe, labelKey: 'siteIntegrationsNav', roles: ['master_admin', 'admin'] },
        { path: '/admin/seo-settings',    icon: MagnifyingGlass, label: t('seoSettings') || 'SEO & Analytics', roles: ['master_admin'] },
        // Site-tracker snippet is now embedded into the System page
        // (Block "Інтеграційні посилання" → "Скрипт для сайту"). The legacy
        // standalone /admin/site-tracker route still exists for direct URL
        // access, but is no longer surfaced in the navigation — same pattern
        // as Stripe keys / SMTP secrets.
        // Wave-8.4 — Workers Health migrated into the System hub as a tab.
        // Legacy link removed (route still redirects → /admin/settings?tab=workers).
        { path: '/admin/info', icon: FileText, label: 'Info' },
      ],
      roles: ['master_admin', 'moderator', 'admin']
    },
    {
      // Wave-8 — Insights Hub.
      // Replaces the legacy "Analytics & Insights" group (8 sub-items):
      //   Analytics · Payment Analytics · Journey Funnel · Risk Dashboard ·
      //   Priority Alerts · Documents · Contracts Accounting · Intent Dashboard.
      // All of those are now horizontal sub-tabs INSIDE /admin/insights, with
      // role-aware scoping (admin → company, team_lead → team, manager → personal).
      // Old URLs still work via 301-style redirects in App.js routing.
      id: 'insights',
      type: 'single',
      item: {
        path: '/admin/insights',
        icon: ChartBar,
        labelKey: 'analyticsAndInsights',
        matchPrefix: true,
        // keep highlight when user lands on a legacy alias (before redirect kicks in)
        extraMatch: [
          '/admin/analytics',
          '/admin/owner-dashboard',
          '/admin/journey',
          '/admin/risk',
          '/admin/escalations',
          '/admin/documents',
          '/admin/contracts/accounting',
          '/admin/intent',
          '/admin/engagement',
        ],
      },
      roles: ['master_admin', 'moderator', 'admin', 'team_lead', 'manager']
    }
  ];

  // Helper function to check if user has required role
  // Treats "admin" as equivalent to "master_admin" (backend MASTER_ROLES)
  const userHasRole = (requiredRoles) => {
    if (!requiredRoles || requiredRoles.length === 0) return true;
    const userRole = user?.role;
    if (!userRole) return false;
    
    // Direct match
    if (requiredRoles.includes(userRole)) return true;
    
    // "admin" can access "master_admin" items (backend MASTER_ROLES parity)
    if (userRole === 'admin' && requiredRoles.includes('master_admin')) return true;
    
    return false;
  };

  // Filter groups based on user role
  const visibleGroups = navGroups.filter(group => {
    if (!group.roles) return true;
    return userHasRole(group.roles);
  });

  // ─────────────────────────────────────────────────────────────────────
  //  GLOBAL COMMAND SEARCH
  //
  //  Built dynamically from `visibleGroups` so the dropdown ALWAYS reflects
  //  every section the current user can actually open (role-aware paths
  //  included — admin/team_lead/manager get their own routes). Each entry is
  //  enriched with a multilingual alias bank (EN / RU / UK / BG) so an
  //  operator can type "customers", "клиенты", "продажи", "carfax", "sales",
  //  "customer 360", etc. and still land on the right page.
  // ─────────────────────────────────────────────────────────────────────
  const SEARCH_ALIASES = {
    // by labelKey
    dashboard: ['dashboard', 'control panel', 'home', 'панель', 'главная', 'головна', 'табло', 'tablo'],
    guideTitle: ['guide', 'crm guide', 'help', 'гайд', 'инструкция', 'довідка', 'помощь', 'допомога'],
    w16_title: ['executive', 'executive center', 'руководитель', 'owner', 'керівник'],
    w17_title: ['action center', 'actions', 'inbox', 'действия', 'дії', 'задачи'],
    w18_title: ['notifications', 'notification center', 'communication', 'уведомления', 'сповіщення', 'известия'],
    leads: ['leads', 'lead', 'customers', 'customer', 'customer 360', 'customers 360', 'client', 'clients', 'crm', 'клиенты', 'клиент', 'клиента', 'клієнти', 'клієнт', 'контакты', 'контакти', 'лиды', 'ліди'],
    crmDeposits_nav: ['deposits', 'deposit', 'депозиты', 'депозит', 'депозити'],
    sales_nav: ['sales', 'sale', 'sold', 'продажи', 'продажа', 'продажі', 'продаж', 'проданные'],
    meetings_nav: ['meetings', 'meeting', 'calendar', 'встречи', 'встреча', 'зустрічі', 'календарь', 'календар'],
    cp_portal_title: ['customer portal', 'customer 360', 'customer view', 'portal', 'портал', 'клиент 360', 'кабинет клиента', 'кабінет клієнта'],
    roadmaps_nav: ['roadmaps', 'roadmap', 'journey', 'маршрут', 'дорожная карта', 'дорожня карта', 'путь клиента'],
    doctpl_nav: ['document templates', 'templates', 'шаблоны', 'шаблони', 'документы', 'документи'],
    w14_title: ['operations', 'operations 360', 'ops', 'операции', 'операції'],
    w12c_title: ['forecast', 'forecasting', 'forecasting 360', 'прогноз', 'прогнозирование', 'прогнозування'],
    w15_title: ['contracts', 'contract 360', 'contract', 'договоры', 'договори', 'контракты', 'контракти'],
    w12a_title: ['finance', 'finance 360', 'money', 'cash', 'финансы', 'фінанси', 'деньги'],
    legalWorkflow: ['legal', 'legal workflow', 'contract', 'deposit', 'egn', 'юридический', 'юридичний', 'правовой'],
    invoiceReminders: ['invoice reminders', 'invoices', 'reminders', 'счета', 'рахунки', 'напоминания'],
    w13_title: ['delivery', 'delivery 360', 'shipment', 'shipping', 'logistics', 'доставка', 'логистика', 'логістика', 'перевозка'],
    calculatorAdmin: ['calculator', 'calc', 'калькулятор', 'розрахунок', 'расчет'],
    staffSection: ['staff', 'team', 'personnel', 'персонал', 'команда', 'сотрудники', 'співробітники'],
    teamLeadPanel: ['team lead', 'teamlead', 'тимлид', 'тімлід', 'руководитель команды'],
    staff: ['staff', 'employees', 'персонал', 'сотрудники', 'працівники'],
    tasks: ['tasks', 'task', 'todo', 'задачи', 'завдання', 'задачі'],
    adm_carfax: ['carfax', 'car fax', 'карфакс', 'vin report', 'vehicle history', 'история авто', 'історія авто', 'отчет carfax'],
    analyticsAndInsights: ['analytics', 'insights', 'reports', 'statistics', 'аналитика', 'аналітика', 'отчеты', 'звіти', 'статистика'],
    control: ['control', 'business metrics', 'контроль', 'метрики', 'control panel'],
    settings: ['settings', 'config', 'configuration', 'настройки', 'налаштування', 'система', 'параметры'],
    teamDashboard: ['team dashboard', 'team', 'тимлид', 'команда', 'панель команды'],
    myWorkspace: ['my workspace', 'workspace', 'рабочее место', 'моё пространство', 'робоче місце'],
    topDealsBuilder: ['top deals', 'top deals builder', 'wishlist', 'подборки', 'топ сделки', 'топ пропозиції'],
    topDealsApprovals: ['top deals approvals', 'approvals', 'одобрения', 'затвердження'],
    userEngagement: ['engagement', 'traffic', 'вовлеченность', 'залученість', 'трафик'],
    siteIntegrationsNav: ['integrations', 'site integrations', 'интеграции', 'інтеграції'],
    ringostat: ['ringostat', 'calls', 'telephony', 'звонки', 'дзвінки', 'телефония'],
    hub_sidebar_label: ['notifications', 'notification settings', 'уведомления', 'сповіщення'],
    // by path (for items defined with a literal `label`)
    '/admin/payments': ['payments', 'stripe', 'платежи', 'оплата', 'платіжі'],
    '/admin/services': ['services', 'catalog', 'услуги', 'сервисы', 'послуги'],
    '/admin/tracking': ['tracking', 'vessel', 'vesselfinder', 'shipment tracking', 'отслеживание', 'відстеження'],
    '/admin/parser': ['parser', 'vin parser', 'парсер', 'vin'],
    '/admin/security': ['security', '2fa', 'безопасность', 'безпека', 'защита'],
    '/admin/settings': ['system', 'settings', 'система', 'настройки', 'налаштування'],
    '/admin/seo-settings': ['seo', 'analytics', 'сео', 'мета теги'],
    '/admin/manager-instructions': ['manager instructions', 'instructions', 'инструкции', 'інструкції'],
    '/admin/manager-instructions/view': ['manager instructions', 'instructions', 'инструкции', 'інструкції'],
    '/admin/login-audit': ['login audit', 'audit', 'аудит', 'аудит входов', 'логи входа'],
    '/admin/info': ['info', 'information', 'информация', 'інформація', 'about'],
  };

  const searchIndex = React.useMemo(() => {
    const out = [];
    const seen = new Set();
    const addEntry = (path, label, keywords, groupLabel) => {
      if (!path || !label || seen.has(path)) return;
      seen.add(path);
      const lastSeg = (path.split('?')[0].split('/').filter(Boolean).pop() || '').replace(/-/g, ' ');
      out.push({ path, label, group: groupLabel || null, keywords: [...new Set([...(keywords || []), lastSeg].filter(Boolean))] });
    };
    const role = (user?.role || '').toLowerCase();
    const lbl = (key, fallback) => (key ? (t(key) || fallback) : fallback);

    // ── Team Lead cabinet — pages live under /team/* (NOT /admin/*). ──
    if (role === 'team_lead') {
      [
        ['/team/dashboard', lbl('teamDashboard', 'Team Dashboard'), ['dashboard', 'team dashboard', 'панель', 'табло', 'команда', 'главная', 'головна']],
        ['/team/managers', 'Managers', ['managers', 'manager', 'load board', 'менеджеры', 'менеджери', 'загрузка']],
        ['/team/leads', lbl('leads', 'Leads'), [...(SEARCH_ALIASES.leads || [])]],
        ['/team/reassignments', 'Reassignments', ['reassignments', 'reassign', 'передачи', 'переназначение', 'перепризначення']],
        ['/team/tasks', lbl('tasks', 'Tasks'), [...(SEARCH_ALIASES.tasks || [])]],
        ['/team/payments', 'Payments', ['payments', 'payment', 'платежи', 'оплата', 'платіжі']],
        ['/team/shipping', 'Shipping', ['shipping', 'delivery', 'доставка', 'перевозка', 'логистика', 'логістика']],
        ['/team/alerts', 'Alerts', ['alerts', 'alert', 'уведомления', 'тревоги', 'сповіщення', 'оповіщення']],
        ['/team/performance', 'Performance', ['performance', 'kpi', 'эффективность', 'продуктивність', 'показатели']],
        ['/team/orders', 'Orders', ['orders', 'order', 'заказы', 'замовлення', 'заявки']],
        ['/team/wishlist-approvals', lbl('topDealsApprovals', 'Top Deals Approvals'), ['top deals', 'approvals', 'одобрения', 'затвердження', 'подборки']],
        ['/team/login-audit', 'Login Audit', ['login audit', 'audit', 'аудит', 'логи входа']],
        ['/team/carfax', lbl('adm_carfax', 'CarFax'), [...(SEARCH_ALIASES.adm_carfax || [])]],
        ['/team/profile/password', 'Change Password', ['password', 'change password', 'пароль', 'смена пароля', 'зміна пароля']],
      ].forEach(([p, l, k]) => addEntry(p, l, k, null));
      return out;
    }

    // ── Manager cabinet — pages live under /manager/*. ──
    if (role === 'manager') {
      [
        ['/manager', lbl('myWorkspace', 'My Workspace'), ['workspace', 'my workspace', 'dashboard', 'рабочее место', 'робоче місце', 'панель', 'главная']],
        ['/manager/calls', 'Calls', ['calls', 'call', 'звонки', 'дзвінки', 'телефония', 'телефонія']],
        ['/manager/calls/missed', 'Missed Calls', ['missed calls', 'missed', 'пропущенные', 'пропущені']],
        ['/manager/tasks', lbl('tasks', 'Tasks'), [...(SEARCH_ALIASES.tasks || [])]],
        ['/manager/invoices', 'Invoices', ['invoices', 'invoice', 'счета', 'рахунки', 'инвойсы']],
        ['/manager/orders', 'Orders', ['orders', 'order', 'заказы', 'замовлення', 'заявки']],
        ['/manager/shipments', 'Shipments', ['shipments', 'shipment', 'delivery', 'доставка', 'перевозка', 'отгрузки']],
        ['/manager/tracking', 'Tracking', ['tracking', 'отслеживание', 'відстеження', 'трекинг']],
        ['/manager/engagement', lbl('userEngagement', 'Engagement'), ['engagement', 'traffic', 'вовлеченность', 'залученість']],
        ['/manager/wishlist', lbl('topDealsBuilder', 'Top Deals Builder'), ['top deals', 'wishlist', 'подборки', 'топ сделки', 'топ пропозиції']],
        ['/manager/carfax', lbl('adm_carfax', 'CarFax'), [...(SEARCH_ALIASES.adm_carfax || [])]],
        ['/manager/profile/password', 'Change Password', ['password', 'change password', 'пароль', 'смена пароля', 'зміна пароля']],
      ].forEach(([p, l, k]) => addEntry(p, l, k, null));
      return out;
    }

    // ── Admin / master_admin / moderator → derive from the full sidebar nav. ──
    const push = (path, label, labelKey, groupLabel) => {
      if (!path || !label || seen.has(path)) return;
      seen.add(path);
      const aliasByKey = labelKey ? (SEARCH_ALIASES[labelKey] || []) : [];
      const aliasByPath = SEARCH_ALIASES[path] || [];
      const lastSeg = (path.split('?')[0].split('/').filter(Boolean).pop() || '').replace(/-/g, ' ');
      out.push({ path, label, group: groupLabel || null, keywords: [...new Set([...aliasByKey, ...aliasByPath, lastSeg].filter(Boolean))] });
    };
    for (const g of visibleGroups) {
      if (g.type === 'single' && g.item) {
        const l = g.item.labelKey ? t(g.item.labelKey) : g.item.label;
        push(g.item.path, l, g.item.labelKey, null);
      }
      if (g.type === 'group' && Array.isArray(g.items)) {
        const groupLbl = g.labelKey ? t(g.labelKey) : g.label;
        const firstVisible = g.items.find(it => !it.roles || userHasRole(it.roles));
        if (firstVisible) push(`grp:${g.id}|${firstVisible.path}`, groupLbl, g.labelKey, null);
        for (const it of g.items) {
          if (it.roles && !userHasRole(it.roles)) continue;
          const l = it.labelKey ? t(it.labelKey) : it.label;
          push(it.path, l, it.labelKey, groupLbl);
        }
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role, t]);

  const filteredSearchItems = React.useMemo(() => {
    const raw = (searchQuery || '').trim().toLowerCase();
    if (!raw) return [];
    const tokens = raw.split(/\s+/).filter(Boolean);
    const scored = [];
    for (const entry of searchIndex) {
      const label = (entry.label || '').toLowerCase();
      const kw = entry.keywords.map(k => (k || '').toLowerCase());
      const hay = `${label} ${kw.join(' ')} ${entry.path.toLowerCase()} ${(entry.group || '').toLowerCase()}`;
      // every typed token must appear somewhere (AND match)
      if (!tokens.every(tk => hay.includes(tk))) continue;
      let score = 0;
      if (label === raw) score += 100;
      else if (label.startsWith(raw)) score += 60;
      else if (label.includes(raw)) score += 35;
      if (kw.some(k => k === raw)) score += 50;
      else if (kw.some(k => k.startsWith(raw))) score += 20;
      else if (kw.some(k => k.includes(raw))) score += 10;
      scored.push({ ...entry, score });
    }
    scored.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
    return scored.slice(0, 12);
  }, [searchQuery, searchIndex]);

  // Resolve a search-result path (group headers are encoded as `grp:id|path`).
  const resolveSearchPath = (path) => (path && path.startsWith('grp:') ? path.split('|')[1] : path);



  // ─────────────────────────────────────────────────────────────────────
  //  Smart sidebar active-state resolver
  //
  //  Multiple sidebar items can share the same pathname but differ in the
  //  `?tab=` query string (e.g. Deals → /admin/legal?tab=deal_pipeline,
  //  Deposits → /admin/legal?tab=deposit_v2, Legal Workflow → /admin/legal).
  //
  //  React-Router's NavLink only inspects pathname which would light up
  //  ALL THREE simultaneously — visually misleading. We pre-compute a
  //  single canonical `activePath` per render so exactly ONE item gets
  //  the .active class.
  //
  //  Resolution rules (deterministic):
  //   1. Collect every nav-item whose base pathname == current pathname.
  //   2. If exactly one candidate → it wins.
  //   3. If >1 candidates and one of them carries ?tab=X equal to the
  //      URL's ?tab=X → that one wins.
  //   4. Otherwise the "main" candidate (no ?tab= in its `to`) wins —
  //      this handles the case where the page rendered the default tab
  //      because no ?tab= was in the URL.
  // ─────────────────────────────────────────────────────────────────────
  const allNavPaths = React.useMemo(() => {
    const out = [];
    for (const g of visibleGroups) {
      if (g.type === 'single' && g.item) {
        out.push({ path: g.item.path, matchPrefix: !!g.item.matchPrefix });
        // `extraMatch` lets a single sidebar entry stay highlighted on a
        // set of sibling URLs (used by Control hub: one entry, 5 pages).
        // Each alias is recorded with the same canonical `path` so the
        // resolver picks the correct entry.
        if (Array.isArray(g.item.extraMatch)) {
          for (const alias of g.item.extraMatch) {
            out.push({ path: g.item.path, alias, matchPrefix: !!g.item.matchPrefix });
          }
        }
      }
      if (g.type === 'group' && Array.isArray(g.items)) {
        for (const it of g.items) {
          if (!it.roles || userHasRole(it.roles)) {
            out.push({ path: it.path, matchPrefix: !!it.matchPrefix });
          }
        }
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, user?.role]);

  const activePath = React.useMemo(() => {
    const urlTab = new URLSearchParams(location.search).get('tab');
    // Each candidate has a {path, matchPrefix, alias?} shape; we track
    // whether it's an EXACT match (basePath equals current pathname) or
    // a PREFIX match (startsWith basePath + '/'). Exact wins over prefix
    // always — otherwise a generic "/manager" workspace entry would steal
    // the highlight from a specific child like "/manager/engagement".
    const candidates = [];
    for (const item of allNavPaths) {
      const { path, alias, matchPrefix } = item;
      const target = alias || path;
      const basePath = target.split('?')[0];
      if (basePath === location.pathname) {
        candidates.push({ ...item, basePath, exact: true });
      } else if (matchPrefix && location.pathname.startsWith(basePath + '/')) {
        candidates.push({ ...item, basePath, exact: false });
      }
    }
    if (candidates.length === 0) return null;

    // Prefer EXACT matches over PREFIX matches.
    const exacts = candidates.filter((c) => c.exact);
    const pool = exacts.length > 0 ? exacts : candidates;

    if (pool.length === 1) return pool[0].path;

    // Multi-candidate → prefer the one whose ?tab= matches the URL's tab.
    const matchTab = pool.find(({ path }) => {
      const params = new URLSearchParams(path.split('?')[1] || '');
      return urlTab != null && params.get('tab') === urlTab;
    });
    if (matchTab) return matchTab.path;

    // Otherwise prefer the "main" candidate (no ?tab=)…
    const mainItem = pool.find(({ path }) => !path.includes('?tab='));
    if (mainItem) return mainItem.path;

    // …else just the longest basePath (most specific URL).
    pool.sort((a, b) => b.basePath.length - a.basePath.length);
    return pool[0].path;
  }, [allNavPaths, location.pathname, location.search]);

  const isItemActive = React.useCallback(
    (path) => path === activePath,
    [activePath],
  );

  const roleLabels = {
    master_admin: t('roleMasterAdmin'),
    admin: t('roleAdmin'),
    team_lead: t('roleTeamLead') || 'Team Lead',
    moderator: t('roleModerator'),
    manager: t('roleManager'),
    finance: t('roleFinance')
  };

  return (
    <div className="admin-layout flex h-screen bg-[#F7F7F8]">
      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
          data-testid="mobile-overlay"
        />
      )}

      {/* Sidebar - hidden on mobile (<768px), visible on md+ */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-[#E4E4E7]
        transform transition-transform duration-300 ease-out
        flex flex-col
        md:static md:translate-x-0 md:w-[260px] md:flex
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Logo */}
        <div className="p-4 md:p-5 border-b border-[#E4E4E7] flex items-center justify-between">
          <img 
            src="/images/logo.svg" 
            alt={t('logoLabel')} 
            className="h-8 md:h-10 w-auto"
          />
          {/* Close button for mobile */}
          <button
            className="md:hidden p-2 -mr-2 text-[#71717A] hover:text-[#18181B] transition-colors"
            onClick={() => setIsMobileMenuOpen(false)}
            data-testid="mobile-menu-close"
          >
            <X size={24} weight="bold" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-3 md:py-4 overflow-y-auto" data-testid="sidebar-nav">
          {visibleGroups.map((group) => {
            if (group.type === 'single') {
              // Single item (Dashboard / Tracking hub)
              const { path, icon: Icon, labelKey, label, badge, matchPrefix } = group.item;
              const displayLabel = label || t(labelKey);
              const showBadge = badge === 'automationExceptions' && automationExceptionsCount > 0;
              return (
                <SidebarTooltip key={group.id} path={path} lang={lang}>
                <NavLink
                  to={path}
                  end={!matchPrefix}
                  className={() =>
                    `sidebar-item min-h-[44px] ${isItemActive(path) ? 'active' : ''}`
                  }
                  data-testid={`nav-${labelKey || group.id}`}
                >
                  <Icon size={20} weight="duotone" />
                  <span style={{ flex: 1 }}>{displayLabel}</span>
                  {showBadge && (
                    <span
                      data-testid={`badge-${group.id}`}
                      style={{
                        background: '#f59e0b',
                        color: '#fff',
                        borderRadius: 999,
                        padding: '2px 8px',
                        fontSize: 11,
                        fontWeight: 700,
                        marginLeft: 6,
                      }}
                    >
                      {automationExceptionsCount}
                    </span>
                  )}
                </NavLink>
                </SidebarTooltip>
              );
            }

            // Group with items
            const isExpanded = expandedSections[group.id];
            const isActive = isSectionActive(group.items);
            const GroupIcon = group.icon;
            const groupLabel = group.label || t(group.labelKey);

            return (
              <div key={group.id} className="mb-1">
                {/* Group Header */}
                <button
                  onClick={() => toggleSection(group.id)}
                  className={`sidebar-group-header min-h-[44px] ${isActive ? 'active' : ''}`}
                  data-testid={`nav-group-${group.id}`}
                >
                  <div className="flex items-center gap-3">
                    <GroupIcon size={20} weight="duotone" />
                    <span>{groupLabel}</span>
                  </div>
                  {isExpanded ? <CaretUp size={14} /> : <CaretDown size={14} />}
                </button>

                {/* Group Items */}
                {isExpanded && (
                  <div className="sidebar-group-items">
                    {group.items
                      .filter(item => !item.roles || userHasRole(item.roles))
                      .map(({ path, icon: Icon, labelKey, label, badge }) => (
                      <NavLink
                        key={path}
                        to={path}
                        className={() =>
                          `sidebar-subitem min-h-[44px] ${isItemActive(path) ? 'active' : ''}`
                        }
                        data-testid={`nav-${labelKey || path.replace(/\//g, '-')}`}
                      >
                        <Icon size={16} weight="duotone" />
                        <span style={{ flex: 1 }}>{label || t(labelKey)}</span>
                        {badge === 'automationExceptions' && automationExceptionsCount > 0 && (
                          <span
                            data-testid="badge-automation-exceptions"
                            style={{
                              background: '#f59e0b',
                              color: '#fff',
                              borderRadius: 999,
                              padding: '2px 7px',
                              fontSize: 11,
                              fontWeight: 700,
                              marginLeft: 6,
                            }}
                          >
                            {automationExceptionsCount}
                          </span>
                        )}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="p-3 md:p-4 border-t border-[#E4E4E7]">
          <div className="text-xs text-[#A1A1AA] px-3 mb-2">{roleLabels[user?.role] || user?.role}</div>
          <NavLink
            to={
              (user?.role || '').toLowerCase() === 'manager'  ? '/manager/profile/password' :
              (user?.role || '').toLowerCase() === 'team_lead' ? '/team/profile/password'    :
                                                                  '/admin/profile/password'
            }
            className="w-full flex items-center gap-2 px-3 py-2.5 mb-1 text-sm font-medium text-[#52525B] hover:text-[#18181B] rounded-xl hover:bg-[#F4F4F5] transition-all"
            data-testid="change-password-link"
          >
            <LockKey size={18} weight="duotone" />
            <span>{t('adm_change_password')}</span>
          </NavLink>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-[#71717A] hover:text-[#DC2626] rounded-xl hover:bg-[#FEE2E2] transition-all"
            data-testid="logout-btn"
          >
            <SignOut size={18} weight="duotone" />
            <span>{t('logout')}</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden w-full">
        {/* Header */}
        <header className="relative z-30 h-14 md:h-16 bg-white border-b border-[#E4E4E7] flex items-center justify-between px-3 sm:px-4 md:px-8 gap-2">
          {/* Mobile Menu Button + Search */}
          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
            {/* Hamburger Menu Button */}
            <button
              className="md:hidden p-2 -ml-1 text-[#18181B] hover:bg-[#F4F4F5] rounded-lg transition-colors flex-shrink-0"
              onClick={() => setIsMobileMenuOpen(true)}
              data-testid="mobile-menu-toggle"
            >
              <List size={22} weight="bold" />
            </button>
            
            {/* Search - Desktop */}
            <div className="hidden md:block w-80 relative">
              <input 
                type="text" 
                placeholder={t('search')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input w-full"
                data-testid="search-input"
              />
              {searchQuery.trim() && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#E4E4E7] rounded-xl shadow-lg z-50 py-2 max-h-80 overflow-auto" data-testid="search-results">
                  {filteredSearchItems.length > 0 ? (
                    filteredSearchItems.map(item => (
                      <button
                        key={item.path}
                        onClick={() => handleSearchSelect(item.path)}
                        className="w-full text-left px-4 py-2.5 hover:bg-[#F4F4F5] transition-colors flex items-center justify-between gap-3"
                        data-testid="search-result-item"
                      >
                        <span className="text-sm font-medium text-[#18181B] truncate">{item.label}</span>
                        {item.group && (
                          <span className="text-[11px] text-[#A1A1AA] shrink-0 px-1.5 py-0.5 bg-[#F4F4F5] rounded">{item.group}</span>
                        )}
                      </button>
                    ))
                  ) : (
                    <div className="px-4 py-3 text-sm text-[#A1A1AA]" data-testid="search-no-results">
                      {t('searchNoResults') || 'Nothing found'}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-1 sm:gap-2 md:gap-3 flex-shrink-0">
            {/* Mobile Search Button */}
            <button 
              className="md:hidden p-2 text-[#71717A] hover:text-[#18181B] hover:bg-[#F4F4F5] rounded-lg transition-colors flex-shrink-0"
              onClick={() => setIsMobileSearchOpen(!isMobileSearchOpen)}
              data-testid="mobile-search-btn"
            >
              <MagnifyingGlass size={20} weight="bold" />
            </button>
            
            {/* Language Switcher Dropdown */}
            <div className="relative flex-shrink-0" ref={langDropdownRef}>
              <button
                onClick={() => setIsLangDropdownOpen(!isLangDropdownOpen)}
                className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2.5 py-2 text-sm font-medium text-[#71717A] hover:text-[#18181B] hover:bg-[#F4F4F5] rounded-lg transition-all"
                data-testid="lang-switcher-btn"
              >
                <Globe size={20} weight="duotone" />
                <span className="hidden sm:inline">{(languages || LANGUAGES).find(l => l.code === lang)?.label}</span>
                <CaretDown size={14} className={`transition-transform ${isLangDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              
              {isLangDropdownOpen && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-[#E4E4E7] rounded-xl shadow-lg py-1 min-w-[140px] z-50">
                  {(languages || LANGUAGES).map((language) => (
                    <button
                      key={language.code}
                      onClick={() => {
                        changeLang(language.code);
                        setIsLangDropdownOpen(false);
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                        lang === language.code 
                          ? 'bg-[#F4F4F5] text-[#18181B] font-medium' 
                          : 'text-[#71717A] hover:bg-[#F4F4F5] hover:text-[#18181B]'
                      }`}
                      data-testid={`lang-${language.code}`}
                    >
                      <span className="text-base">{language.flag}</span>
                      <span>{language.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            {/* Ringostat live bar — gated by per-user preference */}
            {!loadingPrefs && ringostatPrefs?.show_live_bar && (
              <div className="hidden xs:block sm:block">
                <RingostatLiveBar />
              </div>
            )}
            <button
              onClick={() => navigate('/manager/tracking')}
              className="hidden sm:flex w-9 h-9 rounded-full hover:bg-[#F4F4F5] items-center justify-center transition-colors flex-shrink-0"
              title={t('i18n_universal_tracker_vin_containe_26edea')}
              data-testid="global-tracker-btn"
            >
              <MagnifyingGlass size={20} className="text-[#52525B]" />
            </button>
            <NotificationBell />
          </div>
        </header>

        {/* Content — unified 50px horizontal padding across every admin page,
            so internal pages (Dashboard, CRM, Leads, Deals, Deposits, Finance,
            Legal Workflow, Calculators, Staff, Team alerts, etc.) all share
            the exact same alignment relative to the header & sidebar. */}
        <main className="flex-1 overflow-auto px-4 py-5 md:px-6 md:py-6 lg:px-[50px] lg:py-8">
          {/* Mobile Search Panel */}
          {isMobileSearchOpen && (
            <div className="md:hidden mb-4 relative">
              <input 
                type="text" 
                placeholder={t('search')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
                className="input w-full"
                data-testid="mobile-search-input"
              />
              {searchQuery.trim() && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#E4E4E7] rounded-xl shadow-lg z-50 py-2 max-h-72 overflow-auto" data-testid="mobile-search-results">
                  {filteredSearchItems.length > 0 ? (
                    filteredSearchItems.map(item => (
                      <button
                        key={item.path}
                        onClick={() => handleSearchSelect(item.path)}
                        className="w-full text-left px-4 py-2.5 hover:bg-[#F4F4F5] transition-colors flex items-center justify-between gap-3"
                        data-testid="mobile-search-result-item"
                      >
                        <span className="text-sm font-medium text-[#18181B] truncate">{item.label}</span>
                        {item.group && (
                          <span className="text-[11px] text-[#A1A1AA] shrink-0 px-1.5 py-0.5 bg-[#F4F4F5] rounded">{item.group}</span>
                        )}
                      </button>
                    ))
                  ) : (
                    <div className="px-4 py-3 text-sm text-[#A1A1AA]">
                      {t('searchNoResults') || 'Nothing found'}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          <Outlet />
        </main>
      </div>

      {/* Ringostat widgets — gated by per-user prefs.
          Phase IV-6: don't mount any intrusive UI until prefs have
          actually loaded, otherwise the FALLBACK (all-on) would briefly
          fire managerial popups for admins on first paint. */}
      {!loadingPrefs && (
        <>
          {(ringostatPrefs?.show_incoming_popup ||
            ringostatPrefs?.show_outcome_banner ||
            ringostatPrefs?.show_missed_alerts) && (
              <RingostatManager prefs={ringostatPrefs} />
          )}
          {ringostatPrefs?.show_aggregate_summary && (
            <RingostatSupervisionPanel role={ringostatRole} />
          )}
        </>
      )}
    </div>
  );
};

export default Layout;
