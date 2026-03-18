import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { MetricsConfig, MetricColumn } from '../types/metrics';
import { DEFAULT_METRICS } from '../types/metrics';

interface MetricsState {
  config: MetricsConfig;

  // Column actions
  toggleColumn: (columnId: string) => void;
  updateColumn: (columnId: string, updates: Partial<MetricColumn>) => void;
  addColumn: (column: MetricColumn) => void;
  deleteColumn: (columnId: string) => void;
  reorderColumns: (fromIndex: number, toIndex: number) => void;
  resetToDefaults: () => void;
  getEnabledColumns: () => MetricColumn[];
}

export const useMetricsStore = create<MetricsState>()(
  persist(
    (set, get) => ({
      config: {
        columns: DEFAULT_METRICS,
        lastUpdated: new Date().toISOString(),
      },

      toggleColumn: (columnId) => {
        const { config } = get();
        set({
          config: {
            ...config,
            columns: config.columns.map(col =>
              col.id === columnId ? { ...col, enabled: !col.enabled } : col
            ),
            lastUpdated: new Date().toISOString(),
          },
        });
      },

      updateColumn: (columnId, updates) => {
        const { config } = get();
        set({
          config: {
            ...config,
            columns: config.columns.map(col =>
              col.id === columnId ? { ...col, ...updates } : col
            ),
            lastUpdated: new Date().toISOString(),
          },
        });
      },

      addColumn: (column) => {
        const { config } = get();
        set({
          config: {
            ...config,
            columns: [...config.columns, column],
            lastUpdated: new Date().toISOString(),
          },
        });
      },

      deleteColumn: (columnId) => {
        const { config } = get();
        set({
          config: {
            ...config,
            columns: config.columns.filter(col => col.id !== columnId),
            lastUpdated: new Date().toISOString(),
          },
        });
      },

      reorderColumns: (fromIndex, toIndex) => {
        const { config } = get();
        const newColumns = [...config.columns];
        const [moved] = newColumns.splice(fromIndex, 1);
        newColumns.splice(toIndex, 0, moved);

        set({
          config: {
            ...config,
            columns: newColumns,
            lastUpdated: new Date().toISOString(),
          },
        });
      },

      resetToDefaults: () => {
        set({
          config: {
            columns: DEFAULT_METRICS,
            lastUpdated: new Date().toISOString(),
          },
        });
      },

      getEnabledColumns: () => {
        const { config } = get();
        return config.columns.filter(col => col.enabled);
      },
    }),
    {
      name: 'frc-metrics-storage',
      version: 10,
      migrate: (persistedState: unknown, version: number) => {
        if (version === 9) {
          // v10: Disable scoring accuracy, L3 climb count, auto climb %;
          //      enable avg endgame pts
          const state = persistedState as { config: MetricsConfig };
          const disableIds = new Set(['fuelScoringAccuracy', 'level3ClimbCount', 'autoClimbRate']);
          const enableIds = new Set(['avgEndgamePoints']);
          return {
            config: {
              ...state.config,
              columns: state.config.columns.map(col =>
                disableIds.has(col.id) ? { ...col, enabled: false }
                : enableIds.has(col.id) ? { ...col, enabled: true }
                : col
              ),
              lastUpdated: new Date().toISOString(),
            },
          };
        }
        // Older versions: reset to defaults
        return {
          config: {
            columns: DEFAULT_METRICS,
            lastUpdated: new Date().toISOString(),
          },
        };
      },
    }
  )
);
