import { useEffect, useState } from "react";
import { apiRequest } from "../../api/client.js";
import { PageHeader } from "../../components/PageHeader.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import {
  formatAuditAction,
  formatDate,
  formatRoleName
} from "../../utils/format.js";

const emptyCompanyForm = {
  name: "",
  logo: "",
  directorName: "",
  directorTitle: "",
  directorSignatureUrl: ""
};

const emptyFocusForm = {
  focusTitle: "",
  focusDescription: ""
};

const getCompanyInitials = (name = "") =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "CO";

export function SettingsPage() {
  const { company, user, token, hasPermission, refreshSession } = useAuth();
  const canManageSettings =
    hasPermission("manage_roles") || hasPermission("manage_users");
  const canManageFocus =
    hasPermission("manage_company_focus") || canManageSettings;
  const canViewAudit =
    hasPermission("manage_users") || hasPermission("view_reports");

  const [companyForm, setCompanyForm] = useState(emptyCompanyForm);
  const [focusForm, setFocusForm] = useState(emptyFocusForm);
  const [auditLogs, setAuditLogs] = useState([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [savingSection, setSavingSection] = useState("");
  const [uploadingTarget, setUploadingTarget] = useState("");

  const applyCompanyState = (payload) => {
    setCompanyForm({
      name: payload?.name ?? "",
      logo: payload?.logo ?? "",
      directorName: payload?.directorName ?? "",
      directorTitle: payload?.directorTitle ?? "",
      directorSignatureUrl: payload?.directorSignatureUrl ?? ""
    });
  };

  const applyFocusState = (payload) => {
    setFocusForm({
      focusTitle: payload?.focusTitle ?? "",
      focusDescription: payload?.focusDescription ?? ""
    });
  };

  const loadData = async () => {
    try {
      const requests = [
        canManageSettings
          ? apiRequest("/company/settings", { token })
          : Promise.resolve(company ?? null),
        canManageFocus
          ? apiRequest("/company/focus", { token })
          : Promise.resolve(company ?? null),
        canViewAudit ? apiRequest("/audit?limit=10", { token }) : Promise.resolve([])
      ];

      const [companyResult, focusResult, auditResult] = await Promise.all(requests);

      if (companyResult) {
        applyCompanyState(companyResult);
      }

      if (focusResult) {
        applyFocusState(focusResult);
      }

      setAuditLogs(auditResult);
      setError("");
    } catch (loadError) {
      setError(loadError.message);
    }
  };

  useEffect(() => {
    if (company) {
      applyCompanyState(company);
      applyFocusState(company);
    }
  }, [company]);

  useEffect(() => {
    loadData();
  }, [token, canManageSettings, canManageFocus, canViewAudit]);

  const handleCompanyChange = (field) => (event) => {
    setCompanyForm((current) => ({
      ...current,
      [field]: event.target.value
    }));
  };

  const handleFocusChange = (field) => (event) => {
    setFocusForm((current) => ({
      ...current,
      [field]: event.target.value
    }));
  };

  const handleUpload = async (target, file) => {
    if (!file) {
      return;
    }

    const body = new FormData();
    body.append("file", file);

    setUploadingTarget(target);
    setError("");
    setSuccess("");

    try {
      const endpoint =
        target === "logo" ? "/company/logo-upload" : "/company/signature-upload";
      const result = await apiRequest(endpoint, {
        method: "POST",
        token,
        body
      });

      if (target === "logo") {
        setCompanyForm((current) => ({
          ...current,
          logo: result.fileUrl
        }));
        setSuccess("Логотип загружен. Сохраните изменения.");
      } else {
        setCompanyForm((current) => ({
          ...current,
          directorSignatureUrl: result.fileUrl
        }));
        setSuccess("Подпись загружена. Сохраните изменения.");
      }
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setUploadingTarget("");
    }
  };

  const handleSaveCompany = async (event) => {
    event.preventDefault();
    setSavingSection("company");
    setError("");
    setSuccess("");

    try {
      const result = await apiRequest("/company/settings", {
        method: "PUT",
        token,
        body: {
          name: companyForm.name,
          logo: companyForm.logo || null,
          directorName: companyForm.directorName || null,
          directorTitle: companyForm.directorTitle || null,
          directorSignatureUrl: companyForm.directorSignatureUrl || null
        }
      });

      applyCompanyState(result);
      await refreshSession();
      await loadData();
      setSuccess("Профиль компании сохранен.");
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSavingSection("");
    }
  };

  const handleSaveFocus = async (event) => {
    event.preventDefault();
    setSavingSection("focus");
    setError("");
    setSuccess("");

    try {
      const result = await apiRequest("/company/focus", {
        method: "PUT",
        token,
        body: {
          focusTitle: focusForm.focusTitle.trim() || null,
          focusDescription: focusForm.focusDescription.trim() || null
        }
      });

      applyFocusState(result);
      await refreshSession();
      setSuccess("Фокус компании обновлен.");
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSavingSection("");
    }
  };

  const previewCompanyName = companyForm.name || company?.name || "Ваша компания";
  const previewDirectorName = companyForm.directorName || "Имя директора";
  const previewDirectorTitle = companyForm.directorTitle || "Генеральный директор";
  const previewFocusTitle = focusForm.focusTitle || "Продолжить обучение";
  const previewFocusDescription =
    focusForm.focusDescription || "Короткий ориентир для команды на текущий момент.";

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Настройки" title="Компания и сертификаты" />

      {error ? (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
        {canManageSettings ? (
          <div className="panel">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-ink">Профиль компании</h2>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
                Редактирование
              </span>
            </div>

            <form className="mt-6 space-y-5" onSubmit={handleSaveCompany}>
              <label className="block text-sm text-slate-600">
                Название компании
                <input
                  className="field mt-2"
                  value={companyForm.name}
                  onChange={handleCompanyChange("name")}
                  placeholder="Название компании"
                />
              </label>

              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-ink">Логотип компании</p>
                    <p className="mt-1 text-sm text-slate-500">
                      Используется в шапке системы и на сертификатах.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <label className="btn-secondary cursor-pointer">
                      {uploadingTarget === "logo" ? "Загружаем..." : "Загрузить логотип"}
                      <input
                        type="file"
                        className="hidden"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(event) => {
                          handleUpload("logo", event.target.files?.[0]);
                          event.target.value = "";
                        }}
                        disabled={uploadingTarget === "logo"}
                      />
                    </label>
                    {companyForm.logo ? (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() =>
                          setCompanyForm((current) => ({
                            ...current,
                            logo: ""
                          }))
                        }
                      >
                        Убрать
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 rounded-3xl border border-slate-200 bg-white px-4 py-4">
                  {companyForm.logo ? (
                    <img
                      src={companyForm.logo}
                      alt="Логотип компании"
                      className="h-20 max-w-full object-contain"
                    />
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-[1.6rem] bg-[#10211b] text-xl font-extrabold text-white">
                      {getCompanyInitials(previewCompanyName)}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-sm text-slate-600">
                  ФИО директора
                  <input
                    className="field mt-2"
                    value={companyForm.directorName}
                    onChange={handleCompanyChange("directorName")}
                    placeholder="Анна Белова"
                  />
                </label>

                <label className="block text-sm text-slate-600">
                  Должность директора
                  <input
                    className="field mt-2"
                    value={companyForm.directorTitle}
                    onChange={handleCompanyChange("directorTitle")}
                    placeholder="Генеральный директор"
                  />
                </label>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-ink">Подпись директора</p>
                    <p className="mt-1 text-sm text-slate-500">
                      Подходит для HTML- и PDF-версии сертификата.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <label className="btn-secondary cursor-pointer">
                      {uploadingTarget === "signature" ? "Загружаем..." : "Загрузить подпись"}
                      <input
                        type="file"
                        className="hidden"
                        accept="image/png,image/jpeg"
                        onChange={(event) => {
                          handleUpload("signature", event.target.files?.[0]);
                          event.target.value = "";
                        }}
                        disabled={uploadingTarget === "signature"}
                      />
                    </label>
                    {companyForm.directorSignatureUrl ? (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() =>
                          setCompanyForm((current) => ({
                            ...current,
                            directorSignatureUrl: ""
                          }))
                        }
                      >
                        Убрать
                      </button>
                    ) : null}
                  </div>
                </div>

                {companyForm.directorSignatureUrl ? (
                  <div className="mt-4 rounded-3xl border border-slate-200 bg-white px-4 py-4">
                    <img
                      src={companyForm.directorSignatureUrl}
                      alt="Подпись директора"
                      className="h-20 max-w-full object-contain"
                    />
                  </div>
                ) : null}
              </div>

              <button
                className="btn-primary"
                type="submit"
                disabled={savingSection === "company"}
              >
                {savingSection === "company" ? "Сохраняем..." : "Сохранить профиль"}
              </button>
            </form>
          </div>
        ) : (
          <div className="panel">
            <h2 className="text-xl font-bold text-ink">Компания</h2>
            <div className="mt-6 flex items-center gap-4">
              {company?.logo ? (
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-[1.6rem] border border-slate-200 bg-white">
                  <img
                    src={company.logo}
                    alt={`Логотип ${company?.name ?? "компании"}`}
                    className="h-full w-full object-contain"
                  />
                </div>
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-[1.6rem] bg-[#10211b] text-xl font-extrabold text-white">
                  {getCompanyInitials(previewCompanyName)}
                </div>
              )}
              <div>
                <p className="text-lg font-bold text-ink">{previewCompanyName}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {user?.name || "Пользователь"} · {formatRoleName(user?.role?.name)}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="panel overflow-hidden bg-[linear-gradient(145deg,_#0f172a_0%,_#1e3a8a_56%,_#f59e0b_100%)] text-white">
          <div className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs uppercase tracking-[0.24em] text-white/70">
            Предпросмотр сертификата
          </div>
          <div className="mt-6 rounded-[28px] border border-white/15 bg-white/10 p-6 backdrop-blur">
            <p className="text-sm uppercase tracking-[0.24em] text-white/60">Сертификат</p>
            <h2 className="mt-4 text-3xl font-bold leading-tight">
              Сертификат о завершении обучения
            </h2>

            <div className="mt-8 rounded-[24px] bg-white px-5 py-5 text-slate-900 shadow-xl">
              <div className="flex items-center gap-4">
                {companyForm.logo ? (
                  <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-[1.4rem] border border-slate-200 bg-white">
                    <img
                      src={companyForm.logo}
                      alt="Логотип компании"
                      className="h-full w-full object-contain"
                    />
                  </div>
                ) : null}
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Компания</p>
                  <p className="mt-2 text-xl font-bold">{previewCompanyName}</p>
                </div>
              </div>

              <p className="mt-6 text-xs uppercase tracking-[0.24em] text-slate-400">Сотрудник</p>
              <p className="mt-2 text-2xl font-bold">{user?.name || "Сотрудник компании"}</p>
              <p className="mt-6 text-xs uppercase tracking-[0.24em] text-slate-400">Подписант</p>

              <div className="mt-3 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                {companyForm.directorSignatureUrl ? (
                  <img
                    src={companyForm.directorSignatureUrl}
                    alt="Подпись директора"
                    className="h-16 max-w-full object-contain"
                  />
                ) : (
                  <div className="text-4xl text-slate-800 [font-family:'Segoe_Script','Brush_Script_MT',cursive]">
                    {previewDirectorName}
                  </div>
                )}
                <p className="mt-3 font-semibold">{previewDirectorName}</p>
                <p className="text-sm text-slate-500">{previewDirectorTitle}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {canManageFocus ? (
        <section className="grid gap-6 xl:grid-cols-[1fr,0.9fr]">
          <div className="panel">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-ink">Фокус компании</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Короткий ориентир, который сотрудники видят в шапке и на дашборде.
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
                Отдельное право роли
              </span>
            </div>

            <form className="mt-6 space-y-4" onSubmit={handleSaveFocus}>
              <label className="block text-sm text-slate-600">
                Заголовок
                <input
                  className="field mt-2"
                  value={focusForm.focusTitle}
                  onChange={handleFocusChange("focusTitle")}
                  placeholder="Например, Закрыть обязательное обучение"
                />
              </label>

              <label className="block text-sm text-slate-600">
                Подсказка
                <textarea
                  className="field mt-2 min-h-[120px]"
                  value={focusForm.focusDescription}
                  onChange={handleFocusChange("focusDescription")}
                  placeholder="Например, На этой неделе команда завершает курс по продукту и отвечает на новые обращения."
                />
              </label>

              <div className="flex flex-wrap gap-3">
                <button
                  className="btn-primary"
                  type="submit"
                  disabled={savingSection === "focus"}
                >
                  {savingSection === "focus" ? "Сохраняем..." : "Сохранить фокус"}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setFocusForm(emptyFocusForm)}
                >
                  Очистить
                </button>
              </div>
            </form>
          </div>

          <div className="panel">
            <h2 className="text-xl font-bold text-ink">Как это увидят сотрудники</h2>
            <div className="mt-6 rounded-[30px] border border-slate-200 bg-slate-50 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Фокус
              </p>
              <p className="mt-3 text-lg font-bold text-ink">{previewFocusTitle}</p>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {previewFocusDescription}
              </p>
            </div>

            <div className="mt-5 rounded-[30px] border border-[#d5ddd7] bg-[linear-gradient(135deg,_#10211b_0%,_#0f7a65_52%,_#d98930_100%)] p-5 text-white">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
                Сегодня в фокусе
              </p>
              <p className="mt-3 text-2xl font-extrabold leading-tight">
                {previewFocusTitle}
              </p>
              <p className="mt-3 text-sm leading-6 text-white/80">
                {previewFocusDescription}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <section className={`grid gap-6 ${canViewAudit ? "xl:grid-cols-[0.8fr,1.2fr]" : ""}`}>
        <div className="panel">
          <h2 className="text-xl font-bold text-ink">Текущая сессия</h2>
          <dl className="mt-5 space-y-4 text-sm text-slate-600">
            <div>
              <dt className="font-semibold text-ink">Компания</dt>
              <dd>{company?.name || "Не указано"}</dd>
            </div>
            <div>
              <dt className="font-semibold text-ink">Домен</dt>
              <dd>{company?.domain || "Не указано"}</dd>
            </div>
            <div>
              <dt className="font-semibold text-ink">Пользователь</dt>
              <dd>
                {user?.name || "Не указано"} · {formatRoleName(user?.role?.name)}
              </dd>
            </div>
          </dl>
        </div>

        {canViewAudit ? (
          <div className="panel">
            <h2 className="text-xl font-bold text-ink">Последние события</h2>
            <div className="mt-5 space-y-3">
              {auditLogs.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4"
                >
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-semibold text-ink">{formatAuditAction(entry.action)}</p>
                      <p className="text-sm text-slate-500">
                        {entry.actor?.name || "Системный процесс"} · {entry.entityType}
                        {entry.entityId ? ` #${entry.entityId}` : ""}
                      </p>
                    </div>
                    <span className="text-xs uppercase tracking-[0.16em] text-slate-400">
                      {formatDate(entry.createdAt)}
                    </span>
                  </div>
                </div>
              ))}
              {auditLogs.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
                  События появятся после изменений в системе.
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
