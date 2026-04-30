import { useState } from 'react';
import { Shield, UserPlus, Trash2, Crown, UserCheck, UserX, Clock, Pencil, Check, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import ConfirmDialog from '../../components/ConfirmDialog';

export default function UsersTab() {
  const {
    accessConfig,
    accessRequests,
    addAllowedEmail,
    removeAllowedEmail,
    addAdminEmail,
    removeAdminEmail,
    approveRequest,
    denyRequest,
    user,
    userProfiles,
    setUserProfile,
  } = useAuth();

  const [newEmail, setNewEmail] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [editFirst, setEditFirst] = useState('');
  const [editLast, setEditLast] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Promote / demote / remove confirmation modal state
  const [confirmAction, setConfirmAction] = useState<
    | { kind: 'promote'; email: string }
    | { kind: 'demote'; email: string }
    | { kind: 'remove'; email: string }
    | null
  >(null);

  const flash = (msg: string) => {
    setStatus(msg);
    setTimeout(() => setStatus(null), 3000);
  };

  const handleAddEmail = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) { flash('Please enter a valid email address.'); return; }
    await addAllowedEmail(email);
    setNewEmail('');
    flash(`Added ${email} to allowed users.`);
  };

  const handleApprove = async (email: string) => {
    await approveRequest(email);
    flash(`Approved ${email}.`);
  };

  const handleDeny = async (email: string) => {
    await denyRequest(email);
    flash(`Denied request from ${email}.`);
  };

  const startEditing = (email: string) => {
    const profile = userProfiles[email.toLowerCase()];
    setEditFirst(profile?.firstName ?? '');
    setEditLast(profile?.lastName ?? '');
    setEditingEmail(email.toLowerCase());
  };

  const handleSaveName = async () => {
    if (!editingEmail) return;
    setEditSaving(true);
    await setUserProfile(editingEmail, { firstName: editFirst.trim(), lastName: editLast.trim() });
    setEditSaving(false);
    setEditingEmail(null);
    flash(`Updated name for ${editingEmail}.`);
  };

  const allEmails = accessConfig?.allowedEmails ?? [];
  const adminEmails = new Set((accessConfig?.adminEmails ?? []).map(e => e.toLowerCase()));

  const confirmTitle =
    !confirmAction ? '' :
    confirmAction.kind === 'promote' ? 'Promote to admin?' :
    confirmAction.kind === 'demote'  ? 'Remove admin access?' :
                                       'Remove user access?';

  const confirmMessage =
    !confirmAction ? '' :
    confirmAction.kind === 'promote'
      ? `${confirmAction.email} will be able to manage the access list, sync data, and configure the event.`
    : confirmAction.kind === 'demote'
      ? `${confirmAction.email} will lose admin privileges. ${confirmAction.email.toLowerCase() === user?.email?.toLowerCase() ? 'This is YOUR account — you will lose admin access immediately.' : 'They will keep app access as a regular user.'}`
      : `${confirmAction.email} will no longer be able to use the app. This removes both regular access and any admin role they may hold.`;

  const handleConfirm = async () => {
    if (!confirmAction) return;
    if (confirmAction.kind === 'promote') {
      await addAdminEmail(confirmAction.email);
      flash(`${confirmAction.email} is now an admin.`);
    } else if (confirmAction.kind === 'demote') {
      await removeAdminEmail(confirmAction.email);
      flash(`${confirmAction.email} is no longer an admin.`);
    } else {
      await removeAllowedEmail(confirmAction.email);
      if (adminEmails.has(confirmAction.email.toLowerCase())) {
        await removeAdminEmail(confirmAction.email);
      }
      flash(`Removed ${confirmAction.email}.`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-xs text-textMuted">
        {allEmails.length} approved · {adminEmails.size} admin · {accessRequests.length} pending
      </div>

      {status && (
        <div className="p-3 bg-success/10 border border-success/30 rounded-lg text-success text-sm">
          {status}
        </div>
      )}

      {/* Pending requests */}
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
                  <div className="h-8 w-8 rounded-full bg-surfaceElevated flex items-center justify-center flex-shrink-0 text-sm font-bold text-textSecondary">
                    {(request.firstName?.[0] ?? request.email[0]).toUpperCase()}
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

      {/* Approved users */}
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
              const normalizedEmail = email.toLowerCase();
              const profile = userProfiles[normalizedEmail];
              const isEmailAdmin = adminEmails.has(normalizedEmail);
              const isMe = normalizedEmail === user?.email?.toLowerCase();
              const isEditing = editingEmail === normalizedEmail;
              const initials = profile
                ? `${profile.firstName?.[0] ?? ''}${profile.lastName?.[0] ?? ''}`.toUpperCase() || normalizedEmail[0].toUpperCase()
                : normalizedEmail[0].toUpperCase();
              const displayName = profile
                ? `${profile.firstName} ${profile.lastName}`.trim() || profile.displayName
                : null;

              return (
                <div key={email} className="bg-card rounded-lg overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3">
                    {profile?.photoURL ? (
                      <img src={profile.photoURL} alt="" className="h-9 w-9 rounded-full flex-shrink-0" />
                    ) : (
                      <div className="h-9 w-9 rounded-full bg-surfaceElevated flex items-center justify-center flex-shrink-0 text-sm font-bold text-textSecondary">
                        {initials}
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      {displayName ? (
                        <>
                          <p className="text-sm font-semibold leading-tight">
                            {displayName}
                            {isMe && <span className="text-textMuted font-normal ml-1">(you)</span>}
                          </p>
                          <p className="text-xs text-textSecondary truncate">{email}</p>
                        </>
                      ) : (
                        <p className="text-sm font-medium">
                          {email}
                          {isMe && <span className="text-textMuted ml-1">(you)</span>}
                        </p>
                      )}
                    </div>

                    {isEmailAdmin && (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-warning/20 text-warning rounded text-xs font-semibold">
                        <Crown size={12} />
                        admin
                      </span>
                    )}

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => isEditing ? setEditingEmail(null) : startEditing(email)}
                        className={`p-1.5 rounded transition-colors ${isEditing ? 'text-blueAlliance bg-interactive' : 'text-textMuted hover:text-blueAlliance hover:bg-interactive'}`}
                        title="Edit name"
                      >
                        <Pencil size={14} />
                      </button>

                      {!isEmailAdmin ? (
                        <button
                          onClick={() => setConfirmAction({ kind: 'promote', email })}
                          className="p-1.5 rounded text-textMuted hover:text-warning hover:bg-interactive transition-colors"
                          title="Make admin"
                        >
                          <Crown size={14} />
                        </button>
                      ) : (
                        adminEmails.size > 1 && (
                          <button
                            onClick={() => setConfirmAction({ kind: 'demote', email })}
                            className="p-1.5 rounded text-warning hover:text-textMuted hover:bg-interactive transition-colors"
                            title="Remove admin"
                          >
                            <Crown size={14} />
                          </button>
                        )
                      )}
                      <button
                        onClick={() => setConfirmAction({ kind: 'remove', email })}
                        className="p-1.5 rounded text-textMuted hover:text-danger hover:bg-interactive transition-colors"
                        title="Remove access"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {isEditing && (
                    <div className="px-4 pb-3 border-t border-border/50 pt-3 flex items-center gap-2">
                      <input
                        type="text"
                        value={editFirst}
                        onChange={e => setEditFirst(e.target.value)}
                        placeholder="First name"
                        className="flex-1 px-3 py-1.5 bg-background border border-border rounded-lg text-textPrimary placeholder-textMuted focus:outline-none focus:border-blueAlliance text-sm"
                        onKeyDown={e => e.key === 'Enter' && handleSaveName()}
                        autoFocus
                      />
                      <input
                        type="text"
                        value={editLast}
                        onChange={e => setEditLast(e.target.value)}
                        placeholder="Last name"
                        className="flex-1 px-3 py-1.5 bg-background border border-border rounded-lg text-textPrimary placeholder-textMuted focus:outline-none focus:border-blueAlliance text-sm"
                        onKeyDown={e => e.key === 'Enter' && handleSaveName()}
                      />
                      <button
                        onClick={handleSaveName}
                        disabled={editSaving}
                        className="p-1.5 rounded bg-success text-background hover:bg-success/90 transition-colors disabled:opacity-60"
                        title="Save name"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={() => setEditingEmail(null)}
                        className="p-1.5 rounded text-textMuted hover:text-danger hover:bg-interactive transition-colors"
                        title="Cancel"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!confirmAction}
        title={confirmTitle}
        message={confirmMessage}
        confirmLabel={confirmAction?.kind === 'promote' ? 'Promote' : confirmAction?.kind === 'demote' ? 'Remove admin' : 'Remove access'}
        destructive={confirmAction?.kind !== 'promote'}
        onConfirm={handleConfirm}
        onClose={() => setConfirmAction(null)}
      />
    </div>
  );
}
