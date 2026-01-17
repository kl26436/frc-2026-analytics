import { useState } from 'react';
import { useMetricsStore } from '../store/useMetricsStore';
import {
  Eye,
  EyeOff,
  GripVertical,
  RefreshCw,
  Settings as SettingsIcon,
  Save,
} from 'lucide-react';
import type { MetricColumn, MetricAggregation } from '../types/metrics';

function MetricsSettings() {
  const config = useMetricsStore(state => state.config);
  const toggleColumn = useMetricsStore(state => state.toggleColumn);
  const updateColumn = useMetricsStore(state => state.updateColumn);
  const resetToDefaults = useMetricsStore(state => state.resetToDefaults);

  const [editingColumn, setEditingColumn] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<MetricColumn>>({});

  const handleEditColumn = (column: MetricColumn) => {
    setEditingColumn(column.id);
    setEditForm({
      label: column.label,
      aggregation: column.aggregation,
      format: column.format,
      decimals: column.decimals,
    });
  };

  const handleSaveEdit = () => {
    if (editingColumn && editForm) {
      updateColumn(editingColumn, editForm);
      setEditingColumn(null);
      setEditForm({});
    }
  };

  const handleCancelEdit = () => {
    setEditingColumn(null);
    setEditForm({});
  };

  const enabledCount = config.columns.filter(c => c.enabled).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Metrics Configuration</h1>
          <p className="text-textSecondary mt-2">
            Customize which columns appear in the Teams view and how they're calculated
          </p>
        </div>
        <button
          onClick={resetToDefaults}
          className="flex items-center gap-2 px-4 py-2 bg-surface hover:bg-interactive rounded-lg transition-colors border border-border"
        >
          <RefreshCw size={20} />
          Reset to Defaults
        </button>
      </div>

      {/* Summary */}
      <div className="bg-surface p-6 rounded-lg border border-border">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold mb-2">Active Configuration</h2>
            <p className="text-textSecondary">
              {enabledCount} of {config.columns.length} metrics enabled
            </p>
          </div>
          <div className="text-right text-sm text-textMuted">
            Last updated: {new Date(config.lastUpdated).toLocaleString()}
          </div>
        </div>
      </div>

      {/* Metrics List */}
      <div className="bg-surface rounded-lg border border-border overflow-hidden">
        <div className="p-6 border-b border-border">
          <h2 className="text-xl font-bold">Available Metrics</h2>
          <p className="text-sm text-textSecondary mt-1">
            Toggle visibility, edit labels, and configure calculations
          </p>
        </div>

        <div className="divide-y divide-border">
          {config.columns.map((column) => (
            <div
              key={column.id}
              className={`p-4 ${column.enabled ? 'bg-surface' : 'bg-background opacity-60'}`}
            >
              {editingColumn === column.id ? (
                // Edit Mode
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-textSecondary mb-2">
                        Display Label
                      </label>
                      <input
                        type="text"
                        value={editForm.label || ''}
                        onChange={e => setEditForm({ ...editForm, label: e.target.value })}
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-textSecondary mb-2">
                        Aggregation Type
                      </label>
                      <select
                        value={editForm.aggregation || 'avg'}
                        onChange={e => setEditForm({ ...editForm, aggregation: e.target.value as MetricAggregation })}
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                      >
                        <option value="avg">Average</option>
                        <option value="max">Maximum</option>
                        <option value="min">Minimum</option>
                        <option value="median">Median</option>
                        <option value="sum">Sum</option>
                        <option value="rate">Rate (%)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm text-textSecondary mb-2">
                        Format
                      </label>
                      <select
                        value={editForm.format || 'number'}
                        onChange={e => setEditForm({ ...editForm, format: e.target.value as 'number' | 'percentage' | 'time' })}
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                      >
                        <option value="number">Number</option>
                        <option value="percentage">Percentage</option>
                        <option value="time">Time (seconds)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm text-textSecondary mb-2">
                        Decimal Places
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="3"
                        value={editForm.decimals ?? 1}
                        onChange={e => setEditForm({ ...editForm, decimals: parseInt(e.target.value) })}
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={handleCancelEdit}
                      className="px-4 py-2 bg-surface hover:bg-interactive rounded-lg transition-colors border border-border"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveEdit}
                      className="flex items-center gap-2 px-4 py-2 bg-success text-background font-semibold rounded-lg hover:bg-success/90 transition-colors"
                    >
                      <Save size={16} />
                      Save Changes
                    </button>
                  </div>
                </div>
              ) : (
                // View Mode
                <div className="flex items-center gap-4">
                  {/* Drag Handle */}
                  <button className="cursor-grab text-textMuted hover:text-textPrimary">
                    <GripVertical size={20} />
                  </button>

                  {/* Visibility Toggle */}
                  <button
                    onClick={() => toggleColumn(column.id)}
                    className={`p-2 rounded transition-colors ${
                      column.enabled
                        ? 'text-success hover:text-success/80'
                        : 'text-textMuted hover:text-textPrimary'
                    }`}
                    title={column.enabled ? 'Hide column' : 'Show column'}
                  >
                    {column.enabled ? <Eye size={20} /> : <EyeOff size={20} />}
                  </button>

                  {/* Column Info */}
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-bold">{column.label}</h3>
                      <span className="text-xs px-2 py-1 bg-surfaceElevated rounded text-textSecondary">
                        {column.aggregation}
                      </span>
                      <span className="text-xs px-2 py-1 bg-surfaceElevated rounded text-textSecondary">
                        {column.format}
                      </span>
                      <span className="text-xs px-2 py-1 bg-surfaceElevated rounded text-textSecondary">
                        {column.decimals} decimals
                      </span>
                    </div>
                    <p className="text-sm text-textSecondary">
                      Field: <code className="text-xs bg-background px-1 py-0.5 rounded">{column.field}</code>
                      {column.description && ` • ${column.description}`}
                    </p>
                  </div>

                  {/* Edit Button */}
                  <button
                    onClick={() => handleEditColumn(column)}
                    className="p-2 text-textMuted hover:text-textPrimary rounded transition-colors"
                    title="Edit column"
                  >
                    <SettingsIcon size={20} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Help Section */}
      <div className="bg-surface p-6 rounded-lg border border-border">
        <h2 className="text-xl font-bold mb-4">How It Works</h2>
        <div className="space-y-3 text-sm text-textSecondary">
          <p>
            <strong className="text-textPrimary">Toggle Visibility:</strong> Click the eye icon to
            show/hide a column in the Teams view
          </p>
          <p>
            <strong className="text-textPrimary">Edit Settings:</strong> Click the settings icon to
            customize the label, aggregation method, format, and precision
          </p>
          <p>
            <strong className="text-textPrimary">Aggregation Types:</strong>
          </p>
          <ul className="ml-6 space-y-1">
            <li>• <strong>Average</strong> - Mean value across all matches</li>
            <li>• <strong>Maximum</strong> - Best performance across all matches</li>
            <li>• <strong>Minimum</strong> - Worst performance (useful for reliability)</li>
            <li>• <strong>Median</strong> - Middle value (less affected by outliers)</li>
            <li>• <strong>Sum</strong> - Total across all matches</li>
            <li>• <strong>Rate (%)</strong> - Percentage of matches (for boolean events)</li>
          </ul>
          <p>
            <strong className="text-textPrimary">Format Types:</strong>
          </p>
          <ul className="ml-6 space-y-1">
            <li>• <strong>Number</strong> - Display as decimal number</li>
            <li>• <strong>Percentage</strong> - Display with % symbol</li>
            <li>• <strong>Time</strong> - Display as seconds with 's' suffix</li>
          </ul>
        </div>
      </div>

      {/* Preview */}
      <div className="bg-surface p-6 rounded-lg border border-border">
        <h2 className="text-xl font-bold mb-4">Column Preview</h2>
        <p className="text-sm text-textSecondary mb-4">
          These columns will appear in the Teams view:
        </p>
        <div className="flex flex-wrap gap-2">
          {config.columns
            .filter(c => c.enabled)
            .map(column => (
              <div
                key={column.id}
                className="px-3 py-2 bg-surfaceElevated rounded border border-border"
              >
                <span className="font-semibold">{column.label}</span>
                <span className="text-xs text-textMuted ml-2">
                  ({column.aggregation})
                </span>
              </div>
            ))}
        </div>
        {enabledCount === 0 && (
          <p className="text-textMuted italic">No columns enabled</p>
        )}
      </div>
    </div>
  );
}

export default MetricsSettings;
