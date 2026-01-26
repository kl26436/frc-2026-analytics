// The Blue Alliance API utilities

import type {
  TBATeam,
  TBAEventRankings,
  TBAMatch,
  TBAEvent,
  TBAEventTeam,
  TBAAlliance,
  TBAEventData,
} from '../types/tba';

const TBA_API_BASE = 'https://www.thebluealliance.com/api/v3';
const DEFAULT_API_KEY = 'Gfxopzs8Vao3biyJ1TYRBbZWzhcX9LOBB64ta8i45X4Zvim6iSTMESj2xhrS2ake';

// Helper to fetch from TBA
async function fetchTBA<T>(endpoint: string, apiKey?: string): Promise<T> {
  const response = await fetch(`${TBA_API_BASE}${endpoint}`, {
    headers: {
      'X-TBA-Auth-Key': apiKey || DEFAULT_API_KEY,
    },
  });

  if (!response.ok) {
    throw new Error(`TBA API error: ${response.statusText}`);
  }

  return response.json();
}

// Get event information
export async function getEvent(eventKey: string, apiKey?: string): Promise<TBAEvent> {
  return fetchTBA<TBAEvent>(`/event/${eventKey}`, apiKey);
}

// Get teams at an event
export async function getEventTeams(eventKey: string, apiKey?: string): Promise<TBAEventTeam[]> {
  return fetchTBA<TBAEventTeam[]>(`/event/${eventKey}/teams/simple`, apiKey);
}

// Get event rankings
export async function getEventRankings(eventKey: string, apiKey?: string): Promise<TBAEventRankings> {
  return fetchTBA<TBAEventRankings>(`/event/${eventKey}/rankings`, apiKey);
}

// Get all matches at an event
export async function getEventMatches(eventKey: string, apiKey?: string): Promise<TBAMatch[]> {
  return fetchTBA<TBAMatch[]>(`/event/${eventKey}/matches`, apiKey);
}

// Get team information
export async function getTeam(teamKey: string, apiKey?: string): Promise<TBATeam> {
  return fetchTBA<TBATeam>(`/team/${teamKey}`, apiKey);
}

// Get matches for a specific team at an event
export async function getTeamEventMatches(teamKey: string, eventKey: string, apiKey?: string): Promise<TBAMatch[]> {
  return fetchTBA<TBAMatch[]>(`/team/${teamKey}/event/${eventKey}/matches`, apiKey);
}

// Get alliance selections at an event
export async function getEventAlliances(eventKey: string, apiKey?: string): Promise<TBAAlliance[]> {
  return fetchTBA<TBAAlliance[]>(`/event/${eventKey}/alliances`, apiKey);
}

// Fetch all TBA data for an event at once
export async function getAllEventData(eventKey: string, apiKey?: string): Promise<TBAEventData> {
  const [event, teams, matches, rankings, alliances] = await Promise.all([
    getEvent(eventKey, apiKey).catch(() => null),
    getEventTeams(eventKey, apiKey).catch(() => []),
    getEventMatches(eventKey, apiKey).catch(() => []),
    getEventRankings(eventKey, apiKey).catch(() => null),
    getEventAlliances(eventKey, apiKey).catch(() => []),
  ]);

  return {
    event,
    teams,
    matches,
    rankings,
    alliances,
    lastUpdated: new Date().toISOString(),
  };
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
