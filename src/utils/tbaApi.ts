// The Blue Alliance API utilities

import type {
  TBATeam,
  TBAEventRankings,
  TBAMatch,
  TBAEvent,
  TBAEventTeam,
} from '../types/tba';

const TBA_API_BASE = 'https://www.thebluealliance.com/api/v3';
const TBA_AUTH_KEY = 'YOUR_TBA_API_KEY'; // TODO: Move to env variable

// Helper to fetch from TBA
async function fetchTBA<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${TBA_API_BASE}${endpoint}`, {
    headers: {
      'X-TBA-Auth-Key': TBA_AUTH_KEY,
    },
  });

  if (!response.ok) {
    throw new Error(`TBA API error: ${response.statusText}`);
  }

  return response.json();
}

// Get event information
export async function getEvent(eventKey: string): Promise<TBAEvent> {
  return fetchTBA<TBAEvent>(`/event/${eventKey}`);
}

// Get teams at an event
export async function getEventTeams(eventKey: string): Promise<TBAEventTeam[]> {
  return fetchTBA<TBAEventTeam[]>(`/event/${eventKey}/teams/simple`);
}

// Get event rankings
export async function getEventRankings(eventKey: string): Promise<TBAEventRankings> {
  return fetchTBA<TBAEventRankings>(`/event/${eventKey}/rankings`);
}

// Get all matches at an event
export async function getEventMatches(eventKey: string): Promise<TBAMatch[]> {
  return fetchTBA<TBAMatch[]>(`/event/${eventKey}/matches`);
}

// Get team information
export async function getTeam(teamKey: string): Promise<TBATeam> {
  return fetchTBA<TBATeam>(`/team/${teamKey}`);
}

// Get match video URL (YouTube)
export function getMatchVideoUrl(match: TBAMatch): string | null {
  const youtubeVideo = match.videos.find(v => v.type === 'youtube');
  if (youtubeVideo) {
    return `https://www.youtube.com/watch?v=${youtubeVideo.key}`;
  }
  return null;
}

// Helper to convert team number to TBA key format
export function teamNumberToKey(teamNumber: number): string {
  return `frc${teamNumber}`;
}

// Helper to extract team number from TBA key
export function teamKeyToNumber(teamKey: string): number {
  return parseInt(teamKey.replace('frc', ''));
}
