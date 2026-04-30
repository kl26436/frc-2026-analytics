import { useState } from 'react';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

function RobotPictures() {
  const robotPictures = useAnalyticsStore(state => state.robotPictures);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  // Group pictures by team number
  const byTeam = new Map<number, { team_number: number; images: string[] }>();
  for (const pic of robotPictures) {
    if (!byTeam.has(pic.team_number)) {
      byTeam.set(pic.team_number, { team_number: pic.team_number, images: [] });
    }
    const entry = byTeam.get(pic.team_number)!;
    // Deduplicate same URL
    if (!entry.images.includes(pic.robot_image_link)) {
      entry.images.push(pic.robot_image_link);
    }
  }
  const teams = Array.from(byTeam.values()).sort((a, b) => a.team_number - b.team_number);

  // Flat list for lightbox navigation
  const allImages = teams.flatMap(t => t.images.map(url => ({ team: t.team_number, url })));

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">Robot Pictures</h1>
      <p className="text-sm text-gray-400 mb-6">
        {robotPictures.length === 0
          ? 'No pictures synced yet. Run a sync from Admin Settings to pull pictures from the database.'
          : `${allImages.length} photos across ${teams.length} teams`}
      </p>

      {teams.map(team => (
        <div key={team.team_number} className="mb-8">
          <h2 className="text-lg font-semibold mb-3 text-blue-400">
            Team {team.team_number}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {team.images.map((url, i) => {
              const flatIdx = allImages.findIndex(img => img.url === url && img.team === team.team_number);
              return (
                <button
                  key={i}
                  onClick={() => setLightboxIdx(flatIdx)}
                  className="aspect-square rounded-lg overflow-hidden border border-gray-700 hover:border-blue-500 transition-colors bg-gray-800"
                >
                  <img
                    src={url}
                    alt={`Team ${team.team_number} robot`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onError={(e) => { (e.target as HTMLImageElement).closest('button')!.style.display = 'none'; }}
                  />
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* Lightbox */}
      {lightboxIdx !== null && allImages[lightboxIdx] && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={() => setLightboxIdx(null)}
        >
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white"
            onClick={() => setLightboxIdx(null)}
          >
            <X size={32} />
          </button>

          <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white text-lg font-semibold">
            Team {allImages[lightboxIdx].team}
          </div>

          {lightboxIdx > 0 && (
            <button
              className="absolute left-4 text-white/70 hover:text-white"
              onClick={(e) => { e.stopPropagation(); setLightboxIdx(lightboxIdx - 1); }}
            >
              <ChevronLeft size={40} />
            </button>
          )}

          <img
            src={allImages[lightboxIdx].url}
            alt={`Team ${allImages[lightboxIdx].team} robot`}
            className="max-h-[85vh] max-w-[90vw] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
            onError={() => setLightboxIdx(null)}
          />

          {lightboxIdx < allImages.length - 1 && (
            <button
              className="absolute right-4 text-white/70 hover:text-white"
              onClick={(e) => { e.stopPropagation(); setLightboxIdx(lightboxIdx + 1); }}
            >
              <ChevronRight size={40} />
            </button>
          )}

          <div className="absolute bottom-4 text-white/50 text-sm">
            {lightboxIdx + 1} / {allImages.length}
          </div>
        </div>
      )}
    </div>
  );
}

export default RobotPictures;
