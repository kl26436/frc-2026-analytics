import { Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

function Login() {
  const { loading, error, isAuthenticated, isAllowed, signInWithGoogle, user } = useAuth();

  // Authenticated but not on the allowlist
  if (isAuthenticated && !isAllowed) {
    return (
      <div className="min-h-screen bg-background text-textPrimary flex items-center justify-center p-4">
        <div className="bg-surface rounded-lg border border-border p-8 max-w-md w-full text-center">
          <img
            src={`${import.meta.env.BASE_URL}team-logo.png`}
            alt="Team 148"
            className="h-16 w-16 mx-auto mb-4 object-contain"
          />
          <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
          <p className="text-textSecondary mb-4">
            Your account (<span className="text-textPrimary font-semibold">{user?.email}</span>) is not on the approved access list.
          </p>
          <p className="text-textMuted text-sm mb-6">
            Ask a team admin to add your email to the allowlist.
          </p>
          <button
            onClick={signInWithGoogle}
            className="w-full px-4 py-3 bg-surfaceElevated border border-border rounded-lg hover:bg-interactive transition-colors text-sm mb-3"
          >
            Try a different account
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-textPrimary flex items-center justify-center p-4">
      <div className="bg-surface rounded-lg border border-border p-8 max-w-md w-full text-center">
        <img
          src={`${import.meta.env.BASE_URL}team-logo.png`}
          alt="Team 148"
          className="h-20 w-20 mx-auto mb-6 object-contain"
        />
        <h1 className="text-3xl font-bold mb-2">Data Wrangler</h1>
        <p className="text-textSecondary mb-8">Team 148 Robowranglers • REBUILT 2026</p>

        {error && (
          <div className="bg-danger/10 border border-danger/30 text-danger px-4 py-3 rounded-lg text-sm mb-6">
            {error}
          </div>
        )}

        <button
          onClick={signInWithGoogle}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-white text-gray-800 font-semibold rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-gray-300"
        >
          {loading ? (
            <Loader2 size={20} className="animate-spin" />
          ) : (
            <svg viewBox="0 0 24 24" width="20" height="20">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
          )}
          Sign in with Google
        </button>

        <p className="text-textMuted text-xs mt-6">
          Only approved team members can access this app.
        </p>
      </div>
    </div>
  );
}

export default Login;
