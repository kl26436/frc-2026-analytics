import { NavLink, Outlet } from 'react-router-dom';
import { Shield, Database, Users, FileSpreadsheet, FlaskConical, AlertTriangle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface TabDef {
  to: string;
  icon: React.ElementType;
  label: string;
  end?: boolean;
}

const TABS: TabDef[] = [
  { to: '/admin/sync',         icon: Database,        label: 'Sync' },
  { to: '/admin/users',        icon: Users,           label: 'Users' },
  { to: '/admin/pre-scout',    icon: FileSpreadsheet, label: 'Pre-Scout' },
  { to: '/admin/calibration',  icon: FlaskConical,    label: 'Calibration' },
  { to: '/admin/danger-zone',  icon: AlertTriangle,   label: 'Danger Zone' },
];

function AdminSettings() {
  const { isAdmin } = useAuth();

  if (!isAdmin) {
    return (
      <div className="text-center py-16">
        <Shield size={48} className="mx-auto mb-4 text-textMuted" />
        <h2 className="text-xl font-bold mb-2">Admin Access Required</h2>
        <p className="text-textSecondary">Only admins can manage these settings.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Admin Settings</h1>
        <p className="text-textSecondary text-sm">Manage event configuration, sync, users, and pre-scout data.</p>
      </div>

      {/* Tab nav — sticky-ish: stays visible above each tab body */}
      <nav className="flex gap-1 overflow-x-auto border-b border-border -mx-1 px-1 pb-px">
        {TABS.map(tab => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              [
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors',
                isActive
                  ? tab.label === 'Danger Zone'
                    ? 'border-danger text-danger'
                    : 'border-success text-success'
                  : 'border-transparent text-textSecondary hover:text-textPrimary hover:bg-surfaceElevated/50',
              ].join(' ')
            }
          >
            <tab.icon size={16} />
            {tab.label}
          </NavLink>
        ))}
      </nav>

      {/* Active tab body */}
      <Outlet />
    </div>
  );
}

export default AdminSettings;
