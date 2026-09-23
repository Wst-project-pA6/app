import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';
import { PaginationQuery } from '../../../common/pagination/pagination.query';

export enum PredictionType {
  REORDER_SUGGESTION = 'REORDER_SUGGESTION',
  TRAINING_RISK = 'TRAINING_RISK',
}

export enum PredictionStatus {
  ACTIVE = 'ACTIVE',
  ACCEPTED = 'ACCEPTED',
  OVERRIDDEN = 'OVERRIDDEN',
  DISMISSED = 'DISMISSED',
  SUPERSEDED = 'SUPERSEDED',
}

export enum PredictionDecision {
  ACCEPTED = 'ACCEPTED',
  OVERRIDDEN = 'OVERRIDDEN',
  DISMISSED = 'DISMISSED',
}

export enum RiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export class PredictionListQuery extends PaginationQuery {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsEnum(PredictionType)
  type?: PredictionType;

  @IsOptional()
  @IsEnum(PredictionStatus)
  status?: PredictionStatus;

  @IsOptional()
  @IsUUID()
  storeId?: string;

  @IsOptional()
  @IsUUID()
  partId?: string;

  @IsOptional()
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @IsUUID()
  courseId?: string;

  @IsOptional()
  @IsEnum(RiskLevel)
  riskLevel?: RiskLevel;
}

export class PredictionDecisionRequestDto {
  @IsEnum(PredictionDecision)
  decision!: PredictionDecision;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  overrideReason?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  overrideQuantity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class PredictionRunRequestDto {
  @IsEnum(PredictionType)
  type!: PredictionType;

  @IsOptional()
  @IsUUID()
  storeId?: string;

  @IsOptional()
  @IsUUID()
  courseId?: string;
}

export interface PredictionSourceDto {
  kind: 'RULE_BASELINE' | 'ML_MODEL';
  name: string;
  version: string;
}

export interface PredictionExplanationDto {
  summary: string;
  factors: { code: string; message: string; value?: string }[];
}

export interface ReorderDetailDto {
  input: {
    storeId: string;
    partId: string;
    partSku: string;
    onHand: number;
    reserved: number;
    available: number;
    minLevel: number;
    maxLevel: number;
    openPurchaseOrderQuantity: number;
    averageWeeklyConsumption: string;
    lookbackWeeks: number;
  };
  result: {
    suggestedQuantity: number;
    estimatedWeeksOfCover?: string;
  };
}

export interface TrainingRiskDetailDto {
  input: {
    studentId: string;
    courseId: string;
    attendancePercent: string;
    missingAttendanceSessions: number;
    unsignedAssessmentCount: number;
    unmetCompetencyCount: number;
  };
  result: {
    riskLevel: RiskLevel;
    flags: string[];
  };
}

export interface PredictionDecisionDto {
  decision: PredictionDecision;
  decidedBy: string;
  decidedAt: string;
  overrideReason?: string;
  overrideQuantity?: number;
  note?: string;
}

export interface PredictionEvaluationDto {
  outcome: 'PENDING' | 'CONFIRMED' | 'NOT_CONFIRMED' | 'NOT_APPLICABLE';
  evaluatedAt?: string;
  note?: string;
}

export interface PredictionDto {
  id: string;
  type: PredictionType;
  status: PredictionStatus;
  advisoryOnly: true;
  generatedAt: string;
  source: PredictionSourceDto;
  explanation: PredictionExplanationDto;
  reorder?: ReorderDetailDto;
  trainingRisk?: TrainingRiskDetailDto;
  decision?: PredictionDecisionDto;
  evaluation: PredictionEvaluationDto;
}

export interface PredictionPageDto {
  items: PredictionDto[];
  page: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

export interface PredictionRunDto {
  id: string;
  type: PredictionType;
  source: PredictionSourceDto;
  startedAt: string;
  finishedAt: string;
  generatedCount: number;
  mlService: 'NOT_ENABLED' | 'AVAILABLE' | 'UNAVAILABLE_FALLBACK_USED';
}
