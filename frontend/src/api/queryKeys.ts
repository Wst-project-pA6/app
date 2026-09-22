/**
 * Central TanStack Query key factory. Keeping every key shape here means
 * mutations can invalidate the exact right list/detail keys without
 * guessing at string literals scattered across feature files.
 */
export const queryKeys = {
  users: {
    all: ['users'] as const,
    lists: () => [...queryKeys.users.all, 'list'] as const,
    list: (params: unknown) => [...queryKeys.users.lists(), params] as const,
    details: () => [...queryKeys.users.all, 'detail'] as const,
    detail: (userId: string) => [...queryKeys.users.details(), userId] as const,
  },
  roles: {
    all: ['roles'] as const,
    list: () => [...queryKeys.roles.all, 'list'] as const,
  },
  organizationScopes: {
    all: ['organizationScopes'] as const,
    lists: () => [...queryKeys.organizationScopes.all, 'list'] as const,
    list: (params: unknown) => [...queryKeys.organizationScopes.lists(), params] as const,
  },
  customers: {
    all: ['customers'] as const,
    lists: () => [...queryKeys.customers.all, 'list'] as const,
    list: (params: unknown) => [...queryKeys.customers.lists(), params] as const,
    details: () => [...queryKeys.customers.all, 'detail'] as const,
    detail: (customerId: string) => [...queryKeys.customers.details(), customerId] as const,
  },
  vehicles: {
    all: ['vehicles'] as const,
    lists: () => [...queryKeys.vehicles.all, 'list'] as const,
    list: (params: unknown) => [...queryKeys.vehicles.lists(), params] as const,
    details: () => [...queryKeys.vehicles.all, 'detail'] as const,
    detail: (vehicleId: string) => [...queryKeys.vehicles.details(), vehicleId] as const,
    serviceHistory: (vehicleId: string, params: unknown) =>
      [...queryKeys.vehicles.detail(vehicleId), 'serviceHistory', params] as const,
    reminders: (vehicleId: string, params: unknown) =>
      [...queryKeys.vehicles.detail(vehicleId), 'reminders', params] as const,
  },
  bays: {
    all: ['bays'] as const,
    lists: () => [...queryKeys.bays.all, 'list'] as const,
    list: (params: unknown) => [...queryKeys.bays.lists(), params] as const,
    calendar: (bayId: string, from: string, to: string) =>
      [...queryKeys.bays.all, 'calendar', bayId, from, to] as const,
  },
  technicians: {
    all: ['technicians'] as const,
    list: (params: unknown) => [...queryKeys.technicians.all, 'list', params] as const,
  },
  jobs: {
    all: ['jobs'] as const,
    lists: () => [...queryKeys.jobs.all, 'list'] as const,
    list: (params: unknown) => [...queryKeys.jobs.lists(), params] as const,
    details: () => [...queryKeys.jobs.all, 'detail'] as const,
    detail: (jobId: string) => [...queryKeys.jobs.details(), jobId] as const,
    stageHistory: (jobId: string, params: unknown) =>
      [...queryKeys.jobs.detail(jobId), 'stageHistory', params] as const,
    workItems: (jobId: string, params: unknown) => [...queryKeys.jobs.detail(jobId), 'workItems', params] as const,
    approvals: (jobId: string, params: unknown) => [...queryKeys.jobs.detail(jobId), 'approvals', params] as const,
    qualityChecks: (jobId: string, params: unknown) =>
      [...queryKeys.jobs.detail(jobId), 'qualityChecks', params] as const,
    laborEntries: (jobId: string, params: unknown) =>
      [...queryKeys.jobs.detail(jobId), 'laborEntries', params] as const,
    partIssues: (jobId: string, params: unknown) => [...queryKeys.jobs.detail(jobId), 'partIssues', params] as const,
    partReservations: (jobId: string, params: unknown) =>
      [...queryKeys.jobs.detail(jobId), 'partReservations', params] as const,
    attachments: (jobId: string, params: unknown) => [...queryKeys.jobs.detail(jobId), 'attachments', params] as const,
    invoiceSummary: (jobId: string) => [...queryKeys.jobs.detail(jobId), 'invoiceSummary'] as const,
  },
  stores: {
    all: ['stores'] as const,
    list: (params: unknown) => [...queryKeys.stores.all, 'list', params] as const,
  },
  parts: {
    all: ['parts'] as const,
    lists: () => [...queryKeys.parts.all, 'list'] as const,
    list: (params: unknown) => [...queryKeys.parts.lists(), params] as const,
    details: () => [...queryKeys.parts.all, 'detail'] as const,
    detail: (partId: string) => [...queryKeys.parts.details(), partId] as const,
  },
  stockBalances: {
    all: ['stockBalances'] as const,
    list: (params: unknown) => [...queryKeys.stockBalances.all, 'list', params] as const,
    reconciliation: (storeId: string | undefined) =>
      [...queryKeys.stockBalances.all, 'reconciliation', storeId] as const,
  },
  stockMovements: {
    all: ['stockMovements'] as const,
    list: (params: unknown) => [...queryKeys.stockMovements.all, 'list', params] as const,
  },
  stockAdjustments: {
    all: ['stockAdjustments'] as const,
    list: (params: unknown) => [...queryKeys.stockAdjustments.all, 'list', params] as const,
  },
  vendors: {
    all: ['vendors'] as const,
    list: (params: unknown) => [...queryKeys.vendors.all, 'list', params] as const,
  },
  purchaseOrders: {
    all: ['purchaseOrders'] as const,
    lists: () => [...queryKeys.purchaseOrders.all, 'list'] as const,
    list: (params: unknown) => [...queryKeys.purchaseOrders.lists(), params] as const,
    details: () => [...queryKeys.purchaseOrders.all, 'detail'] as const,
    detail: (purchaseOrderId: string) => [...queryKeys.purchaseOrders.details(), purchaseOrderId] as const,
    approvals: (purchaseOrderId: string, params: unknown) =>
      [...queryKeys.purchaseOrders.detail(purchaseOrderId), 'approvals', params] as const,
    goodsReceipts: (purchaseOrderId: string, params: unknown) =>
      [...queryKeys.purchaseOrders.detail(purchaseOrderId), 'goodsReceipts', params] as const,
  },
  purchaseApprovalPolicy: {
    all: ['purchaseApprovalPolicy'] as const,
  },
  invoices: {
    all: ['invoices'] as const,
    lists: () => [...queryKeys.invoices.all, 'list'] as const,
    list: (params: unknown) => [...queryKeys.invoices.lists(), params] as const,
    details: () => [...queryKeys.invoices.all, 'detail'] as const,
    detail: (invoiceId: string) => [...queryKeys.invoices.details(), invoiceId] as const,
  },
  statements: {
    all: ['statements'] as const,
    detail: (customerId: string, params: unknown) => [...queryKeys.statements.all, customerId, params] as const,
  },
  dashboards: {
    all: ['dashboards'] as const,
    detail: (dashboard: string, params: unknown) => [...queryKeys.dashboards.all, dashboard, params] as const,
  },
  exports: {
    all: ['exports'] as const,
    lists: () => [...queryKeys.exports.all, 'list'] as const,
    list: (params: unknown) => [...queryKeys.exports.lists(), params] as const,
    detail: (exportJobId: string) => [...queryKeys.exports.all, 'detail', exportJobId] as const,
  },
  training: {
    all: ['training'] as const,
    operation: (operation: string, params: unknown, query: unknown) => ['training', operation, params, query] as const,
  },
  audit: {
    all: ['audit'] as const,
    lists: () => [...queryKeys.audit.all, 'list'] as const,
    list: (params: unknown) => [...queryKeys.audit.lists(), params] as const,
    detail: (auditEventId: string) => [...queryKeys.audit.all, 'detail', auditEventId] as const,
  },
  predictions: {
    all: ['predictions'] as const,
    lists: () => [...queryKeys.predictions.all, 'list'] as const,
    list: (params: unknown) => [...queryKeys.predictions.lists(), params] as const,
    details: () => [...queryKeys.predictions.all, 'detail'] as const,
    detail: (predictionId: string) => [...queryKeys.predictions.details(), predictionId] as const,
  },
  predictionSettings: {
    all: ['predictionSettings'] as const,
  },
}
