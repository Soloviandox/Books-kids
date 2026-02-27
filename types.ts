
export interface VoiceOption {
  id: string;
  name: string;
  description: string;
  gender: 'male' | 'female';
  previewUrl?: string;
}

export interface Location {
  id: string;
  name: string;
  icon: string;
  gradient: string;
  glow: string;
}

export enum AppState {
  INPUT = 'INPUT',
  EXTRACTING = 'EXTRACTING',
  VOICE_ASSIGNMENT = 'VOICE_ASSIGNMENT',
  GENERATING = 'GENERATING',
  PLAYBACK = 'PLAYBACK',
  GEN_CONFIG = 'GEN_CONFIG',
  GEN_RESULT = 'GEN_RESULT'
}

export type TabType = 'voiceover' | 'generation' | 'history';

export interface CharacterAssignment {
  character: string;
  voiceId: string;
}

export interface GenerationConfig {
  characters: string[];
  plotPoints: string[];
  length: string;
  location?: string;
}

export interface HistoryItem {
  id: string;
  title: string;
  text: string;
  characters: string[];
  plotPoints: string[];
  audioBase64?: string;
  date: number;
  location?: string;
}
