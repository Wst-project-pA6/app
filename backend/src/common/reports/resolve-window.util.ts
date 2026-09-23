export interface DateWindow {
  from: Date;
  to: Date;
}

const DEFAULT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Shared by DashboardsService and ExportsService so a dashboard call and an export created with
 * the same `from`/`to` filters always aggregate over the identical window. When the caller omits
 * both, defaults to the trailing 30 days ending "now" so window-dependent metrics (e.g. bay/
 * technician utilization, which need a bounded denominator) always have a window to divide by.
 */
export function resolveReportWindow(filters: { from?: string; to?: string }, nowMs: number): DateWindow {
  const to = filters.to ? new Date(filters.to) : new Date(nowMs);
  const from = filters.from ? new Date(filters.from) : new Date(to.getTime() - DEFAULT_WINDOW_MS);
  return { from, to };
}
