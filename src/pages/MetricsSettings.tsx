import { useState, useRef } from 'react';
import { useMetricsStore } from '../store/useMetricsStore';
import {
  RefreshCw,
  Settings as SettingsIcon,
  Save,
  Plus,
  Trash2,
  X,
  GripVertical,
  ArrowLeft,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { MetricColumn, MetricCategory, MetricAggregation } from '../types/metrics';
import { CATEGORY_LABELS, DEFAULT_METRICS } from '../types/metrics';
import { RAW_METRIC_OPTIONS } from '../utils/metricAggregation';

// Category labels for raw metric options
const RAW_METRIC_CATEGORY_LABELS: Record<string, string> = {
  overall: 'Overall',
  fuel: 'Fuel Scoring',
  endgame: 'Endgame',
};

function MetricsSettings() {
  const navigate = useNavigate();
  const config = useMetricsStore(state => state.config);
  const toggleColumn = useMetricsStore(state => state.toggleColumn);
  const updateColumn = useMetricsStore(state => state.updateColumn);
  const addColumn = useMetricsStore(state => state.addColumn);
  const deleteColumn = useMetricsStore(state => state.deleteColumn);
  const reorderColumns = useMetricsStore(state => state.reorderColumns);
  const resetToDefaults = useMetricsStore(state => state.resetToDefaults);

  // Drag and drop state
  const dragItem = useRef<string | null>(null);
  const dragOverItem = useRef<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragStart = (columnId: string) => {
    dragItem.current = columnId;
    setIsDragging(true);
  };

  const handleDragEnter = (columnId: string) => {
    dragOverItem.current = columnId;
  };

  const handleDragEnd = () => {
    if (dragItem.current && dragOverItem.current && dragItem.current !== dragOverItem.current) {
      const fromIndex = config.columns.findIndex(c => c.id === dragItem.current);
      const toIndex = config.columns.findIndex(c => c.id === dragOverItem.current);
      if (fromIndex !== -1 && toIndex !== -1) {
        reorderColumns(fromIndex, toIndex);
      }
    }
    dragItem.current = null;
    dragOverItem.current = null;
    setIsDragging(false);
  };

  const [editingColumn, setEditingColumn] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<MetricColumn>>({});
  const [showAddPicker, setShowAddPicker] = useState(false);
  const [addFilterCategory, setAddFilterCategory] = useState<MetricCategory | 'all'>('all');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [newColumn, setNewColumn] = useState({
    rawMetricId: '',
    aggregations: [] as MetricAggregation[],
    format: 'number' as 'number' | 'percentage' | 'time' | 'count',
    decimals: 1,
    category: 'overall' as MetricCategory,
    percentileValue: 75,
  });

  // Only show enabled metrics in the main list
  const enabledColumns = config.columns.filter(c => c.enabled);

  // Disabled default metrics that can be re-added
  const disabledColumns = config.columns.filter(c => !c.enabled);

  // Check if a column is a default one
  const isDefaultColumn = (columnId: string) => {
    return DEFAULT_METRICS.some(m => m.id === columnId);
  };

  // Handle removing a metric (disable for defaults, delete for custom)
  const handleRemoveColumn = (column: MetricColumn) => {
    if (isDefaultColumn(column.id)) {
      toggleColumn(column.id); // just hide it
    } else {
      deleteColumn(column.id); // permanently remove custom
    }
  };

  // Handle re-adding a disabled metric
  const handleEnableColumn = (columnId: string) => {
    toggleColumn(columnId);
  };

  const AGG_LABELS: Record<MetricAggregation, string> = {
    avg: 'Avg', max: 'Max', min: 'Min', median: 'Median', sum: 'Sum', rate: 'Rate', percentile: 'P',
  };

  // Bulk-add: creates one column per selected aggregation
  const handleBulkAdd = () => {
    if (!newColumn.rawMetricId || newColumn.aggregations.length === 0) return;

    const selectedOption = RAW_METRIC_OPTIONS.find(o => o.id === newColumn.rawMetricId);
    const metricShort = selectedOption?.shortLabel || selectedOption?.label || newColumn.rawMetricId;

    for (const agg of newColumn.aggregations) {
      const prefix = AGG_LABELS[agg];
      const suffix = agg === 'percentile' ? `${newColumn.percentileValue}` : '';
      const label = `${prefix}${suffix} ${metricShort}`;
      const id = `custom_${agg}_${newColumn.rawMetricId}_${Date.now()}_${agg}`;

      const column: MetricColumn = {
        id,
        label,
        field: 'computed',
        rawMetric: newColumn.rawMetricId,
        aggregation: agg,
        format: newColumn.format,
        decimals: newColumn.decimals,
        enabled: true,
        description: `Custom: ${agg}${suffix ? ' ' + suffix : ''} of ${metricShort}`,
        category: selectedOption?.category as MetricCategory || newColumn.category,
        ...(agg === 'percentile' ? { percentileValue: newColumn.percentileValue } : {}),
      };

      addColumn(column);
    }

    setNewColumn({
      rawMetricId: '',
      aggregations: [],
      format: 'number',
      decimals: 1,
      category: 'overall',
      percentileValue: 75,
    });
  };

  const toggleAggregation = (agg: MetricAggregation) => {
    setNewColumn(prev => ({
      ...prev,
      aggregations: prev.aggregations.includes(agg)
        ? prev.aggregations.filter(a => a !== agg)
        : [...prev.aggregations, agg],
    }));
  };

  // Quick templates
  interface MetricTemplate {
    id: string;
    name: string;
    description: string;
    columns: Omit<MetricColumn, 'id'>[];
  }

  const METRIC_TEMPLATES: MetricTemplate[] = [
    {
      id: 'fuel-deep-dive',
      name: 'Fuel Deep Dive',
      description: 'Avg, Max, Median, P75 for fuel scoring metrics',
      columns: [
        { label: 'Avg Fuel', field: 'computed', rawMetric: 'totalFuelEstimate', aggregation: 'avg', format: 'number', decimals: 1, enabled: true, category: 'fuel' },
        { label: 'Max Fuel', field: 'computed', rawMetric: 'totalFuelEstimate', aggregation: 'max', format: 'number', decimals: 0, enabled: true, category: 'fuel' },
        { label: 'Median Fuel', field: 'computed', rawMetric: 'totalFuelEstimate', aggregation: 'median', format: 'number', decimals: 1, enabled: true, category: 'fuel' },
        { label: 'P75 Fuel', field: 'computed', rawMetric: 'totalFuelEstimate', aggregation: 'percentile', percentileValue: 75, format: 'number', decimals: 1, enabled: true, category: 'fuel' },
        { label: 'Avg Passes', field: 'computed', rawMetric: 'totalPass', aggregation: 'avg', format: 'number', decimals: 1, enabled: true, category: 'fuel' },
        { label: 'Max Passes', field: 'computed', rawMetric: 'totalPass', aggregation: 'max', format: 'number', decimals: 0, enabled: true, category: 'fuel' },
      ],
    },
    {
      id: 'climb-analysis',
      name: 'Climb Analysis',
      description: 'Max climb level, avg climb, all climb rates',
      columns: [
        { label: 'Max Climb', field: 'computed', rawMetric: 'climbLevel', aggregation: 'max', format: 'number', decimals: 0, enabled: true, category: 'endgame' },
        { label: 'Avg Climb', field: 'computed', rawMetric: 'climbLevel', aggregation: 'avg', format: 'number', decimals: 1, enabled: true, category: 'endgame' },
        { label: 'Climb Rate', field: 'computed', rawMetric: 'climbLevel', aggregation: 'rate', format: 'percentage', decimals: 0, enabled: true, category: 'endgame' },
      ],
    },
    {
      id: 'alliance-selection',
      name: 'Alliance Selection',
      description: 'Key metrics for partner evaluation',
      columns: [
        { label: 'Avg Points', field: 'computed', rawMetric: 'totalPoints', aggregation: 'avg', format: 'number', decimals: 1, enabled: true, category: 'overall' },
        { label: 'P75 Points', field: 'computed', rawMetric: 'totalPoints', aggregation: 'percentile', percentileValue: 75, format: 'number', decimals: 1, enabled: true, category: 'overall' },
        { label: 'Max Climb', field: 'computed', rawMetric: 'climbLevel', aggregation: 'max', format: 'number', decimals: 0, enabled: true, category: 'endgame' },
        { label: 'Avg Fuel', field: 'computed', rawMetric: 'totalFuelEstimate', aggregation: 'avg', format: 'number', decimals: 1, enabled: true, category: 'fuel' },
      ],
    },
  ];

  const applyTemplate = (template: MetricTemplate) => {
    const now = Date.now();
    template.columns.forEach((col, idx) => {
      const id = `template_${template.id}_${col.rawMetric || col.field}_${col.aggregation}_${now}_${idx}`;
      addColumn({ ...col, id } as MetricColumn);
    });
    setShowAddPicker(false);
  };

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

  // Group enabled columns by category for display
  const enabledByCategory = enabledColumns.reduce((acc, col) => {
    const cat = col.category || 'overall';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(col);
    return acc;
  }, {} as Record<MetricCategory, MetricColumn[]>);

  // Filter disabled columns for the add picker
  const filteredDisabledColumns = addFilterCategory === 'all'
    ? disabledColumns
    : disabledColumns.filter(c => c.category === addFilterCategory);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 text-textSecondary hover:text-textPrimary hover:bg-interactive rounded-lg transition-colors"
            title="Go back"
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Customize Metrics</h1>
            <p className="text-textSecondary text-sm mt-1">
              {enabledColumns.length} active metrics
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowResetConfirm(true)}
            className="flex items-center gap-2 px-3 py-2 bg-surface hover:bg-interactive rounded-lg transition-colors border border-border text-sm"
          >
            <RefreshCw size={16} />
            Reset
          </button>
        </div>
      </div>

      {/* Active Metrics List */}
      <div className="bg-surface rounded-lg border border-border overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">Active Metrics</h2>
            <p className="text-xs text-textSecondary mt-0.5">Drag to reorder. This order is used in Teams table and Comparison view.</p>
          </div>
          <button
            onClick={() => setShowAddPicker(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-success text-background font-semibold rounded-lg hover:bg-success/90 transition-colors text-sm"
          >
            <Plus size={16} />
            Add Metric
          </button>
        </div>

        {enabledColumns.length === 0 ? (
          <div className="p-8 text-center text-textMuted">
            No metrics enabled. Click "Add Metric" to get started.
          </div>
        ) : (
          <div>
            {(Object.keys(CATEGORY_LABELS) as MetricCategory[]).map(category => {
              const cols = enabledByCategory[category];
              if (!cols || cols.length === 0) return null;

              return (
                <div key={category}>
                  <div className="px-4 py-2 bg-surfaceElevated border-b border-border/50">
                    <span className="text-xs font-bold uppercase tracking-wide text-textSecondary">
                      {CATEGORY_LABELS[category]}
                    </span>
                  </div>
                  {cols.map(column => (
                    <div
                      key={column.id}
                      draggable={editingColumn !== column.id}
                      onDragStart={() => handleDragStart(column.id)}
                      onDragEnter={() => handleDragEnter(column.id)}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => e.preventDefault()}
                      className={`flex items-center gap-3 px-4 py-3 border-b border-border/30 hover:bg-interactive/50 transition-all ${
                        isDragging && dragItem.current === column.id ? 'opacity-50' : ''
                      } ${editingColumn !== column.id ? 'cursor-grab active:cursor-grabbing' : ''}`}
                    >
                      {editingColumn === column.id ? (
                        // Edit Mode
                        <div className="flex-1 space-y-3 py-1">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="block text-xs text-textSecondary mb-1">Label</label>
                              <input
                                type="text"
                                value={editForm.label || ''}
                                onChange={e => setEditForm({ ...editForm, label: e.target.value })}
                                className="w-full px-3 py-1.5 bg-background border border-border rounded-lg text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-textSecondary mb-1">Format</label>
                              <select
                                value={editForm.format || 'number'}
                                onChange={e => setEditForm({ ...editForm, format: e.target.value as 'number' | 'percentage' | 'time' | 'count' })}
                                className="w-full px-3 py-1.5 bg-background border border-border rounded-lg text-sm"
                              >
                                <option value="number">Number</option>
                                <option value="percentage">Percentage</option>
                                <option value="time">Time (seconds)</option>
                                <option value="count">Count (X/N)</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs text-textSecondary mb-1">Decimals</label>
                              <input
                                type="number"
                                min="0"
                                max="3"
                                value={editForm.decimals ?? 1}
                                onChange={e => setEditForm({ ...editForm, decimals: parseInt(e.target.value) })}
                                className="w-full px-3 py-1.5 bg-background border border-border rounded-lg text-sm"
                              />
                            </div>
                          </div>
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => { setEditingColumn(null); setEditForm({}); }}
                              className="px-3 py-1.5 text-sm bg-surface hover:bg-interactive rounded-lg border border-border"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={handleSaveEdit}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-success text-background font-semibold rounded-lg hover:bg-success/90"
                            >
                              <Save size={14} />
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        // View Mode
                        <>
                          <div className="text-textMuted hover:text-textSecondary">
                            <GripVertical size={16} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="font-semibold text-sm">{column.label}</span>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-textMuted">{column.aggregation} &middot; {column.format}</span>
                              {!isDefaultColumn(column.id) && (
                                <span className="text-xs px-1.5 py-0.5 bg-blueAlliance/20 text-blueAlliance rounded">custom</span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => handleEditColumn(column)}
                            className="p-1.5 text-textMuted hover:text-textPrimary rounded transition-colors"
                            title="Edit"
                          >
                            <SettingsIcon size={16} />
                          </button>
                          <button
                            onClick={() => handleRemoveColumn(column)}
                            className="p-1.5 text-textMuted hover:text-danger rounded transition-colors"
                            title="Remove"
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Metric Picker Modal */}
      {showAddPicker && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowAddPicker(false)}>
          <div className="bg-surface rounded-lg border border-border w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
              <h3 className="font-bold text-lg">Add Metric</h3>
              <button onClick={() => setShowAddPicker(false)} className="p-1.5 hover:bg-interactive rounded transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Category filter tabs */}
            <div className="px-4 pt-3 pb-2 flex flex-wrap gap-1.5 border-b border-border flex-shrink-0">
              <button
                onClick={() => setAddFilterCategory('all')}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                  addFilterCategory === 'all' ? 'bg-success text-background' : 'bg-card hover:bg-interactive text-textSecondary'
                }`}
              >
                All
              </button>
              {(Object.keys(CATEGORY_LABELS) as MetricCategory[]).map(cat => (
                <button
                  key={cat}
                  onClick={() => setAddFilterCategory(cat)}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                    addFilterCategory === cat ? 'bg-success text-background' : 'bg-card hover:bg-interactive text-textSecondary'
                  }`}
                >
                  {CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>

            {/* Available metrics to add */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
              {/* Custom column builder (bulk-add) — always visible at top */}
              <div className="p-4 rounded-lg border-2 border-success bg-success/5">
                <h4 className="font-bold text-sm mb-3">Custom Metric</h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-textSecondary mb-1">What to measure *</label>
                    <select
                      value={newColumn.rawMetricId}
                      onChange={e => setNewColumn(prev => ({ ...prev, rawMetricId: e.target.value }))}
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
                    >
                      <option value="">Select a field...</option>
                      {Object.entries(RAW_METRIC_CATEGORY_LABELS).map(([cat, catLabel]) => (
                        <optgroup key={cat} label={catLabel}>
                          {RAW_METRIC_OPTIONS.filter(o => o.category === cat).map(o => (
                            <option key={o.id} value={o.id}>{o.label}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-textSecondary mb-1">Aggregation(s) *</label>
                    <div className="flex flex-wrap gap-2">
                      {(['avg', 'max', 'min', 'median', 'sum', 'rate', 'percentile'] as MetricAggregation[]).map(agg => (
                        <label key={agg} className="flex items-center gap-1.5 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={newColumn.aggregations.includes(agg)}
                            onChange={() => toggleAggregation(agg)}
                            className="rounded"
                          />
                          {agg === 'percentile' ? 'Percentile' : AGG_LABELS[agg]}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Percentile value picker */}
                  {newColumn.aggregations.includes('percentile') && (
                    <div>
                      <label className="block text-xs text-textSecondary mb-1">Percentile Value</label>
                      <div className="flex gap-2 items-center">
                        {[25, 75, 90].map(p => (
                          <button
                            key={p}
                            onClick={() => setNewColumn(prev => ({ ...prev, percentileValue: p }))}
                            className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                              newColumn.percentileValue === p ? 'bg-success text-background' : 'bg-card hover:bg-interactive text-textSecondary border border-border'
                            }`}
                          >
                            P{p}
                          </button>
                        ))}
                        <input
                          type="number"
                          min={1}
                          max={99}
                          value={newColumn.percentileValue}
                          onChange={e => setNewColumn(prev => ({ ...prev, percentileValue: parseInt(e.target.value) || 75 }))}
                          className="w-16 px-2 py-1 bg-background border border-border rounded text-xs text-center"
                        />
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-textSecondary mb-1">Format</label>
                      <select
                        value={newColumn.format}
                        onChange={e => setNewColumn(prev => ({ ...prev, format: e.target.value as 'number' | 'percentage' | 'time' | 'count' }))}
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
                      >
                        <option value="number">Number</option>
                        <option value="percentage">Percentage</option>
                        <option value="time">Time (seconds)</option>
                        <option value="count">Count (X/N)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-textSecondary mb-1">Decimals</label>
                      <input
                        type="number"
                        min="0"
                        max="3"
                        value={newColumn.decimals}
                        onChange={e => setNewColumn(prev => ({ ...prev, decimals: parseInt(e.target.value) }))}
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
                      />
                    </div>
                  </div>

                  {/* Preview of columns to be created */}
                  {newColumn.rawMetricId && newColumn.aggregations.length > 0 && (
                    <div className="text-xs text-textSecondary bg-background rounded p-2">
                      Will create {newColumn.aggregations.length} column{newColumn.aggregations.length !== 1 ? 's' : ''}:
                      <span className="text-textPrimary ml-1">
                        {newColumn.aggregations.map(agg => {
                          const prefix = AGG_LABELS[agg];
                          const suffix = agg === 'percentile' ? `${newColumn.percentileValue}` : '';
                          const short = RAW_METRIC_OPTIONS.find(o => o.id === newColumn.rawMetricId)?.shortLabel || newColumn.rawMetricId;
                          return `${prefix}${suffix} ${short}`;
                        }).join(', ')}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-end">
                    <button
                      onClick={handleBulkAdd}
                      disabled={!newColumn.rawMetricId || newColumn.aggregations.length === 0}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-success text-background font-semibold rounded-lg hover:bg-success/90 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Plus size={14} />
                      Add {newColumn.aggregations.length > 1 ? `${newColumn.aggregations.length} Columns` : 'Column'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Quick Templates */}
              <div className="space-y-1.5">
                <h4 className="text-xs font-bold uppercase tracking-wide text-textSecondary">Quick Templates</h4>
                {METRIC_TEMPLATES.map(template => (
                  <button
                    key={template.id}
                    onClick={() => applyTemplate(template)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded bg-card hover:bg-interactive transition-colors text-left"
                  >
                    <Plus size={16} className="text-blueAlliance flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold">{template.name}</span>
                      <span className="block text-xs text-textMuted">{template.description}</span>
                    </div>
                  </button>
                ))}
              </div>

              {/* Disabled default metrics */}
              {filteredDisabledColumns.length > 0 && (
                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold uppercase tracking-wide text-textSecondary">Re-enable Default Metrics</h4>
                  {filteredDisabledColumns.map(col => (
                    <button
                      key={col.id}
                      onClick={() => handleEnableColumn(col.id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded bg-card hover:bg-interactive transition-colors text-left"
                    >
                      <Plus size={16} className="text-success flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-semibold">{col.label}</span>
                        <span className="text-xs text-textMuted ml-2">{CATEGORY_LABELS[col.category || 'overall']}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reset Confirmation */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowResetConfirm(false)}>
          <div className="bg-surface rounded-lg border border-border p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-lg mb-2">Reset to Defaults?</h3>
            <p className="text-textSecondary text-sm mb-6">
              This will remove all custom metrics and restore the default configuration.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 px-4 py-2.5 bg-card border border-border rounded-lg hover:bg-interactive transition-colors font-semibold text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => { resetToDefaults(); setShowResetConfirm(false); }}
                className="flex-1 px-4 py-2.5 bg-danger text-white rounded-lg hover:bg-danger/90 transition-colors font-semibold text-sm"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MetricsSettings;
