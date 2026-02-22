import { Link } from 'react-router-dom';
import { Handshake, Radio } from 'lucide-react';
import { useAllianceSelectionStore } from '../store/useAllianceSelectionStore';
import { useAuth } from '../contexts/AuthContext';

function ActiveSessionBanner() {
  const lastSessionCode = useAllianceSelectionStore(state => state.lastSessionCode);
  const activeSessionId = useAllianceSelectionStore(state => state.activeSessionId);
  const { liveSession } = useAuth();

  // User is already in a session — show rejoin banner
  if (lastSessionCode && activeSessionId) {
    return (
      <Link
        to={`/alliance-selection/${lastSessionCode}`}
        className="flex items-center gap-3 px-4 py-3 mb-4 bg-success/10 border border-success/30 rounded-lg hover:bg-success/20 transition-colors"
      >
        <Radio size={18} className="text-success animate-pulse" />
        <div className="flex-1">
          <span className="font-semibold text-success">Live Alliance Selection</span>
          <span className="text-textSecondary text-sm ml-2 font-mono">{lastSessionCode}</span>
        </div>
        <Handshake size={18} className="text-success" />
      </Link>
    );
  }

  // There's a live session broadcast that the user hasn't joined yet
  if (liveSession) {
    return (
      <Link
        to={`/alliance-selection/${liveSession.sessionCode}`}
        className="flex items-center gap-3 px-4 py-3 mb-4 bg-blueAlliance/10 border border-blueAlliance/30 rounded-lg hover:bg-blueAlliance/20 transition-colors"
      >
        <Radio size={18} className="text-blueAlliance animate-pulse" />
        <div className="flex-1">
          <span className="font-semibold text-blueAlliance">Join Live Alliance Selection</span>
          <span className="text-textSecondary text-sm ml-2">
            Started by {liveSession.createdByName}
          </span>
        </div>
        <Handshake size={18} className="text-blueAlliance" />
      </Link>
    );
  }

  return null;
}

export default ActiveSessionBanner;
