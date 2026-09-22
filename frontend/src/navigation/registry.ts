import {
  BarChart3,
  Boxes,
  CalendarClock,
  ClipboardList,
  FileSearch,
  Gauge,
  LayoutDashboard,
  LineChart,
  Receipt,
  ShieldCheck,
  ShoppingCart,
  Users,
  Wrench,
} from 'lucide-react'
import type { ComponentType } from 'react'
import type { Permission } from '@/api/types'

export interface NavModule {
  /** Stable key, also used as the route segment under /app. */
  key: string
  /** i18next key under `nav.*` for the display label. */
  labelKey: string
  path: string
  icon: ComponentType<{ size?: number; 'aria-hidden'?: boolean | 'true' | 'false' }>
  /** ANY-OF permissions required to see and enter this module. Empty = authenticated only. */
  requiredPermissions: ReadonlyArray<Permission>
  /** Stage 1 implements only the dashboard/home; every other module renders a pending placeholder. */
  implemented: boolean
}

/**
 * Permission-aware navigation/route registry for every planned module.
 * Later stages replace the `PendingModulePage` rendered for each
 * unimplemented module with its real screens, without changing the shell
 * or router structure that reads this registry.
 */
export const NAV_MODULES: ReadonlyArray<NavModule> = [
  {
    key: 'dashboard',
    labelKey: 'nav.dashboard',
    path: '/',
    icon: LayoutDashboard,
    requiredPermissions: [],
    implemented: true,
  },
  {
    key: 'access',
    labelKey: 'nav.access',
    path: '/access',
    icon: ShieldCheck,
    requiredPermissions: ['users.read', 'users.manage', 'roles.assign', 'scopes.manage'],
    implemented: true,
  },
  {
    key: 'customers',
    labelKey: 'nav.customers',
    path: '/customers',
    icon: Users,
    requiredPermissions: ['customers.read'],
    implemented: true,
  },
  {
    key: 'vehicles',
    labelKey: 'nav.vehicles',
    path: '/vehicles',
    icon: Wrench,
    requiredPermissions: ['vehicles.read'],
    implemented: true,
  },
  {
    key: 'bays',
    labelKey: 'nav.bays',
    path: '/bays',
    icon: CalendarClock,
    requiredPermissions: ['bays.read'],
    implemented: true,
  },
  {
    key: 'jobs',
    labelKey: 'nav.jobs',
    path: '/jobs',
    icon: ClipboardList,
    requiredPermissions: ['jobs.read', 'jobs.read.assigned'],
    implemented: true,
  },
  {
    key: 'inventory',
    labelKey: 'nav.inventory',
    path: '/inventory/parts',
    icon: Boxes,
    requiredPermissions: [
      'inventory.read',
      'parts.read',
      'stores.manage',
      'inventory.adjust',
      'inventory.adjust.approve',
    ],
    implemented: true,
  },
  {
    key: 'purchasing',
    labelKey: 'nav.purchasing',
    path: '/purchasing/orders',
    icon: ShoppingCart,
    requiredPermissions: ['purchasing.read', 'vendors.read'],
    implemented: true,
  },
  {
    key: 'invoices',
    labelKey: 'nav.invoices',
    path: '/invoices',
    icon: Receipt,
    requiredPermissions: ['invoices.read'],
    implemented: true,
  },
  {
    key: 'training',
    labelKey: 'nav.training',
    path: '/training',
    icon: Gauge,
    requiredPermissions: [
      'training.read',
      'students.self',
      'training.manage',
      'training.publish',
      'training.override-conflict',
      'training.attendance.record',
      'training.assess',
      'training.signoff',
      'certificates.issue',
      'certificates.revoke',
    ],
    implemented: true,
  },
  {
    key: 'reports',
    labelKey: 'nav.reports',
    path: '/reports',
    icon: BarChart3,
    requiredPermissions: [
      'exports.read',
      'exports.create',
      'dashboards.workshop',
      'dashboards.inventory-finance',
      'dashboards.training',
      'dashboards.ai-data',
    ],
    implemented: true,
  },
  {
    key: 'predictions',
    labelKey: 'nav.predictions',
    path: '/predictions',
    icon: LineChart,
    requiredPermissions: ['predictions.reorder.read', 'predictions.risk.read'],
    implemented: true,
  },
  {
    key: 'audit',
    labelKey: 'nav.audit',
    path: '/audit',
    icon: FileSearch,
    requiredPermissions: ['audit.read'],
    implemented: true,
  },
]
