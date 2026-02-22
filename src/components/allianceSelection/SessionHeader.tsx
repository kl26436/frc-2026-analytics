import { useState } from 'react';
import { Copy, Check, Share2, LogOut, Users, Pause, QrCode, X, AlertTriangle } from 'lucide-react';
import type { AllianceSelectionSession, SessionRole, SessionStatus } from '../../types/allianceSelection';

interface SessionHeaderProps {
  session: AllianceSelectionSession;
  myRole: SessionRole | null;
  isHost: boolean;
  onLeave: () => void;
  onSetStatus: (status: SessionStatus) => void;
  onShowParticipants: () => void;
  participantCount: number;
  pendingCount: number;
}

function SessionHeader({ session, myRole, isHost, onLeave, onSetStatus, onShowParticipants, participantCount, pendingCount }: SessionHeaderProps) {
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const [showQR, setShowQR] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);

  const shareLink = `${window.location.origin}${import.meta.env.BASE_URL}alliance-selection/join/${session.sessionCode}`;

  const copySessionCode = async () => {
    await navigator.clipboard.writeText(session.sessionCode);
    setCopied('code');
    setTimeout(() => setCopied(null), 2000);
  };

  const copyShareLink = async () => {
    await navigator.clipboard.writeText(shareLink);
    setCopied('link');
    setTimeout(() => setCopied(null), 2000);
  };

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(shareLink)}`;

  return (
    <>
      <div className="bg-surface rounded-lg border border-border p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Status badge */}
          <span className={`px-2 py-1 rounded text-xs font-semibold uppercase tracking-wide ${
            session.status === 'active'
              ? 'bg-success/20 text-success'
              : 'bg-textMuted/20 text-textMuted'
          }`}>
            {session.status === 'active' ? 'Live' : 'Completed'}
          </span>

          {/* Session code */}
          <button
            onClick={copySessionCode}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-card rounded border border-border hover:bg-interactive transition-colors"
            title="Copy session code"
          >
            <span className="font-mono font-bold tracking-widest">{session.sessionCode}</span>
            {copied === 'code' ? <Check size={14} className="text-success" /> : <Copy size={14} className="text-textSecondary" />}
          </button>

          {/* Share link */}
          <button
            onClick={copyShareLink}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-card rounded border border-border hover:bg-interactive transition-colors text-sm"
            title="Copy invite link"
          >
            {copied === 'link' ? <Check size={14} className="text-success" /> : <Share2 size={14} />}
            <span className="hidden sm:inline">{copied === 'link' ? 'Copied!' : 'Share Link'}</span>
          </button>

          {/* QR Code button */}
          <button
            onClick={() => setShowQR(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-card rounded border border-border hover:bg-interactive transition-colors text-sm"
            title="Show QR code"
          >
            <QrCode size={14} />
            <span className="hidden sm:inline">QR</span>
          </button>

          {/* Participants button */}
          <button
            onClick={onShowParticipants}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded border transition-colors text-sm ${
              pendingCount > 0
                ? 'bg-warning/10 border-warning/30 hover:bg-warning/20'
                : 'bg-card border-border hover:bg-interactive'
            }`}
          >
            <Users size={14} />
            <span>{participantCount}</span>
            {pendingCount > 0 && (
              <span className="bg-warning text-background text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center animate-pulse">
                {pendingCount}
              </span>
            )}
          </button>

          {/* Role badge */}
          {(myRole || isHost) && (
            <span className={`px-2 py-1 rounded text-xs font-semibold ${
              isHost
                ? 'bg-warning/20 text-warning'
                : myRole === 'editor'
                ? 'bg-blueAlliance/20 text-blueAlliance'
                : 'bg-textMuted/20 text-textMuted'
            }`}>
              {isHost ? 'host' : myRole}
            </span>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Host: end session (with confirmation) */}
          {isHost && session.status === 'active' && (
            <button
              onClick={() => setShowEndConfirm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-card rounded border border-border hover:bg-interactive transition-colors text-sm"
            >
              <Pause size={14} />
              <span className="hidden sm:inline">End</span>
            </button>
          )}

          {/* Leave */}
          <button
            onClick={onLeave}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-danger/10 border border-danger/30 text-danger rounded hover:bg-danger/20 transition-colors text-sm"
          >
            <LogOut size={14} />
            <span className="hidden sm:inline">Leave</span>
          </button>
        </div>
      </div>

      {/* End Session Confirmation */}
      {showEndConfirm && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={() => setShowEndConfirm(false)}
        >
          <div
            className="bg-surface rounded-lg border border-border p-6 max-w-sm w-full"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle size={24} className="text-warning" />
              <h3 className="font-bold text-lg">End Session?</h3>
            </div>
            <p className="text-textSecondary text-sm mb-6">
              This will end the alliance selection for everyone. All participants will be disconnected.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowEndConfirm(false)}
                className="flex-1 px-4 py-2.5 bg-card border border-border rounded-lg hover:bg-interactive transition-colors font-semibold text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowEndConfirm(false);
                  onSetStatus('completed');
                }}
                className="flex-1 px-4 py-2.5 bg-danger text-white rounded-lg hover:bg-danger/90 transition-colors font-semibold text-sm"
              >
                End Session
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      {showQR && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={() => setShowQR(false)}
        >
          <div
            className="bg-surface rounded-lg border border-border p-6 max-w-sm w-full text-center"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">Scan to Join</h3>
              <button onClick={() => setShowQR(false)} className="p-1 hover:bg-interactive rounded transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="bg-white rounded-lg p-4 inline-block mb-4">
              <img src={qrUrl} alt="QR Code" width={250} height={250} />
            </div>

            <p className="text-sm text-textSecondary mb-1">Session Code</p>
            <p className="font-mono font-bold text-2xl tracking-widest mb-3">{session.sessionCode}</p>

            <button
              onClick={copyShareLink}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blueAlliance text-white rounded-lg hover:bg-blueAlliance/90 transition-colors text-sm font-semibold"
            >
              {copied === 'link' ? <Check size={14} /> : <Share2 size={14} />}
              {copied === 'link' ? 'Link Copied!' : 'Copy Invite Link'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default SessionHeader;
