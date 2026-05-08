export function StatCard({ label, value, hint }) {
  return (
    <div className="metric-card">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
        {label}
      </p>
      <p className="mt-4 text-4xl font-extrabold leading-none text-ink">{value}</p>
      {hint ? <p className="mt-3 text-sm leading-6 text-slate-500">{hint}</p> : null}
    </div>
  );
}
