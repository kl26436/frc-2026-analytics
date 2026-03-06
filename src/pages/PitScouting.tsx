import { useState, useRef, useEffect } from 'react';
import { Camera, Upload, Save, Loader2, CheckCircle, ChevronLeft, Trash2, Star } from 'lucide-react';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import { usePitScoutStore } from '../store/usePitScoutStore';
import { useFirebaseAuth } from '../hooks/useFirebaseAuth';
import { createEmptyPitScoutEntry } from '../types/pitScouting';
import type { PitScoutEntry, DriveType, ClimbLevel, VibeCheck, ProgrammingLanguage, DriverExperience, DriveTeamRole } from '../types/pitScouting';

function PitScouting() {
  const eventCode = useAnalyticsStore(state => state.eventCode);
  const teamStatistics = useAnalyticsStore(state => state.teamStatistics);
  const { entries, error, lastScoutName, setLastScoutName, addEntry, uploadPhoto, deletePhoto, loadEntriesFromFirestore } = usePitScoutStore();
  const { user, loading: authLoading, signIn } = useFirebaseAuth();

  // Auto sign-in on mount
  useEffect(() => {
    if (!user && !authLoading) {
      signIn();
    }
  }, [user, authLoading, signIn]);

  const scoutName = user?.displayName || lastScoutName || 'Unknown Scout';
  const [selectedTeam, setSelectedTeam] = useState<number | null>(null);
  const [formData, setFormData] = useState<Omit<PitScoutEntry, 'id' | 'timestamp'> | null>(null);
  const [pendingPhotos, setPendingPhotos] = useState<{ file: File; preview: string; caption: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Load entries once authenticated
  useEffect(() => {
    if (eventCode && user) {
      loadEntriesFromFirestore(eventCode).catch(() => {});
    }
  }, [eventCode, user, loadEntriesFromFirestore]);

  // Initialize form when team is selected
  useEffect(() => {
    if (selectedTeam && scoutName) {
      const existing = entries.find(e => e.teamNumber === selectedTeam);
      if (existing) {
        const { id, timestamp, ...rest } = existing;
        setFormData(rest);
      } else {
        const teamStats = teamStatistics.find(t => t.teamNumber === selectedTeam);
        setFormData({
          ...createEmptyPitScoutEntry(eventCode, scoutName),
          teamNumber: selectedTeam,
          teamName: teamStats?.teamName || '',
        });
      }
      setPendingPhotos([]);
    }
  }, [selectedTeam, scoutName, eventCode, entries, teamStatistics]);

  const totalPhotos = (formData?.photos?.length ?? 0) + pendingPhotos.length;

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || totalPhotos >= 5) return;

    const reader = new FileReader();
    reader.onload = () => {
      setPendingPhotos(prev => [...prev, {
        file,
        preview: reader.result as string,
        caption: '',
      }]);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSubmit = async () => {
    if (!formData || !selectedTeam) return;

    setSaving(true);
    try {
      const photos = [...(formData.photos || [])];

      for (const pending of pendingPhotos) {
        const result = await uploadPhoto(selectedTeam, eventCode, pending.file);
        photos.push({
          url: result.url,
          path: result.path,
          caption: pending.caption,
          isPrimary: photos.length === 0,
        });
      }

      await addEntry({
        ...formData,
        photos,
        scoutName,
      });

      setPendingPhotos([]);
      setLastScoutName(scoutName);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // save failed — setSaving(false) in finally handles UI
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

  // Team selection
  if (!selectedTeam) {
    return (
      <div className="space-y-4 md:space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Pit Scouting</h1>
          <p className="text-textSecondary mt-1">
            Scout: <span className="text-textPrimary font-semibold">{scoutName}</span>
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
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold">Robot Photos</h2>
          <span className="text-sm text-textSecondary">{totalPhotos} / 5</span>
        </div>

        {totalPhotos > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
            {/* Existing uploaded photos */}
            {formData.photos?.map((photo, idx) => (
              <div key={photo.path} className="relative">
                <img
                  src={photo.url}
                  alt={photo.caption || `Photo ${idx + 1}`}
                  className="w-full h-32 object-cover rounded-lg bg-card"
                />
                <button
                  onClick={() => {
                    const updated = formData.photos.map((p, i) => ({
                      ...p,
                      isPrimary: i === idx,
                    }));
                    updateField('photos', updated);
                  }}
                  className={`absolute top-1 left-1 p-1 rounded-lg transition-colors ${
                    photo.isPrimary
                      ? 'bg-warning/90 text-background'
                      : 'bg-black/50 text-white hover:bg-warning/70'
                  }`}
                  title={photo.isPrimary ? 'Primary photo' : 'Set as primary'}
                >
                  <Star size={14} fill={photo.isPrimary ? 'currentColor' : 'none'} />
                </button>
                <button
                  onClick={async () => {
                    await deletePhoto(photo.path);
                    const updated = formData.photos.filter((_, i) => i !== idx);
                    if (photo.isPrimary && updated.length > 0) {
                      updated[0] = { ...updated[0], isPrimary: true };
                    }
                    updateField('photos', updated);
                  }}
                  className="absolute top-1 right-1 p-1 bg-danger/90 text-white rounded-lg hover:bg-danger transition-colors"
                >
                  <Trash2 size={14} />
                </button>
                <input
                  type="text"
                  value={photo.caption}
                  onChange={e => {
                    const updated = [...formData.photos];
                    updated[idx] = { ...updated[idx], caption: e.target.value };
                    updateField('photos', updated);
                  }}
                  placeholder="Caption (optional)"
                  className="mt-1 w-full text-xs bg-card border border-border rounded px-2 py-1 text-textPrimary"
                />
              </div>
            ))}

            {/* Pending photos (not yet uploaded) */}
            {pendingPhotos.map((pending, idx) => (
              <div key={idx} className="relative opacity-80">
                <img
                  src={pending.preview}
                  alt={`New photo ${idx + 1}`}
                  className="w-full h-32 object-cover rounded-lg bg-card"
                />
                <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-warning/90 text-background text-xs rounded font-semibold">
                  NEW
                </div>
                <button
                  onClick={() => setPendingPhotos(prev => prev.filter((_, i) => i !== idx))}
                  className="absolute top-1 right-1 p-1 bg-danger/90 text-white rounded-lg hover:bg-danger transition-colors"
                >
                  <Trash2 size={14} />
                </button>
                <input
                  type="text"
                  value={pending.caption}
                  onChange={e => {
                    setPendingPhotos(prev => prev.map((p, i) =>
                      i === idx ? { ...p, caption: e.target.value } : p
                    ));
                  }}
                  placeholder="Caption (optional)"
                  className="mt-1 w-full text-xs bg-card border border-border rounded px-2 py-1 text-textPrimary"
                />
              </div>
            ))}
          </div>
        )}

        {/* Add photo buttons */}
        {totalPhotos < 5 && (
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

      {/* Programming Language */}
      <div className="bg-surface p-4 rounded-lg border border-border">
        <h2 className="font-bold mb-3">Programming Language</h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {(['java', 'cpp', 'python', 'labview', 'other'] as ProgrammingLanguage[]).map(lang => (
            <button
              key={lang}
              onClick={() => updateField('programmingLanguage', lang)}
              className={`px-4 py-3 rounded-lg border font-semibold transition-colors ${
                formData.programmingLanguage === lang
                  ? 'bg-success/20 border-success text-success'
                  : 'bg-card border-border hover:border-success'
              }`}
            >
              {lang === 'cpp' ? 'C++' : lang.charAt(0).toUpperCase() + lang.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Field Navigation */}
      <div className="bg-surface p-4 rounded-lg border border-border">
        <h2 className="font-bold mb-3">Field Navigation</h2>
        <button
          onClick={() => updateField('canGoUnderTrench', !formData.canGoUnderTrench)}
          className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-colors ${
            formData.canGoUnderTrench
              ? 'bg-success/20 border-success'
              : 'bg-card border-border hover:border-textSecondary'
          }`}
        >
          <span>Can Go Under TRENCH</span>
          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
            formData.canGoUnderTrench ? 'border-success bg-success' : 'border-textMuted'
          }`}>
            {formData.canGoUnderTrench && <CheckCircle size={14} className="text-background" />}
          </div>
        </button>
      </div>

      {/* Tower Climb */}
      <div className="bg-surface p-4 rounded-lg border border-border">
        <h2 className="font-bold mb-3">TOWER Climb *</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(['level3', 'level2', 'level1', 'none'] as ClimbLevel[]).map(value => (
            <button
              key={value}
              onClick={() => updateField('climbLevel', value)}
              className={`px-4 py-3 rounded-lg border font-semibold capitalize transition-colors ${
                formData.climbLevel === value
                  ? 'bg-success/20 border-success text-success'
                  : 'bg-card border-border hover:border-success'
              }`}
            >
              {value === 'level1' ? 'Level 1' : value === 'level2' ? 'Level 2' : value === 'level3' ? 'Level 3' : 'None'}
            </button>
          ))}
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

          <button
            onClick={() => {
              const newValue = !formData.rotatesDriveTeam;
              setFormData({
                ...formData,
                rotatesDriveTeam: newValue,
                rotatingRoles: newValue ? formData.rotatingRoles : [],
              });
            }}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-colors ${
              formData.rotatesDriveTeam
                ? 'bg-success/20 border-success'
                : 'bg-card border-border hover:border-textSecondary'
            }`}
          >
            <span>Rotates Drive Team Members</span>
            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
              formData.rotatesDriveTeam ? 'border-success bg-success' : 'border-textMuted'
            }`}>
              {formData.rotatesDriveTeam && <CheckCircle size={14} className="text-background" />}
            </div>
          </button>

          {formData.rotatesDriveTeam && (
            <div className="ml-4">
              <p className="text-sm text-textSecondary mb-2">Which roles rotate?</p>
              <div className="flex flex-wrap gap-2">
                {([
                  { value: 'driver' as DriveTeamRole, label: 'Driver' },
                  { value: 'driveCoach' as DriveTeamRole, label: 'Drive Coach' },
                  { value: 'humanPlayer' as DriveTeamRole, label: 'Human Player' },
                ]).map(({ value, label }) => {
                  const selected = formData.rotatingRoles.includes(value);
                  return (
                    <button
                      key={value}
                      onClick={() => {
                        const roles = selected
                          ? formData.rotatingRoles.filter(r => r !== value)
                          : [...formData.rotatingRoles, value];
                        updateField('rotatingRoles', roles);
                      }}
                      className={`px-4 py-2 rounded-lg border font-semibold transition-colors ${
                        selected
                          ? 'bg-success/20 border-success text-success'
                          : 'bg-card border-border hover:border-success'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <label className="text-sm text-textSecondary block mb-1">Driver Experience</label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { value: '1stYear', label: '1st Year' },
                { value: '2ndYear', label: '2nd Year' },
                { value: '3plusYears', label: '3+ Years' },
              ] as { value: DriverExperience; label: string }[]).map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => updateField('driverExperience', value)}
                  className={`px-4 py-3 rounded-lg border font-semibold transition-colors ${
                    formData.driverExperience === value
                      ? 'bg-success/20 border-success text-success'
                      : 'bg-card border-border hover:border-success'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Vibe Check */}
      <div className="bg-surface p-4 rounded-lg border border-border">
        <h2 className="font-bold mb-3">Vibe Check *</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
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
