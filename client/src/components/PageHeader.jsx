export function PageHeader({ eyebrow, title, action }) {
  return (
    <div className="overflow-hidden rounded-4xl border border-[#d5ddd7] bg-[linear-gradient(140deg,_rgba(255,251,245,0.98)_0%,_rgba(241,249,245,0.96)_54%,_rgba(255,239,217,0.9)_100%)] shadow-panel">
      <div className="grid gap-6 px-6 py-7 md:px-8 md:py-8 xl:grid-cols-[1fr,auto] xl:items-end">
        <div className="space-y-4">
          {eyebrow ? (
            <p className="inline-flex rounded-full border border-brand-100 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.26em] text-brand-700">
              {eyebrow}
            </p>
          ) : null}

          <div>
            <h1 className="max-w-4xl text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
              {title}
            </h1>
          </div>
        </div>

        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}
