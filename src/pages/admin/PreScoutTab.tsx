import { useState, useEffect } from 'react';
import { Settings, FileSpreadsheet, Loader, Eye, Upload, ToggleLeft, ToggleRight } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { doc, onSnapshot, type Timestamp } from 'firebase/firestore';
import { db, functions } from '../../lib/firebase';
import { useAnalyticsStore, type PredictionMode } from '../../store/useAnalyticsStore';
import { useAuth } from '../../contexts/AuthContext';

interface PreScoutImportResult {
  totalEntries: number;
  skippedRows: number;
  originEvents: Record<string, { entries: number; teams: number }>;
  dryRun?: boolean;
}

interface PreScoutConfigDoc {
  sheetUrl?: string;
  lastImportAt?: Timestamp;
  lastImportBy?: string;
  lastImportStats?: {
    totalEntries: number;
    skippedRows: number;
    originEvents: Record<string, { entries: number; teams: number }>;
  };
}

const DEFAULT_PRESCOUT_SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1VPI_tbGBMFsU_LhqYODV3GWlHXWwASGTJZugIIsf-2Q/export?format=csv&gid=0';

export default function PreScoutTab() {
  const { isAdmin } = useAuth();
  const usePreScout = useAnalyticsStore(s => s.usePreScout);
  const predictionMode = useAnalyticsStore(s => s.predictionMode);
  const smartFallbackThreshold = useAnalyticsStore(s => s.smartFallbackThreshold);
  const setUsePreScout = useAnalyticsStore(s => s.setUsePreScout);
  const setPredictionMode = useAnalyticsStore(s => s.setPredictionMode);
  const setSmartFallbackThreshold = useAnalyticsStore(s => s.setSmartFallbackThreshold);
  const preScoutEntries = useAnalyticsStore(s => s.preScoutEntries);

  const [preScoutSheetUrl, setPreScoutSheetUrl] = useState(DEFAULT_PRESCOUT_SHEET_URL);
  const [preScoutPreview, setPreScoutPreview] = useState<PreScoutImportResult | null>(null);
  const [preScoutBusy, setPreScoutBusy] = useState<'idle' | 'preview' | 'import'>('idle');
  const [preScoutError, setPreScoutError] = useState<string | null>(null);
  const [preScoutConfig, setPreScoutConfig] = useState<PreScoutConfigDoc | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const flash = (msg: string) => {
    setStatus(msg);
    setTimeout(() => setStatus(null), 3000);
  };

  useEffect(() => {
    if (!isAdmin) return;
    const unsub = onSnapshot(doc(db, 'config', 'preScout'), (snap) => {
      if (snap.exists()) {
        const cfg = snap.data() as PreScoutConfigDoc;
        setPreScoutConfig(cfg);
        if (cfg.sheetUrl) setPreScoutSheetUrl(cfg.sheetUrl);
      }
    });
    return () => unsub();
  }, [isAdmin]);

  const callPreScoutImport = async (dryRun: boolean) => {
    setPreScoutError(null);
    setPreScoutBusy(dryRun ? 'preview' : 'import');
    try {
      const fn = httpsCallable<
        { sheetUrl?: string; dryRun: boolean },
        PreScoutImportResult
      >(functions, 'importPreScoutData');
      const args: { sheetUrl?: string; dryRun: boolean } = { dryRun };
      const trimmed = preScoutSheetUrl.trim();
      if (trimmed && trimmed !== DEFAULT_PRESCOUT_SHEET_URL) {
        args.sheetUrl = trimmed;
      }
      const res = await fn(args);
      setPreScoutPreview(res.data);
      if (!dryRun) {
        flash(`Imported ${res.data.totalEntries} pre-scout entries (${res.data.skippedRows} skipped).`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Pre-scout import failed';
      setPreScoutError(msg);
    } finally {
      setPreScoutBusy('idle');
    }
  };

  return (
    <div className="space-y-6">
      {/* Last action indicator */}
      {preScoutConfig?.lastImportAt && (
        <div className="text-xs text-textMuted">
          Last imported: {preScoutConfig.lastImportAt.toDate().toLocaleString()}
          {preScoutConfig.lastImportBy && <> by <span className="text-textSecondary">{preScoutConfig.lastImportBy.split('@')[0]}</span></>}
          {preScoutConfig.lastImportStats && <> · {preScoutConfig.lastImportStats.totalEntries} entries</>}
        </div>
      )}

      {status && (
        <div className="p-3 bg-success/10 border border-success/30 rounded-lg text-success text-sm">
          {status}
        </div>
      )}

      {/* Pre-Scout Data Import */}
      <div className="bg-surface rounded-lg border border-border p-4 md:p-6">
        <h2 className="text-lg font-bold mb-1 flex items-center gap-2">
          <FileSpreadsheet size={20} />
          Pre-Scout Data Import
        </h2>
        <p className="text-xs text-textSecondary mb-4">
          Import hand-counted pre-scout data from a Google Sheet. Entries are pooled
          across origin events and filtered to the active event's TBA roster at read time.
        </p>

        <div className="mb-4">
          <label className="block text-sm font-medium text-textSecondary mb-1">Sheet URL (CSV export)</label>
          <input
            type="text"
            value={preScoutSheetUrl}
            onChange={(e) => setPreScoutSheetUrl(e.target.value)}
            placeholder={DEFAULT_PRESCOUT_SHEET_URL}
            className="w-full px-3 py-2 bg-card border border-border rounded-lg text-textPrimary placeholder-textMuted focus:outline-none focus:border-success text-xs font-mono"
          />
          <p className="text-xs text-textMuted mt-1">
            Defaults to the Championship Pre-Scouting sheet. Use the Google Sheets `?format=csv` export URL for any other sheet.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap mb-4">
          <button
            onClick={() => callPreScoutImport(true)}
            disabled={preScoutBusy !== 'idle'}
            className="flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-lg hover:bg-surfaceElevated transition-colors text-sm disabled:opacity-50"
          >
            {preScoutBusy === 'preview' ? <Loader size={14} className="animate-spin" /> : <Eye size={14} />}
            Fetch &amp; Preview
          </button>
          <button
            onClick={() => callPreScoutImport(false)}
            disabled={preScoutBusy !== 'idle'}
            className="flex items-center gap-2 px-4 py-2 bg-blueAlliance text-white font-semibold rounded-lg hover:bg-blueAlliance/90 transition-colors text-sm disabled:opacity-50"
          >
            {preScoutBusy === 'import' ? <Loader size={14} className="animate-spin" /> : <Upload size={14} />}
            {preScoutBusy === 'import' ? 'Importing…' : 'Import'}
          </button>
          <span className="text-xs text-textMuted">
            Currently in store: <span className="text-textSecondary font-medium">{preScoutEntries.length}</span> pre-scout entries
          </span>
        </div>

        {preScoutError && (
          <div className="mb-4 p-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-sm">
            {preScoutError}
          </div>
        )}

        {preScoutPreview && (
          <div className="mb-4 p-4 bg-card rounded-lg border border-border">
            <p className="text-sm font-semibold mb-2">
              {preScoutPreview.dryRun ? 'Preview' : 'Last import result'}
              {' · '}
              <span className="text-success">{preScoutPreview.totalEntries} entries</span>
              {' · '}
              <span className="text-textMuted">{preScoutPreview.skippedRows} skipped</span>
            </p>
            <div className="space-y-1 font-mono text-xs">
              {Object.entries(preScoutPreview.originEvents).map(([key, info]) => (
                <div key={key} className="flex items-center gap-3">
                  <span className="text-textSecondary w-24">{key}</span>
                  <span>{info.entries} entries</span>
                  <span className="text-textMuted">({info.teams} teams)</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Pre-Scout Mode (per-user setting) */}
      <div className="bg-surface rounded-lg border border-border p-4 md:p-6">
        <h2 className="text-lg font-bold mb-1 flex items-center gap-2">
          <Settings size={20} />
          Pre-Scout in Predictions
        </h2>
        <p className="text-xs text-textSecondary mb-4">
          Controls how pre-scout entries blend into team statistics and Monte Carlo predictions.
          Saved per-user (your settings only).
        </p>

        <button
          onClick={() => setUsePreScout(!usePreScout)}
          className="flex items-center gap-2 mb-4 text-sm text-textSecondary hover:text-textPrimary transition-colors"
        >
          {usePreScout ? (
            <ToggleRight size={24} className="text-success" />
          ) : (
            <ToggleLeft size={24} className="text-textMuted" />
          )}
          Use pre-scout data {usePreScout ? '(on)' : '(off — live only)'}
        </button>

        <fieldset disabled={!usePreScout} className={!usePreScout ? 'opacity-50' : ''}>
          <legend className="text-sm font-medium text-textSecondary mb-2">Mode</legend>
          <div className="space-y-2 mb-4">
            {([
              { value: 'smart-fallback', label: 'Smart fallback', hint: 'Recommended — pre-scout fills in for teams with thin live data' },
              { value: 'live-only', label: 'Live only', hint: 'Ignore pre-scout entirely (same as toggle off)' },
              { value: 'blended', label: 'Blended', hint: 'Use both live and pre-scout for every team, equal weight' },
              { value: 'pre-scout-only', label: 'Pre-scout only', hint: 'Force pre-scout for everyone — useful if pre-scout proves more accurate than live' },
            ] as { value: PredictionMode; label: string; hint: string }[]).map(opt => (
              <label key={opt.value} className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="predictionMode"
                  value={opt.value}
                  checked={predictionMode === opt.value}
                  onChange={() => setPredictionMode(opt.value)}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <span className="text-sm font-medium">{opt.label}</span>
                  <p className="text-xs text-textMuted">{opt.hint}</p>
                </div>
              </label>
            ))}
          </div>

          <div className={predictionMode === 'smart-fallback' ? '' : 'opacity-50 pointer-events-none'}>
            <label className="block text-sm font-medium text-textSecondary mb-1">
              Smart-fallback threshold
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSmartFallbackThreshold(smartFallbackThreshold - 1)}
                disabled={predictionMode !== 'smart-fallback'}
                className="px-3 py-1 bg-card border border-border rounded hover:bg-surfaceElevated transition-colors text-sm"
              >
                −
              </button>
              <span className="px-4 py-1 bg-card border border-border rounded text-sm font-mono w-16 text-center">
                {smartFallbackThreshold}
              </span>
              <button
                onClick={() => setSmartFallbackThreshold(smartFallbackThreshold + 1)}
                disabled={predictionMode !== 'smart-fallback'}
                className="px-3 py-1 bg-card border border-border rounded hover:bg-surfaceElevated transition-colors text-sm"
              >
                +
              </button>
              <span className="text-xs text-textMuted ml-2">
                live matches required to drop pre-scout for a team
              </span>
            </div>
          </div>
        </fieldset>
      </div>
    </div>
  );
}
