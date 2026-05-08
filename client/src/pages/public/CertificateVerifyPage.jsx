import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiRequest } from "../../api/client.js";
import { formatDate } from "../../utils/format.js";

export function CertificateVerifyPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [lookupCode, setLookupCode] = useState(code ?? "");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [requestNonce, setRequestNonce] = useState(0);

  useEffect(() => {
    setLookupCode(code ?? "");
  }, [code, requestNonce]);

  useEffect(() => {
    let isActive = true;

    setLoading(true);
    apiRequest(`/certificates/verify/${encodeURIComponent(code)}`)
      .then((payload) => {
        if (!isActive) {
          return;
        }

        setResult(payload);
        setError("");
      })
      .catch((loadError) => {
        if (isActive) {
          setResult(null);
          setError(loadError.message);
        }
      })
      .finally(() => {
        if (isActive) {
          setLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [code]);

  const handleLookup = (event) => {
    event.preventDefault();

    const normalizedCode = lookupCode.trim().toUpperCase();
    if (!normalizedCode) {
      setError("Введите код проверки сертификата.");
      return;
    }

    setError("");

    if (normalizedCode === String(code ?? "").trim().toUpperCase()) {
      setRequestNonce((current) => current + 1);
      return;
    }

    navigate(`/verify-certificate/${encodeURIComponent(normalizedCode)}`);
  };

  const certificate = result?.certificate;
  const verified = result?.verified;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(15,122,101,0.16),_transparent_24%),radial-gradient(circle_at_right_top,_rgba(217,137,48,0.18),_transparent_28%),linear-gradient(180deg,_#f7f1e7_0%,_#edf4ef_100%)] px-4 py-8 md:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="overflow-hidden rounded-[36px] border border-[#d7ccb7] bg-[linear-gradient(145deg,_rgba(255,252,246,0.98),_rgba(248,242,227,0.98))] p-6 shadow-panel md:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="inline-flex rounded-full bg-brand-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-brand-700">
                Публичный реестр сертификатов
              </p>
              <h1 className="mt-4 text-4xl font-extrabold leading-tight text-ink md:text-5xl">
                Проверка подлинности сертификата
              </h1>
              <p className="mt-4 text-sm leading-7 text-slate-600 md:text-base">
                Здесь можно убедиться, что сертификат действительно выпущен в системе
                обучения компании, не был подменён и относится к конкретному курсу и
                сотруднику.
              </p>
            </div>

            <form className="w-full max-w-xl rounded-[28px] border border-slate-200 bg-white/88 p-4" onSubmit={handleLookup}>
              <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                Код проверки
              </label>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                <input
                  className="field sm:flex-1"
                  value={lookupCode}
                  onChange={(event) => setLookupCode(event.target.value)}
                  placeholder="Например, 91AF0D8C13B2"
                />
                <button className="btn-primary whitespace-nowrap" type="submit">
                  Проверить код
                </button>
              </div>
            </form>
          </div>
        </section>

        {loading ? (
          <div className="panel text-sm text-slate-500">Проверяем сертификат...</div>
        ) : null}

        {!loading && error ? (
          <section className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
            <div className="panel border border-rose-200 bg-rose-50/80">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-rose-500">
                Сертификат не найден
              </p>
              <h2 className="mt-4 text-3xl font-extrabold text-ink">
                Подлинность не подтверждена
              </h2>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600">{error}</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button className="btn-primary" type="button" onClick={handleLookup}>
                  Повторить поиск
                </button>
                <Link className="btn-secondary" to="/login">
                  Перейти ко входу
                </Link>
              </div>
            </div>

            <div className="panel">
              <h3 className="text-xl font-bold text-ink">Как проверить сертификат</h3>
              <div className="mt-5 space-y-3 text-sm leading-7 text-slate-600">
                <p>Введите код проверки из документа без пробелов и лишних символов.</p>
                <p>Если код введён верно, система покажет курс, сотрудника и дату выдачи.</p>
                <p>Для надёжности сверяйте имя курса и сотрудника с самим сертификатом.</p>
              </div>
            </div>
          </section>
        ) : null}

        {!loading && certificate ? (
          <>
            <section className="overflow-hidden rounded-[36px] border border-[#d7ccb7] bg-[linear-gradient(135deg,_#10211b_0%,_#0f7a65_54%,_#d98930_100%)] p-2 shadow-panel">
              <div className="rounded-[30px] bg-[linear-gradient(180deg,_rgba(255,253,247,0.98),_rgba(248,242,227,0.98))] p-6 md:p-8">
                <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                  <div className="max-w-3xl">
                    <p className="inline-flex rounded-full bg-brand-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-brand-700">
                      {verified ? "Сертификат подтверждён" : "Проверка не пройдена"}
                    </p>
                    <h2 className="mt-4 text-3xl font-extrabold leading-tight text-ink md:text-4xl">
                      {certificate.course.title}
                    </h2>
                    <p className="mt-4 text-sm leading-7 text-slate-600 md:text-base">
                      Запись найдена в системе. Этот сертификат выпущен для сотрудника{" "}
                      <strong className="text-ink">{certificate.user.name}</strong> и содержит
                      проверочный код <strong className="text-brand-700">{certificate.verificationCode}</strong>.
                    </p>
                  </div>

                  <div
                    className={`rounded-[28px] px-5 py-5 text-sm shadow-sm ${
                      verified
                        ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border border-rose-200 bg-rose-50 text-rose-600"
                    }`}
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.2em]">
                      Статус проверки
                    </p>
                    <p className="mt-3 text-2xl font-extrabold">
                      {verified ? "Подлинность подтверждена" : "Есть несоответствие"}
                    </p>
                    <p className="mt-3 leading-6">
                      {verified
                        ? "Цифровой отпечаток совпадает с записью в системе."
                        : "Отпечаток не совпал с ожидаемой записью. Используйте документ с осторожностью."}
                    </p>
                  </div>
                </div>

                <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-[28px] border border-slate-200 bg-white/82 px-5 py-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Сотрудник
                    </p>
                    <p className="mt-3 text-xl font-bold text-ink">{certificate.user.name}</p>
                  </div>
                  <div className="rounded-[28px] border border-slate-200 bg-white/82 px-5 py-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Компания
                    </p>
                    <p className="mt-3 text-xl font-bold text-ink">{certificate.company.name}</p>
                  </div>
                  <div className="rounded-[28px] border border-slate-200 bg-white/82 px-5 py-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Дата выдачи
                    </p>
                    <p className="mt-3 text-xl font-bold text-ink">{formatDate(certificate.issuedAt)}</p>
                  </div>
                  <div className="rounded-[28px] border border-slate-200 bg-white/82 px-5 py-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Подписано
                    </p>
                    <p className="mt-3 text-lg font-bold text-ink">
                      {certificate.signedByName || "Не указано"}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {certificate.signedByTitle || "Должность не указана"}
                    </p>
                  </div>
                </div>

                <div className="mt-6 grid gap-4 xl:grid-cols-[1.2fr,0.8fr]">
                  <div className="rounded-[28px] border border-slate-200 bg-white/82 px-5 py-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Реестровая информация
                    </p>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div className="rounded-3xl bg-slate-50 px-4 py-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                          Код проверки
                        </p>
                        <p className="mono mt-2 text-sm font-bold text-brand-700">
                          {certificate.verificationCode}
                        </p>
                      </div>
                      <div className="rounded-3xl bg-slate-50 px-4 py-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                          Цифровой отпечаток
                        </p>
                        <p className="mono mt-2 text-sm font-bold text-ink">
                          {certificate.digestPreview || "Недоступно"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[28px] border border-slate-200 bg-white/82 px-5 py-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Документы
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      {certificate.certificateUrl ? (
                        <a
                          className="btn-secondary"
                          href={certificate.certificateUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Открыть сертификат
                        </a>
                      ) : null}
                      {certificate.pdfUrl ? (
                        <a
                          className="btn-primary"
                          href={certificate.pdfUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Скачать PDF
                        </a>
                      ) : null}
                    </div>
                    <div className="mt-4 text-sm leading-7 text-slate-600">
                      При необходимости можно открыть оригинал документа или скачать его в
                      формате PDF.
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-2">
              <div className="panel">
                <h3 className="text-2xl font-extrabold text-ink">Что именно подтверждено</h3>
                <div className="mt-5 space-y-3 text-sm leading-7 text-slate-600">
                  <p>Сертификат привязан к конкретному сотруднику и конкретному курсу.</p>
                  <p>Дата выдачи и код проверки совпадают с записью, сохранённой в системе.</p>
                  <p>Подпись руководителя и цифровой отпечаток фиксируют официальный выпуск документа.</p>
                </div>
              </div>

              <div className="panel">
                <h3 className="text-2xl font-extrabold text-ink">Следующие действия</h3>
                <div className="mt-5 flex flex-wrap gap-3">
                  <button className="btn-secondary" type="button" onClick={handleLookup}>
                    Проверить другой код
                  </button>
                  <Link className="btn-secondary" to="/login">
                    Войти в систему
                  </Link>
                  {certificate.verificationUrl ? (
                    <a
                      className="btn-primary"
                      href={certificate.verificationUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Открыть ссылку проверки
                    </a>
                  ) : null}
                </div>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}
