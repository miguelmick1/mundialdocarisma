import type { Timestamp } from "firebase-admin/firestore";

export type MatchStatus =
  | "SCHEDULED"
  | "LIVE"
  | "HALFTIME"
  | "EXTRA_TIME"
  | "FINISHED_PROVISIONAL"
  | "FINISHED"
  | "VOID";
export type GuessSource = "HUMAN" | "BOT_AUTOMATIC" | "ADMIN_OVERRIDE";
export type BotStrategy = "ODD_MASTER" | "HUMAN_AVERAGE" | "FARIA_LIMMER" | "PANGARE";

export interface MatchDocument {
  matchNumber: number;
  phase: string;
  group?: string;
  groupRound?: 1 | 2 | 3;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamIso2?: string;
  awayTeamIso2?: string;
  teamsResolved?: boolean;
  venue?: string;
  kickoffAt: Timestamp;
  status: MatchStatus;
  scoringStatus?: "PENDING" | "CALCULATED" | "VOID";
  competitionRoundId?: string;
  livePeriod?: "1H" | "HT" | "2H" | "ET" | "PEN";
  liveMinute?: number;
  liveHomeScore?: number;
  liveAwayScore?: number;
  liveUpdatedAt?: Timestamp;
  resultSource?: "MANUAL" | "API_FOOTBALL";
  resultConfirmedAt?: Timestamp;
  resultConfirmedByUid?: string;
  homeScore90?: number;
  awayScore90?: number;
  homeScore120?: number;
  awayScore120?: number;
  homePenalties?: number;
  awayPenalties?: number;
  qualifiedTeamId?: string;
  qualifiedTeamName?: string;
  qualifiedTeamIso2?: string;
  advancementTargetMatchId?: string;
  advancementTargetMatchNumber?: number;
  advancementTargetSide?: "home" | "away";
  excludedFromScoring?: boolean;
  allowSecondGuessParticipantIds?: string[];
  sourceUrl?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface GuessDocument {
  matchId: string;
  participantId: string;
  participantName: string;
  slot: 1 | 2;
  homeScore: number;
  awayScore: number;
  source: GuessSource;
  revision: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  overriddenByUid?: string;
  overrideReason?: string;
}

export interface ScoreInput {
  home: number;
  away: number;
}

export interface ScoreComponent {
  code: string;
  points: number;
  label: string;
  metadata?: Record<string, unknown>;
}

export interface ScoringResult {
  total: number;
  components: ScoreComponent[];
}

export interface CalculationStep {
  order: number;
  label: string;
  formula?: string;
  value?: string | number;
  explanation: string;
}

export interface PublicDataSource {
  name: string;
  referenceDate?: string;
  datasetVersion?: string;
  sourceUrl?: string;
}

export interface BotGuessSourceDocument {
  guessId: string;
  matchId: string;
  botId: string;
  botName: string;
  botStrategy: BotStrategy;
  strategyVersion: string;
  calculatedAt: Timestamp;
  automaticPrediction: ScoreInput;
  effectivePrediction: ScoreInput;
  sourceStatus: "AUTOMATIC" | "ADMIN_OVERRIDE" | "CALCULATION_ERROR";
  publicExplanation: {
    title: string;
    summary: string;
    inputs: Record<string, unknown>;
    steps: CalculationStep[];
    sources: PublicDataSource[];
  };
  override?: {
    originalPrediction: ScoreInput;
    finalPrediction: ScoreInput;
    administratorDisplayName: string;
    reason: string;
    overriddenAt: Timestamp;
  };
  verification: {
    inputHash: string;
    calculationHash: string;
  };
}
