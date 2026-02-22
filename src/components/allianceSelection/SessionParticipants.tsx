import { X, Shield, Edit3, Eye, Clock, UserMinus, ChevronUp, ChevronDown, ArrowRightLeft, UserCheck } from 'lucide-react';
import type { SessionParticipant } from '../../types/allianceSelection';

interface SessionParticipantsProps {
  participants: Record<string, SessionParticipant>;
  myUid: string;
  isHost: boolean;
  onAccept: (uid: string) => Promise<void>;
  onPromote: (uid: string) => Promise<void>;
  onDemote: (uid: string) => Promise<void>;
  onTransferHost: (uid: string) => Promise<void>;
  onRemove: (uid: string) => Promise<void>;
  onClose: () => void;
}

function SessionParticipants({ participants, myUid, isHost, onAccept, onPromote, onDemote, onTransferHost, onRemove, onClose }: SessionParticipantsProps) {
  const entries = Object.entries(participants).sort(([, a], [, b]) => {
    const roleOrder: Record<string, number> = { host: 0, editor: 1, viewer: 2, pending: 3 };
    return (roleOrder[a.role] ?? 4) - (roleOrder[b.role] ?? 4);
  });

  const pendingCount = Object.values(participants).filter(p => p.role === 'pending').length;

  const roleIcon = (role: SessionParticipant['role']) => {
    switch (role) {
      case 'host': return <Shield size={14} className="text-warning" />;
      case 'editor': return <Edit3 size={14} className="text-blueAlliance" />;
      case 'viewer': return <Eye size={14} className="text-textMuted" />;
      case 'pending': return <Clock size={14} className="text-warning" />;
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Drawer */}
      <div
        className="relative w-full max-w-sm bg-surface border-l border-border h-full overflow-y-auto shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-surface border-b border-border p-4 flex items-center justify-between z-10">
          <h3 className="font-bold text-lg">
            Participants ({entries.length})
            {pendingCount > 0 && (
              <span className="ml-2 text-xs font-semibold bg-warning/20 text-warning px-1.5 py-0.5 rounded">
                {pendingCount} pending
              </span>
            )}
          </h3>
          <button onClick={onClose} className="p-1.5 hover:bg-interactive rounded transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-2">
          {entries.map(([uid, participant]) => {
            const isMe = uid === myUid;
            const canModify = isHost && !isMe && participant.role !== 'host';

            return (
              <div key={uid} className={`flex items-center gap-2 px-3 py-2.5 rounded ${
                participant.role === 'pending' ? 'bg-warning/10 border border-warning/20' : 'bg-card'
              }`}>
                {roleIcon(participant.role)}

                <span className="flex-1 text-sm font-semibold min-w-0">
                  <span className="truncate block">
                    {participant.displayName}
                    {participant.teamNumber && (
                      <span className="text-textSecondary font-normal ml-1">#{participant.teamNumber}</span>
                    )}
                    {isMe && <span className="text-textMuted font-normal ml-1">(you)</span>}
                  </span>
                </span>

                <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${
                  participant.role === 'host'
                    ? 'bg-warning/20 text-warning'
                    : participant.role === 'editor'
                    ? 'bg-blueAlliance/20 text-blueAlliance'
                    : participant.role === 'pending'
                    ? 'bg-warning/20 text-warning'
                    : 'bg-textMuted/20 text-textMuted'
                }`}>
                  {participant.role}
                </span>

                {/* Pending users — Accept / Reject buttons */}
                {isHost && !isMe && participant.role === 'pending' && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => onAccept(uid)}
                      className="px-2 py-1 rounded bg-success/20 text-success hover:bg-success/30 transition-colors text-xs font-semibold flex items-center gap-1"
                      title="Accept"
                    >
                      <UserCheck size={12} />
                      Accept
                    </button>
                    <button
                      onClick={() => onRemove(uid)}
                      className="px-2 py-1 rounded bg-danger/20 text-danger hover:bg-danger/30 transition-colors text-xs font-semibold"
                      title="Reject"
                    >
                      <UserMinus size={12} />
                    </button>
                  </div>
                )}

                {/* Active participants — Promote/Demote/Transfer/Remove buttons */}
                {canModify && participant.role !== 'pending' && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {participant.role === 'viewer' ? (
                      <button
                        onClick={() => onPromote(uid)}
                        className="p-1 rounded hover:bg-interactive text-textSecondary hover:text-success transition-colors"
                        title="Promote to editor"
                      >
                        <ChevronUp size={14} />
                      </button>
                    ) : (
                      <button
                        onClick={() => onDemote(uid)}
                        className="p-1 rounded hover:bg-interactive text-textSecondary hover:text-warning transition-colors"
                        title="Demote to viewer"
                      >
                        <ChevronDown size={14} />
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (confirm(`Transfer host role to ${participant.displayName}? You will become an editor.`)) {
                          onTransferHost(uid);
                        }
                      }}
                      className="p-1 rounded hover:bg-interactive text-textSecondary hover:text-warning transition-colors"
                      title="Transfer host"
                    >
                      <ArrowRightLeft size={14} />
                    </button>
                    <button
                      onClick={() => onRemove(uid)}
                      className="p-1 rounded hover:bg-interactive text-textSecondary hover:text-danger transition-colors"
                      title="Remove"
                    >
                      <UserMinus size={14} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default SessionParticipants;
