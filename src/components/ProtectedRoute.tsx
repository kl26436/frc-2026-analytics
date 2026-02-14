import { Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import Login from '../pages/Login';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { loading, isAllowed } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-textSecondary" />
      </div>
    );
  }

  if (!isAllowed) {
    return <Login />;
  }

  return <>{children}</>;
}

export default ProtectedRoute;
