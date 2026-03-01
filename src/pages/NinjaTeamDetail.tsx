import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronLeft, Send, Camera, Upload, Trash2, Pencil, X, Check, ExternalLink, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import { useNinjaStore } from '../store/useNinjaStore';
import { NINJA_TAGS, NINJA_TAG_LABELS, NINJA_TAG_COLORS, NINJA_CATEGORIES, NINJA_CATEGORY_LABELS, NINJA_CATEGORY_COLORS } from '../types/ninja';
import type { NinjaTag, NinjaCategory, NinjaPhoto } from '../types/ninja';

function NinjaTeamDetail() {
  const { teamNumber: teamParam } = useParams<{ teamNumber: string }>();
  const teamNumber = Number(teamParam);

  const { isAdmin, user } = useAuth();
  const eventCode = useAnalyticsStore(s => s.eventCode);
  const teamStatistics = useAnalyticsStore(s => s.teamStatistics);
  const tbaData = useAnalyticsStore(s => s.tbaData);

  const assignments = useNinjaStore(s => s.assignments);
  const notes = useNinjaStore(s => s.notes);
  const subscribeToAssignments = useNinjaStore(s => s.subscribeToAssignments);
  const subscribeToNotes = useNinjaStore(s => s.subscribeToNotes);
  const addNote = useNinjaStore(s => s.addNote);
  const updateNote = useNinjaStore(s => s.updateNote);
  const deleteNote = useNinjaStore(s => s.deleteNote);
  const uploadNinjaPhoto = useNinjaStore(s => s.uploadNinjaPhoto);
  const unsubscribeAll = useNinjaStore(s => s.unsubscribeAll);

  const [noteText, setNoteText] = useState('');
  const [noteCategory, setNoteCategory] = useState<NinjaCategory>('general');
  const [selectedTags, setSelectedTags] = useState<NinjaTag[]>([]);
  const [matchNumber, setMatchNumber] = useState('');
  const [pendingPhotos, setPendingPhotos] = useState<{ file: File; preview: string; caption: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editCategory, setEditCategory] = useState<NinjaCategory>('general');
  const [editTags, setEditTags] = useState<NinjaTag[]>([]);
  const [editMatchNumber, setEditMatchNumber] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [viewCategory, setViewCategory] = useState<NinjaCategory | 'all'>('all');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Subscribe on mount
  useEffect(() => {
    if (eventCode) {
      subscribeToAssignments(eventCode);
      subscribeToNotes(eventCode);
    }
    return () => unsubscribeAll();
  }, [eventCode, subscribeToAssignments, subscribeToNotes, unsubscribeAll]);

  const userEmail = user?.email?.toLowerCase() ?? '';
  const assignment = assignments[String(teamNumber)];
  const isAssignedNinja = assignment?.ninjaEmail === userEmail;
  const canEdit = isAdmin || isAssignedNinja;

  // Team info
  const teamName = useMemo(() => {
    const tbaTeam = tbaData?.teams?.find(t => t.team_number === teamNumber);
    if (tbaTeam) return tbaTeam.nickname || `Team ${teamNumber}`;
    const stats = teamStatistics.find(t => t.teamNumber === teamNumber);
    return stats?.teamName || `Team ${teamNumber}`;
  }, [teamNumber, tbaData, teamStatistics]);

  // Notes for this team (already sorted newest-first from store)
  const teamNotes = useMemo(() =>
    notes.filter(n => n.teamNumber === teamNumber),
    [notes, teamNumber]
  );

  // Filtered by view category
  const filteredNotes = useMemo(() =>
    viewCategory === 'all' ? teamNotes : teamNotes.filter(n => n.category === viewCategory),
    [teamNotes, viewCategory]
  );

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: teamNotes.length };
    for (const cat of NINJA_CATEGORIES) counts[cat] = 0;
    for (const note of teamNotes) counts[note.category] = (counts[note.category] ?? 0) + 1;
    return counts;
  }, [teamNotes]);

  const toggleTag = (tag: NinjaTag) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || pendingPhotos.length >= 3) return;
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

  const handleSubmitNote = async () => {
    if (!noteText.trim() || !eventCode) return;

    setSaving(true);
    try {
      const photos: NinjaPhoto[] = [];
      for (const pending of pendingPhotos) {
        const result = await uploadNinjaPhoto(teamNumber, eventCode, pending.file);
        photos.push({ url: result.url, path: result.path, caption: pending.caption });
      }

      await addNote(eventCode, {
        teamNumber,
        authorEmail: userEmail,
        authorName: user?.displayName ?? userEmail.split('@')[0],
        text: noteText.trim(),
        category: noteCategory,
        tags: selectedTags,
        matchNumber: matchNumber ? Number(matchNumber) : null,
        photos,
      });

      setNoteText('');
      setSelectedTags([]);
      setMatchNumber('');
      setPendingPhotos([]);
    } catch (err) {
      console.error('Failed to save note:', err);
    } finally {
      setSaving(false);
    }
  };

  const startEditing = (noteId: string) => {
    const note = teamNotes.find(n => n.id === noteId);
    if (!note) return;
    setEditingNoteId(noteId);
    setEditText(note.text);
    setEditCategory(note.category);
    setEditTags([...note.tags]);
    setEditMatchNumber(note.matchNumber ? String(note.matchNumber) : '');
  };

  const handleSaveEdit = async () => {
    if (!editingNoteId || !editText.trim() || !eventCode) return;
    setEditSaving(true);
    try {
      await updateNote(eventCode, editingNoteId, {
        text: editText.trim(),
        tags: editTags,
        matchNumber: editMatchNumber ? Number(editMatchNumber) : null,
      });
      setEditingNoteId(null);
    } catch (err) {
      console.error('Failed to update note:', err);
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!eventCode || !confirm('Delete this note?')) return;
    await deleteNote(eventCode, noteId);
  };

  const formatTimestamp = (iso: string) => {
    const date = new Date(iso);
    const diff = Date.now() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
      ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/ninja" className="p-2 rounded-lg bg-surfaceElevated hover:bg-interactive transition-colors">
          <ChevronLeft size={24} />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold">Team {teamNumber}</h1>
          <p className="text-textSecondary text-sm truncate">{teamName}</p>
        </div>
        <Link
          to={`/teams/${teamNumber}`}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-surfaceElevated rounded-lg hover:bg-interactive transition-colors text-textSecondary"
        >
          <ExternalLink size={14} />
          Stats
        </Link>
      </div>

      {/* Assignment Info */}
      <div className="bg-surface p-4 rounded-lg border border-border">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm text-textMuted">Assigned Ninja</span>
            <p className="font-semibold">
              {assignment ? (
                <span className={isAssignedNinja ? 'text-success' : 'text-textPrimary'}>
                  {assignment.ninjaName}
                  {isAssignedNinja && <span className="text-textMuted font-normal ml-1">(you)</span>}
                </span>
              ) : (
                <span className="text-textMuted italic">Unassigned</span>
              )}
            </p>
          </div>
          <div className="text-right">
            <span className="text-sm text-textMuted">Notes</span>
            <p className="font-bold text-lg">{teamNotes.length}</p>
          </div>
        </div>
      </div>

      {/* New Note Form */}
      {canEdit && (
        <div className="bg-surface p-4 rounded-lg border border-border space-y-3">
          <h2 className="font-bold">Add Note</h2>

          {/* Category selector */}
          <div>
            <label className="text-xs text-textMuted block mb-1.5">Category</label>
            <div className="flex gap-2">
              {NINJA_CATEGORIES.map(cat => (
                <button
                  key={cat}
                  onClick={() => setNoteCategory(cat)}
                  className={`flex-1 px-3 py-2 rounded-lg border text-sm font-semibold transition-colors ${
                    noteCategory === cat
                      ? NINJA_CATEGORY_COLORS[cat]
                      : 'bg-card border-border text-textMuted hover:border-textSecondary'
                  }`}
                >
                  {NINJA_CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>
          </div>

          {/* Text */}
          <textarea
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            rows={3}
            placeholder={
              noteCategory === 'general' ? 'What did you observe? Breakdowns, driver skill, match observations...' :
              noteCategory === 'fix' ? 'What was the issue? What was fixed? Did you help?' :
              'Who did you talk to? What did you learn?'
            }
            className="w-full bg-card border border-border rounded-lg px-3 py-2 text-textPrimary placeholder-textMuted focus:outline-none focus:border-success resize-none"
          />

          {/* Tags */}
          <div>
            <label className="text-xs text-textMuted block mb-1.5">Tags (optional)</label>
            <div className="flex flex-wrap gap-1.5">
              {NINJA_TAGS.map(tag => {
                const isSelected = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={`text-xs px-2 py-1 rounded-lg border transition-colors ${
                      isSelected
                        ? NINJA_TAG_COLORS[tag]
                        : 'bg-card border-border text-textMuted hover:border-textSecondary'
                    }`}
                  >
                    {NINJA_TAG_LABELS[tag]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Match number */}
          <div className="flex items-center gap-3">
            <label className="text-xs text-textMuted">Match #</label>
            <input
              type="number"
              value={matchNumber}
              onChange={e => setMatchNumber(e.target.value)}
              placeholder="Optional"
              min={1}
              className="w-24 px-2 py-1.5 bg-card border border-border rounded-lg text-textPrimary text-sm focus:outline-none focus:border-success"
            />
          </div>

          {/* Photos */}
          {pendingPhotos.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {pendingPhotos.map((pending, idx) => (
                <div key={idx} className="relative">
                  <img src={pending.preview} alt="" className="w-full h-24 object-cover rounded-lg bg-card" />
                  <button
                    onClick={() => setPendingPhotos(prev => prev.filter((_, i) => i !== idx))}
                    className="absolute top-1 right-1 p-1 bg-danger/90 text-white rounded-lg"
                  >
                    <Trash2 size={12} />
                  </button>
                  <input
                    type="text"
                    value={pending.caption}
                    onChange={e => setPendingPhotos(prev => prev.map((p, i) => i === idx ? { ...p, caption: e.target.value } : p))}
                    placeholder="Caption"
                    className="mt-1 w-full text-xs bg-card border border-border rounded px-2 py-1 text-textPrimary"
                  />
                </div>
              ))}
            </div>
          )}

          {/* Action row */}
          <div className="flex items-center gap-2">
            {pendingPhotos.length < 3 && (
              <>
                <button
                  onClick={() => cameraInputRef.current?.click()}
                  className="p-2 rounded-lg bg-card border border-border hover:border-success transition-colors"
                  title="Take photo"
                >
                  <Camera size={18} />
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 rounded-lg bg-card border border-border hover:border-success transition-colors"
                  title="Upload photo"
                >
                  <Upload size={18} />
                </button>
              </>
            )}
            <div className="flex-1" />
            <button
              onClick={handleSubmitNote}
              disabled={!noteText.trim() || saving}
              className="flex items-center gap-2 px-4 py-2 bg-success text-background font-semibold rounded-lg hover:bg-success/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              {saving ? 'Saving...' : 'Post Note'}
            </button>
          </div>

          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handlePhotoCapture} className="hidden" />
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoCapture} className="hidden" />
        </div>
      )}

      {/* Category Filter Tabs */}
      {teamNotes.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setViewCategory('all')}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${
              viewCategory === 'all'
                ? 'bg-success/20 text-success border border-success/30'
                : 'bg-card border border-border text-textMuted hover:border-textSecondary'
            }`}
          >
            All ({categoryCounts.all})
          </button>
          {NINJA_CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setViewCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors border ${
                viewCategory === cat
                  ? NINJA_CATEGORY_COLORS[cat]
                  : 'bg-card border-border text-textMuted hover:border-textSecondary'
              }`}
            >
              {NINJA_CATEGORY_LABELS[cat]} ({categoryCounts[cat]})
            </button>
          ))}
        </div>
      )}

      {/* Notes Feed */}
      {filteredNotes.length > 0 ? (
        <div className="space-y-3">
          {filteredNotes.map(note => {
            const isEditing = editingNoteId === note.id;
            const isAuthor = note.authorEmail === userEmail;
            const canModify = isAuthor || isAdmin;

            return (
              <div key={note.id} className="bg-surface p-4 rounded-lg border border-border">
                {isEditing ? (
                  <div className="space-y-3">
                    {/* Edit category */}
                    <div className="flex gap-2">
                      {NINJA_CATEGORIES.map(cat => (
                        <button
                          key={cat}
                          onClick={() => setEditCategory(cat)}
                          className={`flex-1 px-2 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                            editCategory === cat
                              ? NINJA_CATEGORY_COLORS[cat]
                              : 'bg-card border-border text-textMuted'
                          }`}
                        >
                          {NINJA_CATEGORY_LABELS[cat]}
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={editText}
                      onChange={e => setEditText(e.target.value)}
                      rows={3}
                      className="w-full bg-card border border-border rounded-lg px-3 py-2 text-textPrimary focus:outline-none focus:border-success resize-none"
                    />
                    <div className="flex flex-wrap gap-1.5">
                      {NINJA_TAGS.map(tag => (
                        <button
                          key={tag}
                          onClick={() => setEditTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])}
                          className={`text-xs px-2 py-1 rounded-lg border transition-colors ${
                            editTags.includes(tag)
                              ? NINJA_TAG_COLORS[tag]
                              : 'bg-card border-border text-textMuted hover:border-textSecondary'
                          }`}
                        >
                          {NINJA_TAG_LABELS[tag]}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-textMuted">Match #</label>
                      <input
                        type="number"
                        value={editMatchNumber}
                        onChange={e => setEditMatchNumber(e.target.value)}
                        placeholder="Optional"
                        min={1}
                        className="w-24 px-2 py-1.5 bg-card border border-border rounded-lg text-sm focus:outline-none focus:border-success"
                      />
                      <div className="flex-1" />
                      <button
                        onClick={handleSaveEdit}
                        disabled={!editText.trim() || editSaving}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-success text-background font-semibold rounded-lg text-sm disabled:opacity-50"
                      >
                        {editSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                        Save
                      </button>
                      <button
                        onClick={() => setEditingNoteId(null)}
                        className="p-1.5 rounded text-textMuted hover:text-danger hover:bg-interactive transition-colors"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Header */}
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs px-1.5 py-0.5 rounded border font-semibold ${NINJA_CATEGORY_COLORS[note.category]}`}>
                          {NINJA_CATEGORY_LABELS[note.category]}
                        </span>
                        <span className="font-semibold text-sm">{note.authorName}</span>
                        <span className="text-textMuted text-xs">{formatTimestamp(note.createdAt)}</span>
                        {note.matchNumber && (
                          <span className="text-xs px-1.5 py-0.5 bg-blueAlliance/20 text-blueAlliance rounded border border-blueAlliance/30">
                            Match {note.matchNumber}
                          </span>
                        )}
                      </div>
                      {canModify && (
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => startEditing(note.id)}
                            className="p-1 rounded text-textMuted hover:text-blueAlliance hover:bg-interactive transition-colors"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteNote(note.id)}
                            className="p-1 rounded text-textMuted hover:text-danger hover:bg-interactive transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Tags */}
                    {note.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {note.tags.map(tag => (
                          <span key={tag} className={`text-xs px-1.5 py-0.5 rounded border ${NINJA_TAG_COLORS[tag]}`}>
                            {NINJA_TAG_LABELS[tag]}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Text */}
                    <p className="text-textPrimary text-sm whitespace-pre-wrap">{note.text}</p>

                    {/* Photos */}
                    {note.photos?.length > 0 && (
                      <div className="grid grid-cols-3 gap-2 mt-2">
                        {note.photos.map((photo, idx) => (
                          <div key={idx}>
                            <img
                              src={photo.url}
                              alt={photo.caption || `Photo ${idx + 1}`}
                              className="w-full h-24 object-cover rounded-lg bg-card cursor-pointer"
                              onClick={() => window.open(photo.url, '_blank')}
                            />
                            {photo.caption && (
                              <p className="text-xs text-textMuted mt-0.5">{photo.caption}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Edited indicator */}
                    {note.updatedAt !== note.createdAt && (
                      <p className="text-xs text-textMuted mt-2 italic">edited {formatTimestamp(note.updatedAt)}</p>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-surface p-8 rounded-lg border border-border text-center">
          <p className="text-textMuted">
            {viewCategory === 'all' ? 'No notes yet for this team.' : `No ${NINJA_CATEGORY_LABELS[viewCategory].toLowerCase()} yet.`}
          </p>
          {canEdit && viewCategory === 'all' && <p className="text-textSecondary text-sm mt-1">Add your first observation above.</p>}
        </div>
      )}
    </div>
  );
}

export default NinjaTeamDetail;
