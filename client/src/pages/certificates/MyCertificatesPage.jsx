import { useEffect, useState } from "react";
import { apiRequest } from "../../api/client.js";
import { PageHeader } from "../../components/PageHeader.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { formatDate } from "../../utils/format.js";

const extractYear = (value) => String(new Date(value).getFullYear());

export function MyCertificatesPage() {
  const { token } = useAuth();
  const [certificates, setCertificates] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [search, setSearch] = useState("");
  const [courseFilter, setCourseFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busyExport, setBusyExport] = useState(false);

  const loadCertificates = async () => {
    try {
      const result = await apiRequest("/certificates/my", { token });
      setCertificates(result);
      setError("");
    } catch (loadError) {
      setError(loadError.message);
    }
  };

  useEffect(() => {
    loadCertificates();
  }, [token]);

  const courseOptions = [...new Map(certificates.map((item) => [item.course?.id, item.course])).values()].filter(Boolean);
  const yearOptions = [...new Set(certificates.map((item) => extractYear(item.issuedAt)))].sort((left, right) => Number(right) - Number(left));
  const filteredCertificates = [...certificates]
    .filter((certificate) => {
      const query = search.trim().toLowerCase();
      const searchSource = [certificate.course?.title, certificate.verificationCode, certificate.company?.name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const matchesSearch = !query || searchSource.includes(query);
      const matchesCourse = courseFilter === "all" || String(certificate.course?.id) === courseFilter;
      const matchesYear = yearFilter === "all" || extractYear(certificate.issuedAt) === yearFilter;

      return matchesSearch && matchesCourse && matchesYear;
    })
    .sort((left, right) =>
      sortBy === "newest"
        ? new Date(right.issuedAt).getTime() - new Date(left.issuedAt).getTime()
        : new Date(left.issuedAt).getTime() - new Date(right.issuedAt).getTime()
    );

  const visibleIds = filteredCertificates.map((certificate) => certificate.id);
  const selectedVisibleCount = visibleIds.filter((id) => selectedIds.includes(id)).length;
  const currentYear = String(new Date().getFullYear());

  const toggleSelection = (certificateId) => {
    setSelectedIds((current) =>
      current.includes(certificateId)
        ? current.filter((id) => id !== certificateId)
        : [...current, certificateId]
    );
  };

  const toggleVisibleSelection = () => {
    if (selectedVisibleCount === visibleIds.length && visibleIds.length > 0) {
      setSelectedIds((current) => current.filter((id) => !visibleIds.includes(id)));
      return;
    }

    setSelectedIds((current) => [...new Set([...current, ...visibleIds])]);
  };

  const exportSelectedCertificates = async () => {
    if (selectedIds.length === 0) {
      setError("Сначала выберите хотя бы один сертификат.");
      setMessage("");
      return;
    }

    setBusyExport(true);
    setError("");
    setMessage("");

    try {
      const result = await apiRequest("/certificates/my/export", {
        method: "POST",
        token,
        body: {
          certificateIds: selectedIds
        }
      });

      const link = document.createElement("a");
      link.href = result.fileUrl;
      link.download = "certificates.zip";
      document.body.appendChild(link);
      link.click();
      link.remove();

      setMessage(`Архив готов. Внутри ${result.count} PDF-файлов.`);
    } catch (exportError) {
      setError(exportError.message);
    } finally {
      setBusyExport(false);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Сертификаты"
        title="Мои сертификаты и выгрузка PDF"
        description="Здесь собраны все подтверждения завершенного обучения. Можно быстро найти нужный документ, проверить его код и выгрузить выбранные PDF одним архивом."
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="metric-card">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Всего</p>
          <p className="mt-3 text-3xl font-extrabold text-ink">{certificates.length}</p>
          <p className="mt-2 text-sm text-slate-500">документов в архиве</p>
        </div>
        <div className="metric-card">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">За {currentYear}</p>
          <p className="mt-3 text-3xl font-extrabold text-ink">
            {certificates.filter((certificate) => extractYear(certificate.issuedAt) === currentYear).length}
          </p>
          <p className="mt-2 text-sm text-slate-500">получено в этом году</p>
        </div>
        <div className="metric-card">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">После фильтра</p>
          <p className="mt-3 text-3xl font-extrabold text-ink">{filteredCertificates.length}</p>
          <p className="mt-2 text-sm text-slate-500">подходящих сертификатов</p>
        </div>
        <div className="metric-card">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Выбрано</p>
          <p className="mt-3 text-3xl font-extrabold text-ink">{selectedIds.length}</p>
          <p className="mt-2 text-sm text-slate-500">для массовой выгрузки</p>
        </div>
      </section>

      {message ? (
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
          {error}
        </div>
      ) : null}

      <section className="panel space-y-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <input className="field" placeholder="Поиск по курсу или коду" value={search} onChange={(event) => setSearch(event.target.value)} />
          <select className="field" value={courseFilter} onChange={(event) => setCourseFilter(event.target.value)}>
            <option value="all">Все курсы</option>
            {courseOptions.map((course) => (
              <option key={course.id} value={course.id}>
                {course.title}
              </option>
            ))}
          </select>
          <select className="field" value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}>
            <option value="all">Все годы</option>
            {yearOptions.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
          <select className="field" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
            <option value="newest">Сначала новые</option>
            <option value="oldest">Сначала старые</option>
          </select>
        </div>

        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn-secondary" onClick={toggleVisibleSelection}>
            {selectedVisibleCount === visibleIds.length && visibleIds.length > 0
              ? "Снять выделение"
              : "Выбрать все отфильтрованные"}
          </button>
          <button type="button" className="btn-secondary" onClick={() => setSelectedIds([])}>
            Очистить выбор
          </button>
          <button type="button" className="btn-primary" onClick={exportSelectedCertificates} disabled={busyExport || selectedIds.length === 0}>
            {busyExport ? "Готовим архив..." : "Выгрузить выбранные PDF"}
          </button>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        {filteredCertificates.map((certificate) => (
          <article key={certificate.id} className="overflow-hidden rounded-4xl border border-[#d9cfb7] bg-[linear-gradient(135deg,_rgba(255,251,241,0.98),_rgba(255,243,220,0.9)_100%)] shadow-panel">
            <div className="p-6">
              <div className="flex items-start justify-between gap-4">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(certificate.id)}
                    onChange={() => toggleSelection(certificate.id)}
                  />
                  <span>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-600">
                      Сертификат обучения
                    </p>
                    <h2 className="mt-3 text-2xl font-extrabold text-ink">{certificate.course?.title}</h2>
                  </span>
                </label>
                <span className="rounded-full border border-white/70 bg-white/70 px-3 py-1 text-xs font-semibold text-slate-600">
                  {certificate.company?.name}
                </span>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="rounded-4xl bg-white/75 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Дата выдачи</p>
                  <p className="mt-2 text-base font-bold text-ink">{formatDate(certificate.issuedAt)}</p>
                </div>
                <div className="rounded-4xl bg-white/75 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Код проверки</p>
                  <p className="mono mt-2 text-sm font-semibold text-brand-700">{certificate.verificationCode}</p>
                </div>
              </div>

              <div className="mt-4 rounded-4xl border border-white/70 bg-white/68 px-4 py-4 text-sm text-slate-600">
                Подписано: <strong className="text-ink">{certificate.signedByName || "Директор компании"}</strong>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <a className="btn-secondary" href={certificate.certificateUrl} target="_blank" rel="noreferrer">
                  Открыть сертификат
                </a>
                {certificate.pdfUrl ? (
                  <a className="btn-primary" href={certificate.pdfUrl} target="_blank" rel="noreferrer">
                    Скачать PDF
                  </a>
                ) : null}
                <a className="btn-secondary" href={`/verify-certificate/${certificate.verificationCode}`} target="_blank" rel="noreferrer">
                  Проверить
                </a>
              </div>
            </div>
          </article>
        ))}

        {filteredCertificates.length === 0 ? (
          <div className="panel text-sm text-slate-500">
            По текущим фильтрам сертификаты не найдены.
          </div>
        ) : null}
      </section>
    </div>
  );
}
