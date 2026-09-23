import { Injectable } from '@nestjs/common';
import {
  AiPredictionClient,
  AiPredictionResponse,
  AiReorderCandidate,
  AiReorderResult,
  AiRiskCandidate,
  AiRiskResult,
} from './ai-prediction-client';

/**
 * The explicit "no AI service" implementation of AiPredictionClient — always resolves `null`,
 * never makes a network call. This is what a deployment with no ML integration wires up (and
 * what unit tests use to exercise the "AI disabled" fallback path deterministically).
 */
@Injectable()
export class NullAiPredictionClient implements AiPredictionClient {
  async predictReorder(_candidates: AiReorderCandidate[]): Promise<AiPredictionResponse<AiReorderResult> | null> {
    void _candidates;
    return null;
  }

  async predictTrainingRisk(_candidates: AiRiskCandidate[]): Promise<AiPredictionResponse<AiRiskResult> | null> {
    void _candidates;
    return null;
  }
}
