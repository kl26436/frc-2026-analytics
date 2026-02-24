import { useState, useRef, useEffect } from 'react';
import { Camera, Upload, Save, Loader2, CheckCircle, ChevronLeft, Trash2 } from 'lucide-react';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import { usePitScoutStore } from '../store/usePitScoutStore';
import { useFirebaseAuth } from '../hooks/useFirebaseAuth';
import { createEmptyPitScoutEntry } from '../types/pitScouting';
import type { PitScoutEntry, DriveType, ClimbLevel, VibeCheck } from '../types/pitScouting';

function PitScouting() {
  const eventCode = useAnalyticsStore(state => state.eventCode);
  const teamStatistics = useAnalyticsStore(state => state.teamStatistics);
  const { entries, error, lastScoutName, setLastScoutName, addEntry, uploadPhoto, loadEntriesFromFirestore } = usePitScoutStore();
  const { user, loading: authLoading, signIn } = useFirebaseAuth();

  // Auto sign-in on mount
  useEffect(() => {
    if (!user && !authLoading) {
      signIn();
    }
  }, [user, authLoading, signIn]);

  const [scoutName, setScoutName] = useState(lastScoutName);
  const [scoutNameConfirmed, setScoutNameConfirmed] = useState(!!lastScoutName);
  const [selectedTeam, setSelectedTeam] = useState<number | null>(null);
  const [formData, setFormData] = useState<Omit<PitScoutEntry, 'id' | 'timestamp'> | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Load entries once authenticated
  useEffect(() => {
    if (eventCode && user) {
      loadEntriesFromFirestore(eventCode).catch(console.error);
    }
  }, [eventCode, user, loadEntriesFromFirestore]);

  // Initialize form when team is selected
  useEffect(() => {
    if (selectedTeam && scoutName) {
      const existing = entries.find(e => e.teamNumber === selectedTeam);
      if (existing) {
        const { id, timestamp, ...rest } = existing;
        setFormData(rest);
        setPhotoPreview(existing.photoUrl);
      } else {
        const teamStats = teamStatistics.find(t => t.teamNumber === selectedTeam);
        setFormData({
          ...createEmptyPitScoutEntry(eventCode, scoutName),
          teamNumber: selectedTeam,
          teamName: teamStats?.teamName || '',
        });
        setPhotoPreview(null);
      }
      setPhotoFile(null);
    }
  }, [selectedTeam, scoutName, eventCode, entries, teamStatistics]);

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      const reader = new FileReader();
      reader.onload = () => setPhotoPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async () => {
    if (!formData || !selectedTeam) return;

    setSaving(true);
    try {
      let photoUrl = formData.photoUrl;
      let photoPath = formData.photoPath;

      // Upload new photo if selected
      if (photoFile) {
        const result = await uploadPhoto(selectedTeam, eventCode, photoFile);
        photoUrl = result.url;
        photoPath = result.path;
      }

      await addEntry({
        ...formData,
        photoUrl,
        photoPath,
        scoutName,
      });

      setLastScoutName(scoutName);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save:', err);
    } finally {
      setSaving(false);
    }
  };

  const updateField = <K extends keyof Omit<PitScoutEntry, 'id' | 'timestamp'>>(
    field: K,
    value: Omit<PitScoutEntry, 'id' | 'timestamp'>[K]
  ) => {
    if (formData) {
      setFormData({ ...formData, [field]: value });
    }
  };

  // Teams that haven't been scouted yet
  const unscoutedTeams = teamStatistics.filter(
    t => !entries.some(e => e.teamNumber === t.teamNumber)
  );
  const scoutedTeams = teamStatistics.filter(
    t => entries.some(e => e.teamNumber === t.teamNumber)
  );

  // Auth loading
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 size={32} className="animate-spin text-textSecondary" />
      </div>
    );
  }

  // Scout name entry
  if (!scoutNameConfirmed) {
    const handleConfirmName = () => {
      if (scoutName.trim()) {
        setScoutNameConfirmed(true);
        setLastScoutName(scoutName.trim());
      }
    };

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Pit Scouting</h1>
          <p className="text-textSecondary mt-1">REBUILT 2026 • {eventCode}</p>
        </div>

        <div className="bg-surface p-6 rounded-lg border border-border max-w-md">
          <h2 className="text-xl font-bold mb-4">Enter Your Name</h2>
          <input
            type="text"
            value={scoutName}
            onChange={e => setScoutName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleConfirmName()}
            placeholder="Scout name"
            className="w-full bg-card border border-border rounded-lg px-4 py-3 text-textPrimary placeholder-textMuted focus:outline-none focus:border-success text-lg"
            autoFocus
          />
          <p className="text-textSecondary text-sm mt-2">
            Your name will be saved with each pit scout entry.
          </p>
          <button
            onClick={handleConfirmName}
            disabled={!scoutName.trim()}
            className="mt-4 w-full px-4 py-3 bg-success text-background font-bold rounded-lg hover:bg-success/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  // Team selection
  if (!selectedTeam) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Pit Scouting</h1>
          <p className="text-textSecondary mt-1">
            Scout: <span className="text-textPrimary font-semibold">{scoutName}</span>
            <button onClick={() => setScoutNameConfirmed(false)} className="text-blueAlliance ml-2 text-sm">(change)</button>
          </p>
        </div>

        {error && (
          <div className="bg-danger/10 border border-danger/30 text-danger px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Progress */}
        <div className="bg-surface p-4 rounded-lg border border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-textSecondary">Progress</span>
            <span className="font-bold">{entries.length} / {teamStatistics.length}</span>
          </div>
          <div className="w-full bg-card rounded-full h-2">
            <div
              className="bg-success h-2 rounded-full transition-all"
              style={{ width: `${(entries.length / teamStatistics.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Unscouted Teams */}
        <div className="bg-surface p-4 rounded-lg border border-border">
          <h2 className="text-lg font-bold mb-3">Unscouted Teams ({unscoutedTeams.length})</h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {unscoutedTeams.map(team => (
              <button
                key={team.teamNumber}
                onClick={() => setSelectedTeam(team.teamNumber)}
                className="px-3 py-2 bg-card border border-border rounded-lg hover:bg-interactive hover:border-success transition-colors text-center"
              >
                <span className="font-bold">{team.teamNumber}</span>
              </button>
            ))}
          </div>
          {unscoutedTeams.length === 0 && (
            <p className="text-textSecondary text-center py-4">All teams scouted!</p>
          )}
        </div>

        {/* Scouted Teams (for editing) */}
        {scoutedTeams.length > 0 && (
          <div className="bg-surface p-4 rounded-lg border border-border">
            <h2 className="text-lg font-bold mb-3">Scouted Teams ({scoutedTeams.length})</h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {scoutedTeams.map(team => (
                <button
                  key={team.teamNumber}
                  onClick={() => setSelectedTeam(team.teamNumber)}
                  className="px-3 py-2 bg-success/10 border border-success/30 rounded-lg hover:bg-success/20 transition-colors text-center"
                >
                  <span className="font-bold text-success">{team.teamNumber}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Form
  if (!formData) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 size={32} className="animate-spin text-textSecondary" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => setSelectedTeam(null)}
          className="p-2 rounded-lg bg-surfaceElevated hover:bg-interactive transition-colors"
        >
          <ChevronLeft size={24} />
        </button>
        <div>
          <h1 className="text-2xl font-bold">Team {selectedTeam}</h1>
          <p className="text-textSecondary text-sm">{formData.teamName || 'Unknown Team'}</p>
        </div>
      </div>

      {/* Photo Section */}
      <div className="bg-surface p-4 rounded-lg border border-border">
        <h2 className="font-bold mb-3">Robot Photo</h2>

        {photoPreview ? (
          <div className="relative">
            <img
              src={photoPreview}
              alt="Robot"
              className="w-full max-h-64 object-contain rounded-lg bg-card"
            />
            <button
              onClick={() => {
                setPhotoFile(null);
                setPhotoPreview(null);
                updateField('photoUrl', null);
                updateField('photoPath', null);
              }}
              className="absolute top-2 right-2 p-2 bg-danger/90 text-white rounded-lg hover:bg-danger transition-colors"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ) : (
          <div className="flex gap-3">
            <button
              onClick={() => cameraInputRef.current?.click()}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-8 bg-card border-2 border-dashed border-border rounded-lg hover:border-success hover:bg-success/5 transition-colors"
            >
              <Camera size={24} />
              <span>Take Photo</span>
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-8 bg-card border-2 border-dashed border-border rounded-lg hover:border-success hover:bg-success/5 transition-colors"
            >
              <Upload size={24} />
              <span>Upload</span>
            </button>
          </div>
        )}

        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handlePhotoCapture}
          className="hidden"
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handlePhotoCapture}
          className="hidden"
        />
      </div>

      {/* Drive Type */}
      <div className="bg-surface p-4 rounded-lg border border-border">
        <h2 className="font-bold mb-3">Drive Type *</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(['swerve', 'tank', 'mecanum', 'other'] as DriveType[]).map(type => (
            <button
              key={type}
              onClick={() => updateField('driveType', type)}
              className={`px-4 py-3 rounded-lg border font-semibold capitalize transition-colors ${
                formData.driveType === type
                  ? 'bg-success/20 border-success text-success'
                  : 'bg-card border-border hover:border-success'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Fuel Intake */}
      <div className="bg-surface p-4 rounded-lg border border-border">
        <h2 className="font-bold mb-3">FUEL Intake</h2>
        <div className="space-y-2">
          {[
            { key: 'fuelIntakeGround', label: 'Ground Pickup' },
            { key: 'fuelIntakeChute', label: 'From CHUTE (Human Player)' },
            { key: 'fuelIntakeOutpost', label: 'From OUTPOST' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => updateField(key as keyof typeof formData, !formData[key as keyof typeof formData])}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-colors ${
                formData[key as keyof typeof formData]
                  ? 'bg-success/20 border-success'
                  : 'bg-card border-border hover:border-textSecondary'
              }`}
            >
              <span>{label}</span>
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                formData[key as keyof typeof formData] ? 'border-success bg-success' : 'border-textMuted'
              }`}>
                {formData[key as keyof typeof formData] && <CheckCircle size={14} className="text-background" />}
              </div>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4 mt-4">
          <div>
            <label className="text-sm text-textSecondary block mb-1">Capacity (# FUEL)</label>
            <input
              type="number"
              value={formData.fuelCapacity}
              onChange={e => updateField('fuelCapacity', parseInt(e.target.value) || 0)}
              min={0}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-textPrimary"
            />
          </div>
          <div>
            <label className="text-sm text-textSecondary block mb-1">Cycle Time (sec)</label>
            <input
              type="number"
              value={formData.fuelCycleTime}
              onChange={e => updateField('fuelCycleTime', parseInt(e.target.value) || 0)}
              min={0}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-textPrimary"
            />
          </div>
        </div>
      </div>

      {/* Scoring & Obstacles */}
      <div className="bg-surface p-4 rounded-lg border border-border">
        <h2 className="font-bold mb-3">Scoring & Obstacles</h2>
        <div className="space-y-2">
          {[
            { key: 'canScoreActiveHub', label: 'Can Score in Active HUB' },
            { key: 'canCrossBumps', label: 'Can Cross BUMPS' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => updateField(key as keyof typeof formData, !formData[key as keyof typeof formData])}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-colors ${
                formData[key as keyof typeof formData]
                  ? 'bg-success/20 border-success'
                  : 'bg-card border-border hover:border-textSecondary'
              }`}
            >
              <span>{label}</span>
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                formData[key as keyof typeof formData] ? 'border-success bg-success' : 'border-textMuted'
              }`}>
                {formData[key as keyof typeof formData] && <CheckCircle size={14} className="text-background" />}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Tower Climb */}
      <div className="bg-surface p-4 rounded-lg border border-border">
        <h2 className="font-bold mb-3">TOWER Climb *</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {([
            { value: 'level3', label: 'Level 3', points: '30pts' },
            { value: 'level2', label: 'Level 2', points: '20pts' },
            { value: 'level1', label: 'Level 1', points: '10pts' },
            { value: 'none', label: 'None', points: '—' },
          ] as { value: ClimbLevel; label: string; points: string }[]).map(({ value, label, points }) => (
            <button
              key={value}
              onClick={() => updateField('climbLevel', value)}
              className={`px-4 py-3 rounded-lg border transition-colors ${
                formData.climbLevel === value
                  ? 'bg-success/20 border-success text-success'
                  : 'bg-card border-border hover:border-success'
              }`}
            >
              <div className="font-semibold">{label}</div>
              <div className="text-xs text-textSecondary">{points}</div>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4 mt-4">
          <div>
            <label className="text-sm text-textSecondary block mb-1">Climb Time (sec)</label>
            <input
              type="number"
              value={formData.climbTime}
              onChange={e => updateField('climbTime', parseInt(e.target.value) || 0)}
              min={0}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-textPrimary"
            />
          </div>
          <button
            onClick={() => updateField('canAssistClimb', !formData.canAssistClimb)}
            className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border transition-colors ${
              formData.canAssistClimb
                ? 'bg-success/20 border-success'
                : 'bg-card border-border hover:border-success'
            }`}
          >
            <span className="text-sm">Can Assist Climb</span>
          </button>
        </div>
      </div>

      {/* Auto */}
      <div className="bg-surface p-4 rounded-lg border border-border">
        <h2 className="font-bold mb-3">Auto Capabilities</h2>
        <div className="space-y-2">
          {[
            { key: 'autoMobility', label: 'Can Leave Starting Zone' },
            { key: 'autoClimbLevel1', label: 'Can Reach LEVEL 1 in Auto' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => updateField(key as keyof typeof formData, !formData[key as keyof typeof formData])}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-colors ${
                formData[key as keyof typeof formData]
                  ? 'bg-success/20 border-success'
                  : 'bg-card border-border hover:border-textSecondary'
              }`}
            >
              <span>{label}</span>
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                formData[key as keyof typeof formData] ? 'border-success bg-success' : 'border-textMuted'
              }`}>
                {formData[key as keyof typeof formData] && <CheckCircle size={14} className="text-background" />}
              </div>
            </button>
          ))}
        </div>

        <div className="mt-4">
          <label className="text-sm text-textSecondary block mb-1">Auto FUEL Scored (typical)</label>
          <input
            type="number"
            value={formData.autoFuelCapability}
            onChange={e => updateField('autoFuelCapability', parseInt(e.target.value) || 0)}
            min={0}
            max={50}
            className="w-full bg-card border border-border rounded-lg px-3 py-2 text-textPrimary"
          />
        </div>

        <div className="mt-4">
          <label className="text-sm text-textSecondary block mb-1">Auto Notes</label>
          <textarea
            value={formData.autoNotes}
            onChange={e => updateField('autoNotes', e.target.value)}
            rows={2}
            className="w-full bg-card border border-border rounded-lg px-3 py-2 text-textPrimary resize-none"
            placeholder="Starting positions, paths, etc."
          />
        </div>
      </div>

      {/* General Info */}
      <div className="bg-surface p-4 rounded-lg border border-border">
        <h2 className="font-bold mb-3">General Info</h2>

        <div className="space-y-4">
          <div>
            <label className="text-sm text-textSecondary block mb-1">Coach Name *</label>
            <input
              type="text"
              value={formData.coachName}
              onChange={e => updateField('coachName', e.target.value)}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-textPrimary"
              placeholder="Enter coach name"
            />
          </div>

          <div>
            <label className="text-sm text-textSecondary block mb-1">Number of Batteries</label>
            <div className="flex gap-2 flex-wrap">
              {[1, 2, 3, 4, 5, 6, 7].map(num => (
                <button
                  key={num}
                  onClick={() => updateField('batteryCount', num)}
                  className={`w-10 h-10 rounded-lg border font-bold transition-colors ${
                    formData.batteryCount === num
                      ? 'bg-success/20 border-success text-success'
                      : 'bg-card border-border hover:border-success'
                  }`}
                >
                  {num}{num === 7 ? '+' : ''}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Vibe Check */}
      <div className="bg-surface p-4 rounded-lg border border-border">
        <h2 className="font-bold mb-3">Vibe Check *</h2>
        <div className="grid grid-cols-2 gap-3">
          {([
            { value: 'good', label: '✓', color: 'success' },
            { value: 'bad', label: '✗', color: 'danger' },
          ] as { value: VibeCheck; label: string; color: string }[]).map(({ value, label, color }) => (
            <button
              key={value}
              onClick={() => updateField('vibeCheck', value)}
              className={`px-6 py-4 rounded-lg border text-3xl font-bold transition-colors ${
                formData.vibeCheck === value
                  ? color === 'success'
                    ? 'bg-success/20 border-success text-success'
                    : 'bg-danger/20 border-danger text-danger'
                  : 'bg-card border-border hover:border-textSecondary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div className="bg-surface p-4 rounded-lg border border-border">
        <h2 className="font-bold mb-3">Additional Notes</h2>

        <div className="space-y-4">
          <div>
            <label className="text-sm text-textSecondary block mb-1">Special Features</label>
            <textarea
              value={formData.specialFeatures}
              onChange={e => updateField('specialFeatures', e.target.value)}
              rows={2}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-textPrimary resize-none"
              placeholder="Unique capabilities, mechanisms..."
            />
          </div>

          <div>
            <label className="text-sm text-textSecondary block mb-1">Concerns</label>
            <textarea
              value={formData.concerns}
              onChange={e => updateField('concerns', e.target.value)}
              rows={2}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-textPrimary resize-none"
              placeholder="Issues observed, reliability concerns..."
            />
          </div>

          <div>
            <label className="text-sm text-textSecondary block mb-1">Other Notes</label>
            <textarea
              value={formData.notes}
              onChange={e => updateField('notes', e.target.value)}
              rows={2}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-textPrimary resize-none"
              placeholder="Anything else..."
            />
          </div>
        </div>
      </div>

      {/* Submit Button (Fixed at bottom) */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t border-border">
        <div className="max-w-7xl mx-auto">
          <button
            onClick={handleSubmit}
            disabled={saving || !formData.coachName.trim()}
            className={`w-full flex items-center justify-center gap-2 px-6 py-4 font-bold text-lg rounded-lg transition-colors ${
              saved
                ? 'bg-success text-background'
                : 'bg-success text-background hover:bg-success/90 disabled:opacity-50 disabled:cursor-not-allowed'
            }`}
          >
            {saving ? (
              <Loader2 size={24} className="animate-spin" />
            ) : saved ? (
              <>
                <CheckCircle size={24} />
                Saved!
              </>
            ) : (
              <>
                <Save size={24} />
                Save Entry
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default PitScouting;
