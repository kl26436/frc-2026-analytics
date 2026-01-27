import { Link } from 'react-router-dom';
import { Handshake, Radio } from 'lucide-react';
import { useAllianceSelectionStore } from '../store/useAllianceSelectionStore';

function ActiveSessionBanner() {
  const lastSessionCode = useAllianceSelectionStore(state => state.lastSessionCode);
  const activeSessionId = useAllianceSelectionStore(state => state.activeSessionId);

  if (!lastSessionCode || !activeSessionId) return null;

  return (
    <Link
      to={`/alliance-selection/${lastSessionCode}`}
      className="flex items-center gap-3 px-4 py-3 bg-success/10 border border-success/30 rounded-lg hover:bg-success/20 transition-colors"
    >
      <Radio size={18} className="text-success animate-pulse" />
      <div className="flex-1">
        <span className="font-semibold text-success">Live Session Active</span>
        <span className="text-textSecondary text-sm ml-2 font-mono">{lastSessionCode}</span>
      </div>
      <Handshake size={18} className="text-success" />
    </Link>
  );
}

export default ActiveSessionBanner;
