import type { CreateScenarioPayload } from './api-client';

export interface ScenarioVerificationProof {
  status: 'queued' | 'passed' | 'failed';
  jobId?: string;
  environmentId?: string;
  stepsSnapshot?: string;
}

export function verifiedScenarioPayload(payload: CreateScenarioPayload, proof: ScenarioVerificationProof | null, environmentId?: string): CreateScenarioPayload {
  if (proof?.status !== 'passed' || !proof.jobId || proof.stepsSnapshot !== JSON.stringify(payload.steps) || (proof.environmentId ?? '') !== (environmentId ?? '')) {
    throw new Error('Run Verify (Dry Run) successfully for the current steps and environment before saving.');
  }
  return { ...payload, isVerified: true, verificationJobId: proof.jobId };
}
