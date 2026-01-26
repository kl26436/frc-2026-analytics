import { useState, useMemo } from 'react';
import { useMetricsStore } from '../store/useMetricsStore';
import {
  Eye,
  EyeOff,
  RefreshCw,
  Settings as SettingsIcon,
  Save,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { MetricColumn, MetricAggregation, MetricCategory } from '../types/metrics';
import { CATEGORY_LABELS } from '../types/metrics';

function MetricsSettings() {
  const config = useMetricsStore(state => state.config);
  const toggleColumn = useMetricsStore(state => state.toggleColumn);
  const updateColumn = useMetricsStore(state => state.updateColumn);
  const resetToDefaults = useMetricsStore(state => state.resetToDefaults);

  const [editingColumn, setEditingColumn] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<MetricColumn>>({});
  const [collapsedCategories, setCollapsedCategories] = useState<Set<MetricCategory>>(new Set());

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

  const toggleCategory = (category: MetricCategory) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  // Group columns by category
  const columnsByCategory = useMemo(() => {
    const groups: Record<MetricCategory, MetricColumn[]> = {
      overall: [],
      auto: [],
      teleop: [],
      endgame: [],
      defense: [],
      performance: [],
      reliability: [],
    };

    config.columns.forEach(col => {
      const category = col.category || 'overall';
      groups[category].push(col);
    });

    return groups;
  }, [config.columns]);

  const enabledCount = config.columns.filter(c => c.enabled).length;
  const categories = Object.keys(CATEGORY_LABELS) as MetricCategory[];

  const renderColumn = (column: MetricColumn) => (
    <div
      key={column.id}
      className={`p-4 border-b border-border/50 last:border-b-0 ${column.enabled ? 'bg-surface' : 'bg-background opacity-60'}`}
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
            </div>
            <p className="text-sm text-textSecondary">
              <code className="text-xs bg-background px-1 py-0.5 rounded">{column.field}</code>
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
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Metrics Configuration</h1>
          <p className="text-textSecondary mt-2">
            Customize which columns appear in the Teams view
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
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold mb-2">Active Configuration</h2>
            <p className="text-textSecondary">
              {enabledCount} of {config.columns.length} metrics enabled
            </p>
          </div>
          <div className="text-sm text-textMuted">
            Last updated: {new Date(config.lastUpdated).toLocaleString()}
          </div>
        </div>
      </div>

      {/* Metrics by Category */}
      {categories.map(category => {
        const categoryColumns = columnsByCategory[category];
        if (categoryColumns.length === 0) return null;

        const enabledInCategory = categoryColumns.filter(c => c.enabled).length;
        const isCollapsed = collapsedCategories.has(category);

        return (
          <div key={category} className="bg-surface rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => toggleCategory(category)}
              className="w-full p-4 flex items-center justify-between hover:bg-interactive transition-colors"
            >
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold">{CATEGORY_LABELS[category]}</h2>
                <span className="text-sm text-textSecondary">
                  ({enabledInCategory}/{categoryColumns.length} enabled)
                </span>
              </div>
              {isCollapsed ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
            </button>

            {!isCollapsed && (
              <div className="border-t border-border">
                {categoryColumns.map(renderColumn)}
              </div>
            )}
          </div>
        );
      })}

      {/* Column Preview */}
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
          <div className="grid md:grid-cols-2 gap-4 mt-4">
            <div>
              <p className="text-textPrimary font-semibold mb-2">Aggregation Types:</p>
              <ul className="space-y-1">
                <li>• <strong>Average</strong> - Mean value across all matches</li>
                <li>• <strong>Maximum</strong> - Best performance</li>
                <li>• <strong>Minimum</strong> - Worst performance or fastest time</li>
                <li>• <strong>Rate (%)</strong> - Percentage of matches</li>
              </ul>
            </div>
            <div>
              <p className="text-textPrimary font-semibold mb-2">Format Types:</p>
              <ul className="space-y-1">
                <li>• <strong>Number</strong> - Display as decimal number</li>
                <li>• <strong>Percentage</strong> - Display with % symbol</li>
                <li>• <strong>Time</strong> - Display as seconds with 's' suffix</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MetricsSettings;
