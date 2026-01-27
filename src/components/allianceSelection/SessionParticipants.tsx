import { X, Shield, Edit3, Eye, UserMinus, ChevronUp, ChevronDown } from 'lucide-react';
import type { SessionParticipant } from '../../types/allianceSelection';

interface SessionParticipantsProps {
  participants: Record<string, SessionParticipant>;
  myUid: string;
  isAdmin: boolean;
  onPromote: (uid: string) => Promise<void>;
  onDemote: (uid: string) => Promise<void>;
  onRemove: (uid: string) => Promise<void>;
  onClose: () => void;
}

function SessionParticipants({ participants, myUid, isAdmin, onPromote, onDemote, onRemove, onClose }: SessionParticipantsProps) {
  const entries = Object.entries(participants).sort(([, a], [, b]) => {
    const roleOrder = { admin: 0, editor: 1, viewer: 2 };
    return roleOrder[a.role] - roleOrder[b.role];
  });

  const roleIcon = (role: SessionParticipant['role']) => {
    switch (role) {
      case 'admin': return <Shield size={14} className="text-warning" />;
      case 'editor': return <Edit3 size={14} className="text-blueAlliance" />;
      case 'viewer': return <Eye size={14} className="text-textMuted" />;
    }
  };

  return (
    <div className="bg-surface rounded-lg border border-border p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold">Participants ({entries.length})</h3>
        <button onClick={onClose} className="p-1 hover:bg-interactive rounded transition-colors">
          <X size={16} />
        </button>
      </div>

      <div className="space-y-2">
        {entries.map(([uid, participant]) => {
          const isMe = uid === myUid;
          const canModify = isAdmin && !isMe && participant.role !== 'admin';

          return (
            <div key={uid} className="flex items-center gap-2 px-3 py-2 rounded bg-card">
              {roleIcon(participant.role)}

              <span className="flex-1 text-sm font-semibold">
                {participant.displayName}
                {participant.teamNumber && (
                  <span className="text-textSecondary font-normal ml-1">#{participant.teamNumber}</span>
                )}
                {isMe && <span className="text-textMuted font-normal ml-1">(you)</span>}
              </span>

              <span className={`text-xs px-1.5 py-0.5 rounded ${
                participant.role === 'admin'
                  ? 'bg-warning/20 text-warning'
                  : participant.role === 'editor'
                  ? 'bg-blueAlliance/20 text-blueAlliance'
                  : 'bg-textMuted/20 text-textMuted'
              }`}>
                {participant.role}
              </span>

              {canModify && (
                <div className="flex items-center gap-1">
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
  );
}

export default SessionParticipants;
