import type { Alliance } from '../../types/allianceSelection';

interface AllianceCardProps {
  alliance: Alliance;
  isHighlighted: boolean;
  onHighlight: () => void;
}

function AllianceCard({ alliance, isHighlighted, onHighlight }: AllianceCardProps) {
  const slots = [
    { label: 'Capt', value: alliance.captain },
    { label: 'Pick 1', value: alliance.firstPick },
    { label: 'Pick 2', value: alliance.secondPick },
    { label: 'Backup', value: alliance.backupPick },
  ];

  const filledCount = slots.filter(s => s.value !== null).length;

  return (
    <button
      onClick={onHighlight}
      className={`w-full text-left p-2.5 rounded-lg border transition-colors ${
        isHighlighted
          ? 'border-success bg-success/10'
          : 'border-border bg-card hover:bg-interactive'
      }`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-bold">Alliance {alliance.number}</span>
        <span className="text-[10px] text-textMuted">{filledCount}/4</span>
      </div>

      <div className="space-y-0.5">
        {slots.map(slot => (
          <div key={slot.label} className="flex items-center gap-2 text-xs">
            <span className="text-textMuted w-10 flex-shrink-0">{slot.label}</span>
            {slot.value ? (
              <span className="font-semibold text-textPrimary">{slot.value}</span>
            ) : (
              <span className="text-textMuted">---</span>
            )}
          </div>
        ))}
      </div>
    </button>
  );
}

export default AllianceCard;
