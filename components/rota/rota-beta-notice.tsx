/** The beta notice on every Rota page (Rota and Visits, test data only until the reviews are done). */
export default function RotaBetaNotice() {
  return (
    <section aria-label="Beta notice" className="glass-card border-amber-500/40 p-4">
      <h2 className="text-sm font-semibold text-amber-300">Beta: test data only</h2>
      <p className="mt-1 text-sm text-white/70">
        Rota and Visits is being built and tested on test data. Do not use it for real staff or service
        users yet. Before any real service user is recorded here, the clinical safety review and the Welsh
        record keeping research must be complete.
      </p>
    </section>
  );
}
