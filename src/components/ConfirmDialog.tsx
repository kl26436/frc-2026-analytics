import { useState, useEffect, useRef } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface Props {
  open: boolean;
  title: string;
  message: string;
  // When set, user must type this exact string before Confirm activates.
  // Use for irreversible operations (e.g. "CLEAR" or "RESET").
  confirmText?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmText,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = true,
  onConfirm,
  onClose,
}: Props) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state when opened/closed
  useEffect(() => {
    if (open) {
      setTyped('');
      setBusy(false);
      // autofocus the input (if present) or first button
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // ESC closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const canConfirm = !confirmText || typed === confirmText;

  const handleConfirm = async () => {
    if (!canConfirm || busy) return;
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={`bg-surface rounded-xl border-2 ${destructive ? 'border-danger/50' : 'border-border'} shadow-card max-w-md w-full`}>
        {/* Header */}
        <div className={`flex items-start gap-3 px-5 py-4 border-b ${destructive ? 'border-danger/30 bg-danger/5' : 'border-border'}`}>
          {destructive && <AlertTriangle size={20} className="text-danger flex-shrink-0 mt-0.5" />}
          <div className="flex-1 min-w-0">
            <h2 className={`text-base font-bold ${destructive ? 'text-danger' : 'text-textPrimary'}`}>{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-interactive transition-colors text-textMuted"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          <p className="text-sm text-textSecondary leading-relaxed whitespace-pre-line">{message}</p>

          {confirmText && (
            <div>
              <label className="block text-xs font-semibold text-textSecondary mb-1.5">
                Type <span className="font-mono text-danger">{confirmText}</span> to confirm
              </label>
              <input
                ref={inputRef}
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && canConfirm) handleConfirm(); }}
                placeholder={confirmText}
                className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm font-mono text-textPrimary placeholder-textMuted focus:outline-none focus:border-danger"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-surfaceElevated rounded-b-xl">
          <button
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 text-sm font-medium text-textSecondary hover:text-textPrimary hover:bg-interactive rounded-lg transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm || busy}
            className={`px-4 py-2 text-sm font-bold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              destructive ? 'bg-danger text-white hover:bg-danger/90' : 'bg-success text-background hover:bg-success/90'
            }`}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
