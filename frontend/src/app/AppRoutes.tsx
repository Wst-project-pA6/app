import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { PermissionGate } from '@/auth/PermissionRoute'
import { ProtectedRoute } from '@/auth/ProtectedRoute'
import { AppShell } from '@/layout/AppShell'
import { ModuleTheme } from '@/layout/ModuleTheme'
import { NAV_MODULES } from '@/navigation/registry'
import { ChangePasswordPage } from '@/pages/ChangePasswordPage/ChangePasswordPage'
import { ForbiddenPage } from '@/pages/ForbiddenPage/ForbiddenPage'
import { HomePage } from '@/pages/HomePage/HomePage'
import { LoginPage } from '@/pages/LoginPage/LoginPage'
import { RegisterPage } from '@/pages/RegisterPage/RegisterPage'
import { PendingAccessPage } from '@/pages/PendingAccessPage/PendingAccessPage'
import { NotFoundPage } from '@/pages/NotFoundPage/NotFoundPage'
import { PendingModulePage } from '@/pages/PendingModulePage/PendingModulePage'
import { UserListPage } from '@/pages/AccessManagement/UserListPage/UserListPage'
import { UserCreatePage } from '@/pages/AccessManagement/UserCreatePage/UserCreatePage'
import { UserDetailPage } from '@/pages/AccessManagement/UserDetailPage/UserDetailPage'
import { ScopeListPage } from '@/pages/AccessManagement/ScopeListPage/ScopeListPage'
import { CustomerListPage } from '@/pages/Customers/CustomerListPage/CustomerListPage'
import { CustomerCreatePage } from '@/pages/Customers/CustomerCreatePage/CustomerCreatePage'
import { CustomerDetailPage } from '@/pages/Customers/CustomerDetailPage/CustomerDetailPage'
import { VehicleListPage } from '@/pages/Vehicles/VehicleListPage/VehicleListPage'
import { VehicleCreatePage } from '@/pages/Vehicles/VehicleCreatePage/VehicleCreatePage'
import { VehicleDetailPage } from '@/pages/Vehicles/VehicleDetailPage/VehicleDetailPage'
import { BayListPage } from '@/pages/Bays/BayListPage/BayListPage'
import { BayCalendarPage } from '@/pages/Bays/BayCalendarPage/BayCalendarPage'
import { JobListPage } from '@/pages/Jobs/JobListPage/JobListPage'
import { JobCreatePage } from '@/pages/Jobs/JobCreatePage/JobCreatePage'
import { JobDetailPage } from '@/pages/Jobs/JobDetailPage/JobDetailPage'
import { StoreListPage } from '@/pages/Inventory/StoreListPage/StoreListPage'
import { PartListPage } from '@/pages/Inventory/PartListPage/PartListPage'
import { PartDetailPage } from '@/pages/Inventory/PartDetailPage/PartDetailPage'
import { StockMovementsPage } from '@/pages/Inventory/StockMovementsPage/StockMovementsPage'
import { StockReconciliationPage } from '@/pages/Inventory/StockReconciliationPage/StockReconciliationPage'
import { StockAdjustmentsPage } from '@/pages/Inventory/StockAdjustmentsPage/StockAdjustmentsPage'
import { VendorListPage } from '@/pages/Purchasing/VendorListPage/VendorListPage'
import { PurchaseOrderListPage } from '@/pages/Purchasing/PurchaseOrderListPage/PurchaseOrderListPage'
import { PurchaseOrderCreatePage } from '@/pages/Purchasing/PurchaseOrderCreatePage/PurchaseOrderCreatePage'
import { PurchaseOrderDetailPage } from '@/pages/Purchasing/PurchaseOrderDetailPage/PurchaseOrderDetailPage'
import { ApprovalPolicyPage } from '@/pages/Purchasing/ApprovalPolicyPage/ApprovalPolicyPage'
import { InvoiceListPage } from '@/pages/Invoices/InvoiceListPage'
import { InvoiceDetailPage } from '@/pages/Invoices/InvoiceDetailPage'
import { CustomerStatementPage } from '@/pages/Customers/CustomerStatementPage/CustomerStatementPage'
import { ReportsPage } from '@/pages/Reports/ReportsPage'
import { ExportsPage } from '@/pages/Reports/ExportsPage'
import { AuditListPage } from '@/pages/Audit/AuditListPage'
import { AuditDetailPage } from '@/pages/Audit/AuditDetailPage'
import { TrainingPage } from '@/pages/Training/TrainingPage'
import { PublicCertificatePage } from '@/pages/Training/PublicCertificatePage'
import { PredictionListPage } from '@/pages/Predictions/PredictionListPage'
import { PredictionDetailPage } from '@/pages/Predictions/PredictionDetailPage'
import { PredictionSettingsPage } from '@/pages/Predictions/PredictionSettingsPage'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/public/certificate-verifications/:verificationToken" element={<PublicCertificatePage />} />
      <Route
        path="/change-password"
        element={
          <ProtectedRoute>
            <ChangePasswordPage />
          </ProtectedRoute>
        }
      />

      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route index element={<HomePage />} />
        <Route
          path="training"
          element={
            <ModuleTheme module="training">
              <TrainingPage />
            </ModuleTheme>
          }
        />
        <Route
          path="training/:section"
          element={
            <ModuleTheme module="training">
              <TrainingPage />
            </ModuleTheme>
          }
        />
        <Route
          path="training/:section/:recordId"
          element={
            <ModuleTheme module="training">
              <TrainingPage />
            </ModuleTheme>
          }
        />

        <Route
          path="access"
          element={
            <ModuleTheme module="access">
              <Outlet />
            </ModuleTheme>
          }
        >
          <Route index element={<Navigate to="users" replace />} />
          <Route
            path="users"
            element={
              <PermissionGate anyOf={['users.read']}>
                <UserListPage />
              </PermissionGate>
            }
          />
          <Route
            path="users/new"
            element={
              <PermissionGate anyOf={['users.manage']}>
                <UserCreatePage />
              </PermissionGate>
            }
          />
          <Route
            path="users/:userId"
            element={
              <PermissionGate anyOf={['users.read']}>
                <UserDetailPage />
              </PermissionGate>
            }
          />
          <Route
            path="scopes"
            element={
              <PermissionGate anyOf={['scopes.manage', 'users.read']}>
                <ScopeListPage />
              </PermissionGate>
            }
          />
        </Route>

        <Route
          path="customers"
          element={
            <ModuleTheme module="customers">
              <Outlet />
            </ModuleTheme>
          }
        >
          <Route
            index
            element={
              <PermissionGate anyOf={['customers.read']}>
                <CustomerListPage />
              </PermissionGate>
            }
          />
          <Route
            path="new"
            element={
              <PermissionGate anyOf={['customers.write']}>
                <CustomerCreatePage />
              </PermissionGate>
            }
          />
          <Route
            path=":customerId"
            element={
              <PermissionGate anyOf={['customers.read']}>
                <CustomerDetailPage />
              </PermissionGate>
            }
          />
        </Route>

        <Route
          path="vehicles"
          element={
            <ModuleTheme module="vehicles">
              <Outlet />
            </ModuleTheme>
          }
        >
          <Route
            index
            element={
              <PermissionGate anyOf={['vehicles.read']}>
                <VehicleListPage />
              </PermissionGate>
            }
          />
          <Route
            path="new"
            element={
              <PermissionGate anyOf={['vehicles.write']}>
                <VehicleCreatePage />
              </PermissionGate>
            }
          />
          <Route
            path=":vehicleId"
            element={
              <PermissionGate anyOf={['vehicles.read']}>
                <VehicleDetailPage />
              </PermissionGate>
            }
          />
        </Route>

        <Route
          path="bays"
          element={
            <ModuleTheme module="bays">
              <Outlet />
            </ModuleTheme>
          }
        >
          <Route
            index
            element={
              <PermissionGate anyOf={['bays.read']}>
                <BayListPage />
              </PermissionGate>
            }
          />
          <Route
            path=":bayId/calendar"
            element={
              <PermissionGate anyOf={['bays.read']}>
                <BayCalendarPage />
              </PermissionGate>
            }
          />
        </Route>

        <Route
          path="jobs"
          element={
            <ModuleTheme module="jobs">
              <Outlet />
            </ModuleTheme>
          }
        >
          <Route
            index
            element={
              <PermissionGate anyOf={['jobs.read', 'jobs.read.assigned']}>
                <JobListPage />
              </PermissionGate>
            }
          />
          <Route
            path="new"
            element={
              <PermissionGate anyOf={['jobs.create']}>
                <JobCreatePage />
              </PermissionGate>
            }
          />
          <Route
            path=":jobId"
            element={
              <PermissionGate anyOf={['jobs.read', 'jobs.read.assigned']}>
                <JobDetailPage />
              </PermissionGate>
            }
          />
        </Route>

        <Route
          path="inventory"
          element={
            <ModuleTheme module="inventory">
              <Outlet />
            </ModuleTheme>
          }
        >
          <Route index element={<Navigate to="parts" replace />} />
          <Route
            path="parts"
            element={
              <PermissionGate anyOf={['parts.read']}>
                <PartListPage />
              </PermissionGate>
            }
          />
          <Route
            path="parts/:partId"
            element={
              <PermissionGate anyOf={['parts.read']}>
                <PartDetailPage />
              </PermissionGate>
            }
          />
          <Route
            path="stores"
            element={
              <PermissionGate anyOf={['inventory.read', 'stores.manage']}>
                <StoreListPage />
              </PermissionGate>
            }
          />
          <Route
            path="movements"
            element={
              <PermissionGate anyOf={['inventory.read']}>
                <StockMovementsPage />
              </PermissionGate>
            }
          />
          <Route
            path="reconciliation"
            element={
              <PermissionGate anyOf={['inventory.read']}>
                <StockReconciliationPage />
              </PermissionGate>
            }
          />
          <Route
            path="adjustments"
            element={
              <PermissionGate anyOf={['inventory.adjust', 'inventory.adjust.approve', 'inventory.read']}>
                <StockAdjustmentsPage />
              </PermissionGate>
            }
          />
        </Route>

        <Route
          path="purchasing"
          element={
            <ModuleTheme module="purchasing">
              <Outlet />
            </ModuleTheme>
          }
        >
          <Route index element={<Navigate to="orders" replace />} />
          <Route
            path="vendors"
            element={
              <PermissionGate anyOf={['vendors.read']}>
                <VendorListPage />
              </PermissionGate>
            }
          />
          <Route
            path="orders"
            element={
              <PermissionGate anyOf={['purchasing.read']}>
                <PurchaseOrderListPage />
              </PermissionGate>
            }
          />
          <Route
            path="orders/new"
            element={
              <PermissionGate anyOf={['purchasing.create']}>
                <PurchaseOrderCreatePage />
              </PermissionGate>
            }
          />
          <Route
            path="orders/:purchaseOrderId"
            element={
              <PermissionGate anyOf={['purchasing.read']}>
                <PurchaseOrderDetailPage />
              </PermissionGate>
            }
          />
          <Route
            path="approval-policy"
            element={
              <PermissionGate anyOf={['config.read', 'config.manage']}>
                <ApprovalPolicyPage />
              </PermissionGate>
            }
          />
        </Route>

        <Route
          path="invoices"
          element={
            <ModuleTheme module="invoices">
              <Outlet />
            </ModuleTheme>
          }
        >
          <Route
            index
            element={
              <PermissionGate anyOf={['invoices.read']}>
                <InvoiceListPage />
              </PermissionGate>
            }
          />
          <Route
            path=":invoiceId"
            element={
              <PermissionGate anyOf={['invoices.read']}>
                <InvoiceDetailPage />
              </PermissionGate>
            }
          />
        </Route>

        <Route
          path="customers/:customerId/statement"
          element={
            <ModuleTheme module="invoices">
              <PermissionGate anyOf={['invoices.read']}>
                <CustomerStatementPage />
              </PermissionGate>
            </ModuleTheme>
          }
        />

        <Route path="reports">
          <Route
            index
            element={
              <PermissionGate
                anyOf={[
                  'dashboards.workshop',
                  'dashboards.inventory-finance',
                  'dashboards.training',
                  'dashboards.ai-data',
                  'exports.read',
                  'exports.create',
                ]}
              >
                <ReportsPage />
              </PermissionGate>
            }
          />
          <Route
            path="exports"
            element={
              <PermissionGate anyOf={['exports.read', 'exports.create']}>
                <ExportsPage />
              </PermissionGate>
            }
          />
          <Route
            path=":dashboard"
            element={
              <PermissionGate
                anyOf={[
                  'dashboards.workshop',
                  'dashboards.inventory-finance',
                  'dashboards.training',
                  'dashboards.ai-data',
                ]}
              >
                <ReportsPage />
              </PermissionGate>
            }
          />
        </Route>

        <Route
          path="audit"
          element={
            <ModuleTheme module="audit">
              <Outlet />
            </ModuleTheme>
          }
        >
          <Route
            index
            element={
              <PermissionGate anyOf={['audit.read']}>
                <AuditListPage />
              </PermissionGate>
            }
          />
          <Route
            path=":auditEventId"
            element={
              <PermissionGate anyOf={['audit.read']}>
                <AuditDetailPage />
              </PermissionGate>
            }
          />
        </Route>

        <Route
          path="predictions"
          element={
            <ModuleTheme module="predictions">
              <Outlet />
            </ModuleTheme>
          }
        >
          <Route
            index
            element={
              <PermissionGate anyOf={['predictions.reorder.read', 'predictions.risk.read']}>
                <PredictionListPage />
              </PermissionGate>
            }
          />
          <Route
            path="settings"
            element={
              <PermissionGate anyOf={['config.read', 'config.manage']}>
                <PredictionSettingsPage />
              </PermissionGate>
            }
          />
          <Route
            path=":predictionId"
            element={
              <PermissionGate anyOf={['predictions.reorder.read', 'predictions.risk.read']}>
                <PredictionDetailPage />
              </PermissionGate>
            }
          />
        </Route>

        {NAV_MODULES.filter((module) => !module.implemented).map((module) => (
          <Route
            key={module.key}
            path={module.path.replace(/^\//, '')}
            element={
              <PermissionGate anyOf={module.requiredPermissions}>
                <PendingModulePage moduleLabelKey={module.labelKey} />
              </PermissionGate>
            }
          />
        ))}

        <Route path="pending-access" element={<PendingAccessPage />} />
        <Route path="forbidden" element={<ForbiddenPage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
