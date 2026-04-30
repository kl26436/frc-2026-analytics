import { useState } from 'react';
import { AlertTriangle, Trash2, RotateCcw, Loader } from 'lucide-react';
import { doc, deleteDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { usePickListStore } from '../../store/usePickListStore';
import ConfirmDialog from '../../components/ConfirmDialog';

type DangerAction =
  | { kind: 'reset-personal-picklist' }
  | { kind: 'delete-live-picklist' }
  | { kind: 'reset-event-config' };

export default function DangerZoneTab() {
  const { eventConfig, setEventConfig } = useAuth();
  const clearPickList = usePickListStore(s => s.clearPickList);

  const [pending, setPending] = useState<DangerAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null);

  const flash = (kind: 'success' | 'error', msg: string) => {
    setStatus({ kind, msg });
    setTimeout(() => setStatus(null), 4000);
  };

  const titleFor = (action: DangerAction): string => {
    switch (action.kind) {
      case 'reset-personal-picklist':  return 'Reset your personal pick list?';
      case 'delete-live-picklist':     return 'Delete the live (shared) pick list?';
      case 'reset-event-config':       return 'Reset event configuration?';
    }
  };

  const messageFor = (action: DangerAction): string => {
    switch (action.kind) {
      case 'reset-personal-picklist':
        return 'Clears every team, tier, note, flag, and watchlist entry on YOUR local pick list. Other users keep their own personal lists. The shared live list is unaffected.\n\nThis cannot be undone.';
      case 'delete-live-picklist':
        return `Permanently deletes the shared live pick list for ${eventConfig?.eventCode ?? 'this event'} from Firestore — including every team, comment, suggestion, and rank order published to it. Every connected user will see it disappear.\n\nThis cannot be undone.`;
      case 'reset-event-config':
        return `Clears the event code and home team number for everyone. Connected users will see no active event until a new one is configured under the Sync tab. Local data (scout entries, pictures, etc.) is not deleted.\n\nThis cannot be undone.`;
    }
  };

  const confirmTextFor = (action: DangerAction): string => {
    switch (action.kind) {
      case 'reset-personal-picklist': return 'RESET';
      case 'delete-live-picklist':    return 'DELETE LIVE LIST';
      case 'reset-event-config':      return 'RESET EVENT';
    }
  };

  const handleConfirm = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      switch (pending.kind) {
        case 'reset-personal-picklist': {
          clearPickList();
          flash('success', 'Personal pick list cleared.');
          break;
        }
        case 'delete-live-picklist': {
          if (!eventConfig?.eventCode) {
            flash('error', 'No active event — nothing to delete.');
            break;
          }
          await deleteDoc(doc(db, 'pick-lists', eventConfig.eventCode));
          flash('success', `Live pick list for ${eventConfig.eventCode} deleted.`);
          break;
        }
        case 'reset-event-config': {
          await setEventConfig({ eventCode: '', homeTeamNumber: 0 });
          flash('success', 'Event configuration reset. Set a new event under the Sync tab.');
          break;
        }
      }
    } catch (err: unknown) {
      flash('error', err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 p-4 bg-danger/10 border border-danger/30 rounded-lg">
        <AlertTriangle size={20} className="text-danger flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-bold text-danger mb-1">Destructive actions</p>
          <p className="text-textSecondary">
            Each action below is irreversible and requires you to type a confirmation phrase.
            Avoid running these mid-event unless you mean it.
          </p>
        </div>
      </div>

      {status && (
        <div className={`p-3 rounded-lg text-sm ${
          status.kind === 'success'
            ? 'bg-success/10 border border-success/30 text-success'
            : 'bg-danger/10 border border-danger/30 text-danger'
        }`}>
          {status.msg}
        </div>
      )}

      <DangerCard
        icon={RotateCcw}
        title="Reset personal pick list"
        description="Clears your local picklist (teams, tiers, notes, flags, watchlist). Other users keep their own."
        buttonLabel="Reset personal list"
        busy={busy && pending?.kind === 'reset-personal-picklist'}
        onClick={() => setPending({ kind: 'reset-personal-picklist' })}
      />

      <DangerCard
        icon={Trash2}
        title="Delete live pick list"
        description="Removes the shared live picklist Firestore doc for the active event. Every connected user will see it disappear."
        buttonLabel="Delete live list"
        busy={busy && pending?.kind === 'delete-live-picklist'}
        onClick={() => setPending({ kind: 'delete-live-picklist' })}
      />

      <DangerCard
        icon={RotateCcw}
        title="Reset event configuration"
        description="Clears the active event code and home team for everyone. Use when starting fresh between competitions. Local scout data is preserved."
        buttonLabel="Reset event config"
        busy={busy && pending?.kind === 'reset-event-config'}
        onClick={() => setPending({ kind: 'reset-event-config' })}
      />

      <ConfirmDialog
        open={!!pending}
        title={pending ? titleFor(pending) : ''}
        message={pending ? messageFor(pending) : ''}
        confirmText={pending ? confirmTextFor(pending) : undefined}
        confirmLabel="Run it"
        destructive
        onConfirm={handleConfirm}
        onClose={() => setPending(null)}
      />
    </div>
  );
}

interface DangerCardProps {
  icon: React.ElementType;
  title: string;
  description: string;
  buttonLabel: string;
  busy: boolean;
  onClick: () => void;
}

function DangerCard({ icon: Icon, title, description, buttonLabel, busy, onClick }: DangerCardProps) {
  return (
    <div className="bg-surface rounded-lg border-2 border-danger/30 p-4 md:p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3 flex-1 min-w-[280px]">
          <Icon size={20} className="text-danger flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-base font-bold text-textPrimary">{title}</h3>
            <p className="text-sm text-textSecondary mt-1">{description}</p>
          </div>
        </div>
        <button
          onClick={onClick}
          disabled={busy}
          className="flex items-center gap-2 px-4 py-2 bg-danger/10 text-danger border border-danger/40 font-semibold rounded-lg hover:bg-danger/20 transition-colors text-sm disabled:opacity-50"
        >
          {busy ? <Loader size={14} className="animate-spin" /> : <AlertTriangle size={14} />}
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}
