import { Link } from 'react-router-dom';
import { Eye, Image as ImageIcon } from 'lucide-react';
import {
  NINJA_CATEGORY_LABELS,
  NINJA_CATEGORY_COLORS,
  NINJA_TAG_LABELS,
  NINJA_TAG_COLORS,
} from '../../types/ninja';

interface NinjaNote {
  id: string;
  category: keyof typeof NINJA_CATEGORY_LABELS;
  tags: Array<keyof typeof NINJA_TAG_LABELS>;
  text: string;
  authorName: string;
  createdAt: string;
  matchNumber?: number | null;
  photos?: { url: string; caption?: string }[];
}

interface NinjaAssignment {
  ninjaName: string;
}

interface PitScoutDisplay {
  primaryPhotoUrl: string | null;
  photoCount: number;
}

interface NotesTabProps {
  teamNum: number;
  teamNinjaNotes: NinjaNote[];
  ninjaAssignment: NinjaAssignment | null | undefined;
  pitScout: PitScoutDisplay;
  onOpenPhotos: () => void;
}

export function NotesTab({
  teamNum,
  teamNinjaNotes,
  ninjaAssignment,
  pitScout,
  onOpenPhotos,
}: NotesTabProps) {
  const noNotes = teamNinjaNotes.length === 0;
  const noPhotos = pitScout.photoCount === 0;

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Robot photos */}
      <div className="bg-surface rounded-lg border border-border p-4 md:p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <ImageIcon size={20} />
            Robot Photos
          </h3>
          {!noPhotos && (
            <button
              onClick={onOpenPhotos}
              className="text-sm text-blueAlliance hover:underline"
            >
              View all ({pitScout.photoCount})
            </button>
          )}
        </div>
        {noPhotos ? (
          <p className="text-sm text-textMuted mt-2">No robot photos available.</p>
        ) : (
          pitScout.primaryPhotoUrl && (
            <button
              onClick={onOpenPhotos}
              className="mt-3 block w-full max-w-md mx-auto"
              title="View all photos"
            >
              <img
                src={pitScout.primaryPhotoUrl}
                alt={`Team ${teamNum} robot`}
                className="w-full h-auto rounded-lg border border-border hover:border-blueAlliance transition-colors"
              />
            </button>
          )
        )}
      </div>

      {/* Ninja notes */}
      <div className="bg-surface rounded-lg border border-border p-4 md:p-5">
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Eye size={20} />
            Ninja Notes {teamNinjaNotes.length > 0 && `(${teamNinjaNotes.length})`}
          </h3>
          {teamNinjaNotes.length > 0 && (
            <Link
              to={`/ninja/${teamNum}`}
              className="text-sm text-blueAlliance hover:underline"
            >
              View all &rarr;
            </Link>
          )}
        </div>
        {ninjaAssignment && (
          <p className="text-xs text-textMuted mb-3">
            Ninja: <span className="text-textSecondary font-medium">{ninjaAssignment.ninjaName}</span>
          </p>
        )}
        {noNotes ? (
          <p className="text-sm text-textMuted">No notes recorded for this team yet.</p>
        ) : (
          <div className="space-y-3">
            {teamNinjaNotes.slice(0, 10).map(note => (
              <div key={note.id} className="p-3 bg-surfaceElevated rounded-lg">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className={`text-xs px-1.5 py-0.5 rounded border font-semibold ${NINJA_CATEGORY_COLORS[note.category]}`}>
                    {NINJA_CATEGORY_LABELS[note.category]}
                  </span>
                  <span className="text-xs text-textMuted">{note.authorName}</span>
                  <span className="text-xs text-textMuted">
                    {(() => {
                      const diff = Date.now() - new Date(note.createdAt).getTime();
                      const mins = Math.floor(diff / 60000);
                      if (mins < 60) return `${mins}m ago`;
                      const hours = Math.floor(mins / 60);
                      if (hours < 24) return `${hours}h ago`;
                      return new Date(note.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' });
                    })()}
                  </span>
                  {note.matchNumber && (
                    <span className="text-xs px-1.5 py-0.5 bg-blueAlliance/20 text-blueAlliance rounded border border-blueAlliance/30">
                      Match {note.matchNumber}
                    </span>
                  )}
                </div>
                {note.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-1">
                    {note.tags.map(tag => (
                      <span key={tag} className={`text-xs px-1.5 py-0.5 rounded border ${NINJA_TAG_COLORS[tag]}`}>
                        {NINJA_TAG_LABELS[tag]}
                      </span>
                    ))}
                  </div>
                )}
                <p className="text-sm text-textSecondary whitespace-pre-wrap">{note.text}</p>
                {note.photos && note.photos.length > 0 && (
                  <div className="flex gap-2 mt-2">
                    {note.photos.map((photo, idx) => (
                      <img
                        key={idx}
                        src={photo.url}
                        alt={photo.caption || ''}
                        className="w-16 h-16 object-cover rounded-lg bg-card cursor-pointer"
                        onClick={() => window.open(photo.url, '_blank')}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
            {teamNinjaNotes.length > 10 && (
              <Link to={`/ninja/${teamNum}`} className="block text-center text-sm text-blueAlliance hover:underline py-2">
                View all {teamNinjaNotes.length} notes &rarr;
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default NotesTab;
