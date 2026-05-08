import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";

export function RegisterCompanyPage() {
  const navigate = useNavigate();
  const { registerCompany } = useAuth();
  const [form, setForm] = useState({
    companyName: "",
    companyDomain: "",
    adminName: "",
    adminEmail: "",
    adminPassword: ""
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      await registerCompany(form);
      navigate("/dashboard");
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(135deg,_#f8f3eb_0%,_#fff7d8_40%,_#dbe7ff_100%)] px-4 py-8">
      <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[0.85fr,1.15fr]">
        <section className="rounded-4xl border border-slate-200 bg-white/70 p-8 shadow-panel backdrop-blur">
          <p className="text-xs uppercase tracking-[0.3em] text-brand-700">Новая компания</p>
          <h1 className="mt-4 text-4xl font-bold text-ink">Создать рабочее пространство</h1>
          <p className="mt-4 text-sm text-slate-600">
            После регистрации можно сразу добавить сотрудников, настроить роли и
            запустить первые курсы.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-slate-600">
            <li>Изолированные пользователи, роли, курсы и аналитика для каждой компании.</li>
            <li>Сразу доступны дашборд, чат, пользователи, отделы и отчеты.</li>
            <li>Сертификаты формируются внутри платформы и готовы к выгрузке.</li>
          </ul>
          <p className="mt-10 text-sm text-slate-500">
            Уже есть компания?{" "}
            <Link className="font-semibold text-brand-700" to="/login">
              Перейти ко входу
            </Link>
          </p>
        </section>

        <section className="panel">
          <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-slate-600">
                Название компании
              </label>
              <input
                className="field"
                name="companyName"
                value={form.companyName}
                onChange={handleChange}
                required
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-slate-600">
                Домен компании
              </label>
              <input
                className="field"
                name="companyDomain"
                value={form.companyDomain}
                onChange={handleChange}
                placeholder="acme-corp"
                required
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-600">
                Имя администратора
              </label>
              <input
                className="field"
                name="adminName"
                value={form.adminName}
                onChange={handleChange}
                required
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-600">
                Почта администратора
              </label>
              <input
                className="field"
                name="adminEmail"
                type="email"
                value={form.adminEmail}
                onChange={handleChange}
                required
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-slate-600">
                Пароль администратора
              </label>
              <input
                className="field"
                name="adminPassword"
                type="password"
                value={form.adminPassword}
                onChange={handleChange}
                required
              />
            </div>
            {error ? (
              <div className="md:col-span-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
                {error}
              </div>
            ) : null}
            <div className="md:col-span-2">
              <button className="btn-primary w-full" type="submit" disabled={busy}>
                {busy ? "Создаём пространство..." : "Зарегистрировать компанию"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
