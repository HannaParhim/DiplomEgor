import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { apiRequest } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { formatRoleName } from "../utils/format.js";

const navigation = [
  { label: "Дашборд", to: "/dashboard" },
  { label: "Чат", to: "/chat" },
  { label: "Курсы", to: "/courses" },
  { label: "Мои сертификаты", to: "/certificates" },
  { label: "Пользователи", to: "/users", permission: "manage_users" },
  { label: "Отделы", to: "/departments", permission: "manage_departments" },
  { label: "Роли", to: "/roles", permission: "manage_roles" },
  { label: "Отчеты", to: "/reports", permission: "view_reports" },
  {
    label: "Настройки",
    to: "/settings",
    permissionAny: ["manage_users", "manage_roles", "manage_company_focus"]
  }
];

const formatToday = () =>
  new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long"
  }).format(new Date());

const getCompanyInitials = (name = "") =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "CO";

export function AppShell() {
  const { company, hasPermission, logout, socket, token, user } = useAuth();
  const location = useLocation();
  const canManageCompanySettings =
    hasPermission("manage_users") || hasPermission("manage_roles");
  const [chatStats, setChatStats] = useState({
    unread: 0,
    open: 0
  });

  useEffect(() => {
    let isActive = true;

    const loadChatStats = async () => {
      try {
        const summary = await apiRequest("/chat/summary", { token });

        if (!isActive) {
          return;
        }

        setChatStats({
          unread: summary.unread ?? 0,
          open: summary.open ?? 0
        });
      } catch {
        if (isActive) {
          setChatStats({
            unread: 0,
            open: 0
          });
        }
      }
    };

    loadChatStats();
    const intervalId = setInterval(loadChatStats, 120000);

    if (socket) {
      socket.on("chat:changed", loadChatStats);
    }

    return () => {
      isActive = false;
      clearInterval(intervalId);
      socket?.off("chat:changed", loadChatStats);
    };
  }, [socket, token]);

  const visibleNavigation = navigation.filter(
    (item) =>
      (!item.permission || hasPermission(item.permission)) &&
      (!item.permissionAny ||
        item.permissionAny.some((permission) => hasPermission(permission)))
  );

  const currentSection =
    visibleNavigation.find((item) =>
      item.to === "/dashboard"
        ? location.pathname === "/dashboard"
        : location.pathname.startsWith(item.to)
    ) ?? visibleNavigation[0];

  const focusTitle =
    company?.focusTitle ||
    (chatStats.unread > 0 ? "Ответить на новые сообщения" : "Продолжить обучение");
  const focusHint =
    company?.focusDescription ||
    (chatStats.unread > 0 ? "Есть новые обращения в чате." : "Вернуться к активным курсам.");

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(15,122,101,0.1),_transparent_22%),radial-gradient(circle_at_85%_10%,_rgba(217,137,48,0.12),_transparent_20%),linear-gradient(180deg,_#f9f4eb_0%,_#eef5f1_100%)]">
      <div className="mx-auto max-w-[1500px] px-4 py-4 lg:px-6">
        <div className="grid gap-5 xl:grid-cols-[320px,1fr]">
          <aside className="space-y-5 xl:sticky xl:top-4 xl:h-fit">
            <div className="overflow-hidden rounded-4xl border border-[#d5ddd7] bg-[linear-gradient(145deg,_rgba(255,252,247,0.98)_0%,_rgba(241,249,245,0.95)_56%,_rgba(255,237,211,0.88)_100%)] p-6 shadow-panel">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">
                {currentSection?.label ?? "Раздел"}
              </p>
              <div className="mt-4 flex items-center gap-4">
                {company?.logo ? (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[1.6rem] border border-white/80 bg-white/90 shadow-[0_10px_20px_rgba(16,33,27,0.08)]">
                    <img
                      src={company.logo}
                      alt={`Логотип ${company?.name ?? "компании"}`}
                      className="h-full w-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[1.6rem] bg-[#10211b] text-lg font-extrabold text-white shadow-[0_10px_20px_rgba(16,33,27,0.12)]">
                    {getCompanyInitials(company?.name)}
                  </div>
                )}
                <h1 className="text-2xl font-extrabold leading-tight text-ink">
                  {company?.name ?? "Рабочее пространство"}
                </h1>
              </div>
              <p className="mt-2 text-sm text-slate-500">
                {formatToday()} · {formatRoleName(user?.role?.name)}
              </p>
              {canManageCompanySettings && company?.domain ? (
                <p className="mono mt-4 inline-flex rounded-full border border-brand-100 bg-white/80 px-3 py-2 text-[12px] font-medium text-brand-700">
                  {company.domain}
                </p>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <div className="metric-card">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Чат</p>
                <p className="mt-3 text-3xl font-extrabold text-ink">{chatStats.unread}</p>
                <p className="mt-2 text-sm text-slate-500">непрочитанные</p>
              </div>
              <div className="metric-card">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">В работе</p>
                <p className="mt-3 text-3xl font-extrabold text-ink">{chatStats.open}</p>
                <p className="mt-2 text-sm text-slate-500">диалоги</p>
              </div>
              <div className="metric-card">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Режим</p>
                <p className="mt-3 text-lg font-bold text-ink">
                  {hasPermission("manage_users") ? "Управление командой" : "Личный кабинет"}
                </p>
              </div>
            </div>

            <nav className="overflow-hidden rounded-4xl border border-[#d5ddd7] bg-white/80 p-3 shadow-panel backdrop-blur">
              <div className="flex gap-2 overflow-x-auto xl:flex-col">
                {visibleNavigation.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `flex min-w-max items-center justify-between rounded-3xl px-4 py-3 text-sm font-semibold transition xl:min-w-0 ${
                        isActive
                          ? "bg-[linear-gradient(135deg,_#0f7a65_0%,_#0b5a4b_100%)] text-white shadow-[0_16px_30px_rgba(15,122,101,0.2)]"
                          : "text-slate-600 hover:bg-brand-50 hover:text-brand-700"
                      }`
                    }
                  >
                    <span>{item.label}</span>
                    {item.to === "/chat" && chatStats.unread > 0 ? (
                      <span className="ml-3 rounded-full bg-white/90 px-2 py-1 text-[11px] font-bold text-brand-700">
                        {chatStats.unread}
                      </span>
                    ) : null}
                  </NavLink>
                ))}
              </div>
            </nav>

            <div className="rounded-4xl border border-[#d5ddd7] bg-[#10211b] p-5 text-white shadow-panel">
              <p className="text-sm font-semibold">{user?.name}</p>
              <p className="mt-1 text-sm text-white/70">{formatRoleName(user?.role?.name)}</p>
              <button
                type="button"
                onClick={logout}
                className="mt-5 w-full rounded-full bg-accent-400 px-4 py-3 text-sm font-bold text-ink transition hover:bg-accent-100"
              >
                Выйти
              </button>
            </div>
          </aside>

          <div className="space-y-5">
            <header className="rounded-4xl border border-[#d5ddd7] bg-white/80 px-6 py-5 shadow-panel backdrop-blur">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-2xl font-extrabold text-ink">
                    {currentSection?.label ?? "Рабочее пространство"}
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Фокус</p>
                    <p className="mt-2 text-sm font-semibold text-ink">
                      {focusTitle}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">{focusHint}</p>
                  </div>
                  <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Коммуникации</p>
                    <p className="mt-2 text-sm font-semibold text-ink">
                      {chatStats.open} активных диалогов
                    </p>
                  </div>
                  <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Роль</p>
                    <p className="mt-2 text-sm font-semibold text-ink">
                      {formatRoleName(user?.role?.name)}
                    </p>
                  </div>
                </div>
              </div>
            </header>

            <main className="rounded-4xl border border-[#d5ddd7] bg-white/78 p-5 shadow-panel backdrop-blur md:p-8">
              <Outlet />
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
