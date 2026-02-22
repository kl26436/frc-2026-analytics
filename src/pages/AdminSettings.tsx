import { useState } from 'react';
import { Shield, UserPlus, Trash2, Crown, Mail, UserCheck, UserX, Clock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

function AdminSettings() {
  const {
    isAdmin,
    accessConfig,
    accessRequests,
    addAllowedEmail,
    removeAllowedEmail,
    addAdminEmail,
    removeAdminEmail,
    approveRequest,
    denyRequest,
    user,
  } = useAuth();

  const [newEmail, setNewEmail] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  if (!isAdmin) {
    return (
      <div className="text-center py-16">
        <Shield size={48} className="mx-auto mb-4 text-textMuted" />
        <h2 className="text-xl font-bold mb-2">Admin Access Required</h2>
        <p className="text-textSecondary">Only admins can manage access settings.</p>
      </div>
    );
  }

  const handleAddEmail = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      setStatus('Please enter a valid email address.');
      return;
    }
    await addAllowedEmail(email);
    setNewEmail('');
    setStatus(`Added ${email} to allowed users.`);
    setTimeout(() => setStatus(null), 3000);
  };

  const handleApprove = async (email: string) => {
    await approveRequest(email);
    setStatus(`Approved ${email}.`);
    setTimeout(() => setStatus(null), 3000);
  };

  const handleDeny = async (email: string) => {
    await denyRequest(email);
    setStatus(`Denied request from ${email}.`);
    setTimeout(() => setStatus(null), 3000);
  };

  const handlePromoteToAdmin = async (email: string) => {
    if (confirm(`Make ${email} an admin? They will be able to manage the access list.`)) {
      await addAdminEmail(email);
      setStatus(`${email} is now an admin.`);
      setTimeout(() => setStatus(null), 3000);
    }
  };

  const handleDemoteFromAdmin = async (email: string) => {
    if (email.toLowerCase() === user?.email?.toLowerCase()) {
      if (!confirm('Are you sure you want to remove your own admin access?')) return;
    }
    await removeAdminEmail(email);
    setStatus(`${email} is no longer an admin.`);
    setTimeout(() => setStatus(null), 3000);
  };

  const handleRemoveEmail = async (email: string) => {
    if (confirm(`Remove ${email} from the access list? They will no longer be able to use the app.`)) {
      await removeAllowedEmail(email);
      if (accessConfig?.adminEmails.map(e => e.toLowerCase()).includes(email.toLowerCase())) {
        await removeAdminEmail(email);
      }
      setStatus(`Removed ${email}.`);
      setTimeout(() => setStatus(null), 3000);
    }
  };

  const allEmails = accessConfig?.allowedEmails ?? [];
  const adminEmails = new Set((accessConfig?.adminEmails ?? []).map(e => e.toLowerCase()));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Access Management</h1>
        <p className="text-textSecondary text-sm">
          Manage who can access the Data Wrangler app.
        </p>
      </div>

      {/* Pending Access Requests */}
      {accessRequests.length > 0 && (
        <div className="bg-warning/10 rounded-lg border-2 border-warning p-4 md:p-6">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-warning">
            <Clock size={20} />
            Pending Requests ({accessRequests.length})
          </h2>
          <div className="space-y-3">
            {accessRequests.map(request => (
              <div key={request.email} className="flex items-center gap-3 px-4 py-3 bg-surface rounded-lg border border-border">
                {request.photoURL ? (
                  <img src={request.photoURL} alt="" className="h-8 w-8 rounded-full flex-shrink-0" />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-surfaceElevated flex items-center justify-center flex-shrink-0">
                    <Mail size={14} className="text-textMuted" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">
                    {request.firstName && request.lastName
                      ? `${request.firstName} ${request.lastName}`
                      : request.displayName}
                  </p>
                  <p className="text-xs text-textSecondary truncate">{request.email}</p>
                </div>
                <span className="text-xs text-textMuted hidden sm:block">
                  {new Date(request.requestedAt).toLocaleDateString()}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleApprove(request.email)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-success text-background font-semibold rounded-lg hover:bg-success/90 transition-colors text-sm"
                  >
                    <UserCheck size={14} />
                    Approve
                  </button>
                  <button
                    onClick={() => handleDeny(request.email)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-danger/10 text-danger font-semibold rounded-lg hover:bg-danger/20 transition-colors text-sm"
                  >
                    <UserX size={14} />
                    Deny
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status message */}
      {status && (
        <div className="p-3 bg-success/10 border border-success/30 rounded-lg text-success text-sm">
          {status}
        </div>
      )}

      {/* Add new user */}
      <div className="bg-surface rounded-lg border border-border p-4 md:p-6">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <UserPlus size={20} />
          Add Team Member
        </h2>
        <div className="flex gap-3">
          <input
            type="email"
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddEmail()}
            placeholder="teammate@gmail.com"
            className="flex-1 px-4 py-2.5 bg-card border border-border rounded-lg text-textPrimary placeholder-textMuted focus:outline-none focus:border-success"
          />
          <button
            onClick={handleAddEmail}
            className="flex items-center gap-2 px-6 py-2.5 bg-success text-background font-semibold rounded-lg hover:bg-success/90 transition-colors"
          >
            <UserPlus size={18} />
            Add
          </button>
        </div>
      </div>

      {/* Current users */}
      <div className="bg-surface rounded-lg border border-border p-4 md:p-6">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Shield size={20} />
          Approved Users ({allEmails.length})
        </h2>

        {allEmails.length === 0 ? (
          <p className="text-textMuted text-center py-8">No users added yet. Add your first team member above.</p>
        ) : (
          <div className="space-y-2">
            {allEmails.map(email => {
              const isEmailAdmin = adminEmails.has(email.toLowerCase());
              const isMe = email.toLowerCase() === user?.email?.toLowerCase();

              return (
                <div key={email} className="flex items-center gap-3 px-4 py-3 bg-card rounded-lg">
                  <Mail size={16} className="text-textSecondary flex-shrink-0" />
                  <span className="flex-1 text-sm font-medium">
                    {email}
                    {isMe && <span className="text-textMuted ml-1">(you)</span>}
                  </span>

                  {isEmailAdmin && (
                    <span className="flex items-center gap-1 px-2 py-0.5 bg-warning/20 text-warning rounded text-xs font-semibold">
                      <Crown size={12} />
                      admin
                    </span>
                  )}

                  <div className="flex items-center gap-1">
                    {!isEmailAdmin ? (
                      <button
                        onClick={() => handlePromoteToAdmin(email)}
                        className="p-1.5 rounded text-textMuted hover:text-warning hover:bg-interactive transition-colors"
                        title="Make admin"
                      >
                        <Crown size={14} />
                      </button>
                    ) : (
                      adminEmails.size > 1 && (
                        <button
                          onClick={() => handleDemoteFromAdmin(email)}
                          className="p-1.5 rounded text-warning hover:text-textMuted hover:bg-interactive transition-colors"
                          title="Remove admin"
                        >
                          <Crown size={14} />
                        </button>
                      )
                    )}
                    <button
                      onClick={() => handleRemoveEmail(email)}
                      className="p-1.5 rounded text-textMuted hover:text-danger hover:bg-interactive transition-colors"
                      title="Remove access"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="bg-surfaceElevated rounded-lg border border-border p-4 text-sm text-textSecondary space-y-2">
        <p><strong>How it works:</strong></p>
        <ul className="list-disc list-inside space-y-1 text-textMuted">
          <li>Only emails on this list can sign in and use the app</li>
          <li>Team members can request access from the login page</li>
          <li>Admins can add/remove users and manage the access list</li>
          <li>Alliance selection join links still work for anyone (no account needed)</li>
          <li>The first person to sign in automatically becomes admin</li>
        </ul>
      </div>
    </div>
  );
}

export default AdminSettings;
