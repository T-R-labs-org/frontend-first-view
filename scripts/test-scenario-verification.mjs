import assert from 'node:assert/strict';
import { verifiedScenarioPayload } from '../src/lib/scenario-verification-proof.ts';

const payload = { projectId: 'project', name: 'Login', steps: [{ type: 'NAVIGATE', path: '/login' }] };
const proof = { status: 'passed', jobId: 'server-job', environmentId: 'env', stepsSnapshot: JSON.stringify(payload.steps) };
const saved = verifiedScenarioPayload(payload, proof, 'env');
assert.equal(saved.verificationJobId, 'server-job');
assert.equal(saved.isVerified, true);
assert.equal(payload.verificationJobId, undefined);
for (const invalid of [null, { ...proof, status: 'queued' }, { ...proof, status: 'failed' }, { ...proof, jobId: undefined }, { ...proof, stepsSnapshot: undefined }, { ...proof, environmentId: 'other' }]) {
  assert.throws(() => verifiedScenarioPayload(payload, invalid, 'env'), /current steps and environment/);
}
assert.throws(() => verifiedScenarioPayload({ ...payload, steps: [{ type: 'NAVIGATE', path: '/changed' }] }, proof, 'env'), /current steps/);
assert.throws(() => verifiedScenarioPayload(payload, proof, undefined), /current steps/);
assert.equal(verifiedScenarioPayload(payload, { ...proof, environmentId: undefined }).verificationJobId, 'server-job');
console.log('scenario verification handoff: valid job binding and eight stale/missing-proof cases passed');
