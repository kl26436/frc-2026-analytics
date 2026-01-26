import { useState } from 'react';

interface UseComparisonModeReturn {
  isCompareMode: boolean;
  selectedTeams: number[];
  toggleCompareMode: () => void;
  toggleTeamSelection: (teamNumber: number) => void;
  clearSelection: () => void;
  canCompare: boolean;
}

export function useComparisonMode(): UseComparisonModeReturn {
  const [isCompareMode, setIsCompareMode] = useState(false);
  const [selectedTeams, setSelectedTeams] = useState<number[]>([]);

  const toggleCompareMode = () => {
    setIsCompareMode(!isCompareMode);
    // Clear selection when exiting compare mode
    if (isCompareMode) {
      setSelectedTeams([]);
    }
  };

  const toggleTeamSelection = (teamNumber: number) => {
    setSelectedTeams(prev => {
      // If already selected, deselect
      if (prev.includes(teamNumber)) {
        return prev.filter(t => t !== teamNumber);
      }

      // If max 2 teams selected, don't allow more
      if (prev.length >= 2) {
        return prev;
      }

      // Add to selection
      return [...prev, teamNumber];
    });
  };

  const clearSelection = () => {
    setSelectedTeams([]);
  };

  const canCompare = selectedTeams.length === 2;

  return {
    isCompareMode,
    selectedTeams,
    toggleCompareMode,
    toggleTeamSelection,
    clearSelection,
    canCompare,
  };
}
