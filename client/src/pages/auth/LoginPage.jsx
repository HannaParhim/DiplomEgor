import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [form, setForm] = useState({
    email: "",
    password: "",
    companyDomain: ""
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
      await login({
        ...form,
        companyDomain: form.companyDomain || undefined
      });
      navigate("/dashboard");
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(135deg,_#102349_0%,_#315efb_45%,_#f59e0b_100%)] px-4 py-8">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.1fr,0.9fr]">
        <section className="rounded-4xl border border-white/20 bg-white/10 p-8 text-white backdrop-blur md:p-12">
          <p className="text-xs uppercase tracking-[0.35em] text-white/70">Корпоративное обучение</p>
          <h1 className="mt-6 max-w-xl text-5xl font-bold leading-tight">
            Обучайте сотрудников разных компаний на одной платформе без смешения данных.
          </h1>
          <p className="mt-6 max-w-xl text-base text-white/80">
            Сотрудники проходят курсы и получают сертификаты. Руководители назначают
            обучение, отвечают в чате и контролируют результат команды.
          </p>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              { label: "Компании", value: "Изоляция ролей и данных" },
              { label: "Курсы", value: "Модули, уроки, тесты" },
              { label: "Контроль", value: "Прогресс и сертификаты" }
            ].map((item) => (
              <div key={item.label} className="rounded-3xl border border-white/15 bg-white/10 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-white/60">{item.label}</p>
                <p className="mt-2 text-sm font-semibold">{item.value}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="panel self-center">
          <p className="text-xs uppercase tracking-[0.25em] text-brand-700">Вход</p>
          <h2 className="mt-3 text-3xl font-bold text-ink">Войдите в учебный кабинет</h2>
          <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
            <input
              className="field"
              name="email"
              type="email"
              placeholder="Электронная почта"
              value={form.email}
              onChange={handleChange}
              required
            />
            <input
              className="field"
              name="password"
              type="password"
              placeholder="Пароль"
              value={form.password}
              onChange={handleChange}
              required
            />
            <input
              className="field"
              name="companyDomain"
              placeholder="Домен компании (если почта не уникальна)"
              value={form.companyDomain}
              onChange={handleChange}
            />
            {error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
                {error}
              </div>
            ) : null}
            <button className="btn-primary w-full" type="submit" disabled={busy}>
              {busy ? "Входим..." : "Войти"}
            </button>
          </form>

          <p className="mt-6 text-sm text-slate-500">
            Нужна новая компания?{" "}
            <Link className="font-semibold text-brand-700" to="/register-company">
              Зарегистрировать компанию
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}
