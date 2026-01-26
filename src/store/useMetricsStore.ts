import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { MetricsConfig, MetricColumn } from '../types/metrics';
import { DEFAULT_METRICS } from '../types/metrics';

interface MetricsState {
  config: MetricsConfig;

  // Actions
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

      // Toggle column enabled/disabled
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

      // Update column properties
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

      // Add a new column
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

      // Delete a column
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

      // Reorder columns
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

      // Reset to default configuration
      resetToDefaults: () => {
        set({
          config: {
            columns: DEFAULT_METRICS,
            lastUpdated: new Date().toISOString(),
          },
        });
      },

      // Get only enabled columns
      getEnabledColumns: () => {
        const { config } = get();
        return config.columns.filter(col => col.enabled);
      },
    }),
    {
      name: 'frc-metrics-storage',
    }
  )
);
