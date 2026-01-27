import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useFirebaseAuth } from '../hooks/useFirebaseAuth';

function AllianceSelectionJoin() {
  const { sessionCode } = useParams<{ sessionCode: string }>();
  const navigate = useNavigate();
  const { user, loading, signIn } = useFirebaseAuth();

  useEffect(() => {
    async function handleJoin() {
      if (loading) return;

      // Auto sign-in if needed
      if (!user) {
        await signIn();
        return; // signIn triggers re-render via onAuthStateChanged, useEffect will re-run
      }

      // Redirect to the board — the board component handles the actual join
      if (sessionCode) {
        navigate(`/alliance-selection/${sessionCode}`, { replace: true });
      }
    }

    handleJoin();
  }, [sessionCode, user, loading, signIn, navigate]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
      <Loader2 size={32} className="animate-spin text-textSecondary" />
      <p className="text-textSecondary">Joining session {sessionCode}...</p>
    </div>
  );
}

export default AllianceSelectionJoin;
