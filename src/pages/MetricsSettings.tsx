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

// Available data fields that can be used for metrics
const AVAILABLE_FIELDS = [
  { field: 'avgTotalPoints', label: 'Total Points', category: 'overall' as MetricCategory },
  { field: 'avgAutoPoints', label: 'Auto Points', category: 'overall' as MetricCategory },
  { field: 'avgTeleopPoints', label: 'Teleop Points', category: 'overall' as MetricCategory },
  { field: 'avgEndgamePoints', label: 'Endgame Points', category: 'overall' as MetricCategory },
  { field: 'avgAutoFuelScored', label: 'Auto FUEL Scored', category: 'auto' as MetricCategory },
  { field: 'avgAutoFuelMissed', label: 'Auto FUEL Missed', category: 'auto' as MetricCategory },
  { field: 'autoAccuracy', label: 'Auto Accuracy', category: 'auto' as MetricCategory },
  { field: 'autoMobilityRate', label: 'Auto Mobility Rate', category: 'auto' as MetricCategory },
  { field: 'autoClimbRate', label: 'Auto Climb Rate', category: 'auto' as MetricCategory },
  { field: 'autoClimbSuccessRate', label: 'Auto Climb Success Rate', category: 'auto' as MetricCategory },
  { field: 'avgTeleopFuelScored', label: 'Teleop FUEL Scored', category: 'teleop' as MetricCategory },
  { field: 'avgTeleopFuelMissed', label: 'Teleop FUEL Missed', category: 'teleop' as MetricCategory },
  { field: 'teleopAccuracy', label: 'Teleop Accuracy', category: 'teleop' as MetricCategory },
  { field: 'avgCycleCount', label: 'Cycle Count', category: 'teleop' as MetricCategory },
  { field: 'avgActiveHubScores', label: 'Active Hub Scores', category: 'teleop' as MetricCategory },
  { field: 'avgInactiveHubScores', label: 'Inactive Hub Scores', category: 'teleop' as MetricCategory },
  { field: 'climbAttemptRate', label: 'Climb Attempt Rate', category: 'endgame' as MetricCategory },
  { field: 'level1ClimbRate', label: 'Level 1 Climb Rate', category: 'endgame' as MetricCategory },
  { field: 'level2ClimbRate', label: 'Level 2 Climb Rate', category: 'endgame' as MetricCategory },
  { field: 'level3ClimbRate', label: 'Level 3 Climb Rate', category: 'endgame' as MetricCategory },
  { field: 'avgClimbTime', label: 'Climb Time', category: 'endgame' as MetricCategory },
  { field: 'avgEndgameFuelScored', label: 'Endgame FUEL Scored', category: 'endgame' as MetricCategory },
  { field: 'defensePlayedRate', label: 'Defense Played Rate', category: 'defense' as MetricCategory },
  { field: 'avgDefenseEffectiveness', label: 'Defense Effectiveness', category: 'defense' as MetricCategory },
  { field: 'wasDefendedRate', label: 'Was Defended Rate', category: 'defense' as MetricCategory },
  { field: 'avgDefenseEvasion', label: 'Defense Evasion', category: 'defense' as MetricCategory },
  { field: 'avgDriverSkill', label: 'Driver Skill', category: 'performance' as MetricCategory },
  { field: 'avgIntakeSpeed', label: 'Intake Speed', category: 'performance' as MetricCategory },
  { field: 'avgShootingAccuracy', label: 'Shooting Accuracy', category: 'performance' as MetricCategory },
  { field: 'avgShootingSpeed', label: 'Shooting Speed', category: 'performance' as MetricCategory },
  { field: 'noShowRate', label: 'No Show Rate', category: 'reliability' as MetricCategory },
  { field: 'diedRate', label: 'Died Rate', category: 'reliability' as MetricCategory },
  { field: 'tippedRate', label: 'Tipped Rate', category: 'reliability' as MetricCategory },
  { field: 'mechanicalIssuesRate', label: 'Mechanical Issues Rate', category: 'reliability' as MetricCategory },
  { field: 'yellowCardRate', label: 'Yellow Card Rate', category: 'reliability' as MetricCategory },
  { field: 'redCardRate', label: 'Red Card Rate', category: 'reliability' as MetricCategory },
];

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
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [newColumn, setNewColumn] = useState({
    baseField: '',
    aggregation: 'avg' as MetricAggregation,
    label: '',
    format: 'number' as 'number' | 'percentage' | 'time',
    decimals: 1,
    category: 'overall' as MetricCategory,
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

  // Handle adding a new custom column
  const handleAddColumn = () => {
    if (!newColumn.baseField || !newColumn.label) return;

    const selectedField = AVAILABLE_FIELDS.find(f => f.field === newColumn.baseField);
    const fieldName = newColumn.baseField.replace(/^avg/, '').replace(/Rate$/, '');
    const id = `custom_${newColumn.aggregation}_${fieldName}_${Date.now()}`;

    let actualField = newColumn.baseField;
    if (newColumn.aggregation === 'max') {
      actualField = newColumn.baseField.replace(/^avg/, 'max');
    } else if (newColumn.aggregation === 'min') {
      actualField = newColumn.baseField.replace(/^avg/, 'min');
    }

    const column: MetricColumn = {
      id,
      label: newColumn.label,
      field: actualField,
      aggregation: newColumn.aggregation,
      format: newColumn.format,
      decimals: newColumn.decimals,
      enabled: true,
      description: `Custom: ${newColumn.aggregation} of ${selectedField?.label || newColumn.baseField}`,
      category: selectedField?.category || newColumn.category,
    };

    addColumn(column);
    setShowAddCustom(false);
    setNewColumn({
      baseField: '',
      aggregation: 'avg',
      label: '',
      format: 'number',
      decimals: 1,
      category: 'overall',
    });
  };

  const updateNewColumnLabel = (baseField: string, aggregation: MetricAggregation) => {
    const selectedField = AVAILABLE_FIELDS.find(f => f.field === baseField);
    if (selectedField) {
      const prefix = aggregation === 'avg' ? 'Avg' : aggregation === 'max' ? 'Max' : aggregation === 'min' ? 'Min' : '';
      setNewColumn(prev => ({
        ...prev,
        baseField,
        aggregation,
        label: `${prefix} ${selectedField.label}`.trim(),
        category: selectedField.category,
      }));
    } else {
      setNewColumn(prev => ({ ...prev, baseField, aggregation }));
    }
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
                                onChange={e => setEditForm({ ...editForm, format: e.target.value as 'number' | 'percentage' | 'time' })}
                                className="w-full px-3 py-1.5 bg-background border border-border rounded-lg text-sm"
                              >
                                <option value="number">Number</option>
                                <option value="percentage">Percentage</option>
                                <option value="time">Time (seconds)</option>
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
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setShowAddPicker(false)}>
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
            <div className="flex-1 overflow-y-auto p-4 space-y-1.5 min-h-0">
              {filteredDisabledColumns.length === 0 && !showAddCustom ? (
                <p className="text-center text-textMuted py-4 text-sm">
                  All metrics in this category are already active.
                </p>
              ) : (
                filteredDisabledColumns.map(col => (
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
                ))
              )}

              {/* Custom column builder */}
              {showAddCustom ? (
                <div className="mt-3 p-4 rounded-lg border-2 border-success bg-success/5">
                  <h4 className="font-bold text-sm mb-3">New Custom Metric</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-textSecondary mb-1">Data Field *</label>
                      <select
                        value={newColumn.baseField}
                        onChange={e => updateNewColumnLabel(e.target.value, newColumn.aggregation)}
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
                      >
                        <option value="">Select a field...</option>
                        {(Object.keys(CATEGORY_LABELS) as MetricCategory[]).map(cat => (
                          <optgroup key={cat} label={CATEGORY_LABELS[cat]}>
                            {AVAILABLE_FIELDS.filter(f => f.category === cat).map(f => (
                              <option key={f.field} value={f.field}>{f.label}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-textSecondary mb-1">Type</label>
                        <select
                          value={newColumn.aggregation}
                          onChange={e => updateNewColumnLabel(newColumn.baseField, e.target.value as MetricAggregation)}
                          className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
                        >
                          <option value="avg">Average</option>
                          <option value="max">Maximum</option>
                          <option value="min">Minimum</option>
                          <option value="rate">Rate (%)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-textSecondary mb-1">Label *</label>
                        <input
                          type="text"
                          value={newColumn.label}
                          onChange={e => setNewColumn({ ...newColumn, label: e.target.value })}
                          placeholder="e.g., Max Points"
                          className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-textSecondary mb-1">Format</label>
                        <select
                          value={newColumn.format}
                          onChange={e => setNewColumn({ ...newColumn, format: e.target.value as 'number' | 'percentage' | 'time' })}
                          className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
                        >
                          <option value="number">Number</option>
                          <option value="percentage">Percentage</option>
                          <option value="time">Time (seconds)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-textSecondary mb-1">Decimals</label>
                        <input
                          type="number"
                          min="0"
                          max="3"
                          value={newColumn.decimals}
                          onChange={e => setNewColumn({ ...newColumn, decimals: parseInt(e.target.value) })}
                          className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => setShowAddCustom(false)}
                        className="px-3 py-1.5 text-sm bg-surface hover:bg-interactive rounded-lg border border-border"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleAddColumn}
                        disabled={!newColumn.baseField || !newColumn.label}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-success text-background font-semibold rounded-lg hover:bg-success/90 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Plus size={14} />
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowAddCustom(true)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded border border-dashed border-border hover:border-success hover:bg-success/5 transition-colors text-left mt-2"
                >
                  <Plus size={16} className="text-textMuted" />
                  <span className="text-sm text-textSecondary">Create custom metric...</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reset Confirmation */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setShowResetConfirm(false)}>
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
