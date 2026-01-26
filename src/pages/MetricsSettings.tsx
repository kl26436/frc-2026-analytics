import { useState, useRef } from 'react';
import { useMetricsStore } from '../store/useMetricsStore';
import {
  Eye,
  EyeOff,
  RefreshCw,
  Settings as SettingsIcon,
  Save,
  Plus,
  Trash2,
  X,
  GripVertical,
} from 'lucide-react';
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
  const [showAddForm, setShowAddForm] = useState(false);
  const [newColumn, setNewColumn] = useState({
    baseField: '',
    aggregation: 'avg' as MetricAggregation,
    label: '',
    format: 'number' as 'number' | 'percentage' | 'time',
    decimals: 1,
    category: 'overall' as MetricCategory,
  });

  // Check if a column is a default one (can't be deleted)
  const isDefaultColumn = (columnId: string) => {
    return DEFAULT_METRICS.some(m => m.id === columnId);
  };

  // Handle adding a new column
  const handleAddColumn = () => {
    if (!newColumn.baseField || !newColumn.label) return;

    const selectedField = AVAILABLE_FIELDS.find(f => f.field === newColumn.baseField);
    const fieldName = newColumn.baseField.replace(/^avg/, '').replace(/Rate$/, '');
    const id = `custom_${newColumn.aggregation}_${fieldName}_${Date.now()}`;

    // Map the base field to the correct stat field based on aggregation
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
    setShowAddForm(false);
    setNewColumn({
      baseField: '',
      aggregation: 'avg',
      label: '',
      format: 'number',
      decimals: 1,
      category: 'overall',
    });
  };

  // Auto-generate label when field or aggregation changes
  const updateNewColumnLabel = (baseField: string, aggregation: MetricAggregation) => {
    const selectedField = AVAILABLE_FIELDS.find(f => f.field === baseField);
    if (selectedField) {
      const prefix = aggregation === 'avg' ? 'Avg' : aggregation === 'max' ? 'Max' : aggregation === 'min' ? 'Min' : aggregation === 'rate' ? '' : '';
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

  const handleCancelEdit = () => {
    setEditingColumn(null);
    setEditForm({});
  };

  const enabledCount = config.columns.filter(c => c.enabled).length;

  const renderColumn = (column: MetricColumn, index: number) => (
    <div
      key={column.id}
      draggable={editingColumn !== column.id}
      onDragStart={() => handleDragStart(column.id)}
      onDragEnter={() => handleDragEnter(column.id)}
      onDragEnd={handleDragEnd}
      onDragOver={(e) => e.preventDefault()}
      className={`p-4 border-b border-border/50 last:border-b-0 transition-all ${
        column.enabled ? 'bg-surface' : 'bg-background opacity-60'
      } ${isDragging && dragItem.current === column.id ? 'opacity-50' : ''} ${
        editingColumn !== column.id ? 'cursor-grab active:cursor-grabbing' : ''
      }`}
    >
      {editingColumn === column.id ? (
        // Edit Mode
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
        <div className="flex items-center gap-3">
          {/* Drag Handle */}
          <div className="text-textMuted hover:text-textSecondary cursor-grab active:cursor-grabbing">
            <GripVertical size={18} />
          </div>

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
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h3 className="font-bold">{column.label}</h3>
              <span className="text-xs px-2 py-0.5 bg-warning/20 text-warning rounded">
                {CATEGORY_LABELS[column.category || 'overall']}
              </span>
              <span className="text-xs px-2 py-0.5 bg-surfaceElevated rounded text-textSecondary">
                {column.aggregation}
              </span>
              <span className="text-xs px-2 py-0.5 bg-surfaceElevated rounded text-textSecondary">
                {column.format}
              </span>
            </div>
          </div>

          {/* Edit Button */}
          <button
            onClick={() => handleEditColumn(column)}
            className="p-2 text-textMuted hover:text-textPrimary rounded transition-colors"
            title="Edit column"
          >
            <SettingsIcon size={18} />
          </button>

          {/* Delete Button (only for custom columns) */}
          {!isDefaultColumn(column.id) && (
            <button
              onClick={() => deleteColumn(column.id)}
              className="p-2 text-textMuted hover:text-danger rounded transition-colors"
              title="Delete custom column"
            >
              <Trash2 size={18} />
            </button>
          )}
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
        <div className="flex gap-2">
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-success text-background font-semibold rounded-lg hover:bg-success/90 transition-colors"
          >
            <Plus size={20} />
            Add Column
          </button>
          <button
            onClick={resetToDefaults}
            className="flex items-center gap-2 px-4 py-2 bg-surface hover:bg-interactive rounded-lg transition-colors border border-border"
          >
            <RefreshCw size={20} />
            Reset to Defaults
          </button>
        </div>
      </div>

      {/* Add Column Form */}
      {showAddForm && (
        <div className="bg-surface p-6 rounded-lg border-2 border-success">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">Add New Column</h2>
            <button
              onClick={() => setShowAddForm(false)}
              className="p-2 text-textMuted hover:text-textPrimary rounded transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm text-textSecondary mb-2">
                Data Field *
              </label>
              <select
                value={newColumn.baseField}
                onChange={e => updateNewColumnLabel(e.target.value, newColumn.aggregation)}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg"
              >
                <option value="">Select a field...</option>
                <optgroup label="Overall">
                  {AVAILABLE_FIELDS.filter(f => f.category === 'overall').map(f => (
                    <option key={f.field} value={f.field}>{f.label}</option>
                  ))}
                </optgroup>
                <optgroup label="Autonomous">
                  {AVAILABLE_FIELDS.filter(f => f.category === 'auto').map(f => (
                    <option key={f.field} value={f.field}>{f.label}</option>
                  ))}
                </optgroup>
                <optgroup label="Teleop">
                  {AVAILABLE_FIELDS.filter(f => f.category === 'teleop').map(f => (
                    <option key={f.field} value={f.field}>{f.label}</option>
                  ))}
                </optgroup>
                <optgroup label="Endgame">
                  {AVAILABLE_FIELDS.filter(f => f.category === 'endgame').map(f => (
                    <option key={f.field} value={f.field}>{f.label}</option>
                  ))}
                </optgroup>
                <optgroup label="Defense">
                  {AVAILABLE_FIELDS.filter(f => f.category === 'defense').map(f => (
                    <option key={f.field} value={f.field}>{f.label}</option>
                  ))}
                </optgroup>
                <optgroup label="Performance">
                  {AVAILABLE_FIELDS.filter(f => f.category === 'performance').map(f => (
                    <option key={f.field} value={f.field}>{f.label}</option>
                  ))}
                </optgroup>
                <optgroup label="Reliability">
                  {AVAILABLE_FIELDS.filter(f => f.category === 'reliability').map(f => (
                    <option key={f.field} value={f.field}>{f.label}</option>
                  ))}
                </optgroup>
              </select>
            </div>

            <div>
              <label className="block text-sm text-textSecondary mb-2">
                Measurement Type *
              </label>
              <select
                value={newColumn.aggregation}
                onChange={e => updateNewColumnLabel(newColumn.baseField, e.target.value as MetricAggregation)}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg"
              >
                <option value="avg">Average</option>
                <option value="max">Maximum</option>
                <option value="min">Minimum</option>
                <option value="rate">Rate (%)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-textSecondary mb-2">
                Display Label *
              </label>
              <input
                type="text"
                value={newColumn.label}
                onChange={e => setNewColumn({ ...newColumn, label: e.target.value })}
                placeholder="e.g., Max Points"
                className="w-full px-3 py-2 bg-background border border-border rounded-lg"
              />
            </div>

            <div>
              <label className="block text-sm text-textSecondary mb-2">
                Format
              </label>
              <select
                value={newColumn.format}
                onChange={e => setNewColumn({ ...newColumn, format: e.target.value as 'number' | 'percentage' | 'time' })}
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
                value={newColumn.decimals}
                onChange={e => setNewColumn({ ...newColumn, decimals: parseInt(e.target.value) })}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 bg-surface hover:bg-interactive rounded-lg transition-colors border border-border"
            >
              Cancel
            </button>
            <button
              onClick={handleAddColumn}
              disabled={!newColumn.baseField || !newColumn.label}
              className="flex items-center gap-2 px-4 py-2 bg-success text-background font-semibold rounded-lg hover:bg-success/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus size={16} />
              Add Column
            </button>
          </div>
        </div>
      )}

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

      {/* All Metrics */}
      <div className="bg-surface rounded-lg border border-border overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="text-lg font-bold">All Metrics</h2>
          <p className="text-sm text-textSecondary mt-1">Drag to reorder. Order here = column order on Teams page.</p>
        </div>
        <div>
          {config.columns.map((col, idx) => renderColumn(col, idx))}
        </div>
      </div>

      {/* Help Section */}
      <div className="bg-surface p-6 rounded-lg border border-border">
        <h2 className="text-lg font-bold mb-4">How It Works</h2>
        <div className="grid md:grid-cols-3 gap-6 text-sm text-textSecondary">
          <div>
            <p className="text-textPrimary font-semibold mb-2">Controls</p>
            <ul className="space-y-1">
              <li><GripVertical size={14} className="inline mr-1" /> Drag to reorder</li>
              <li><Eye size={14} className="inline mr-1" /> Toggle visibility</li>
              <li><SettingsIcon size={14} className="inline mr-1" /> Edit settings</li>
            </ul>
          </div>
          <div>
            <p className="text-textPrimary font-semibold mb-2">Measurements</p>
            <ul className="space-y-1">
              <li><strong>avg</strong> - Mean across all matches</li>
              <li><strong>max</strong> - Best single-match value</li>
              <li><strong>min</strong> - Worst or fastest</li>
              <li><strong>rate</strong> - Percentage of matches</li>
            </ul>
          </div>
          <div>
            <p className="text-textPrimary font-semibold mb-2">Formats</p>
            <ul className="space-y-1">
              <li><strong>Number</strong> - Decimal number</li>
              <li><strong>Percentage</strong> - With % symbol</li>
              <li><strong>Time</strong> - Seconds with 's'</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MetricsSettings;
