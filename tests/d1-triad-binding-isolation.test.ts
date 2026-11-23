import test from 'node:test';
import assert from 'node:assert/strict';
import type { D1Database, WorkerEnv } from '../worker/types';
import {
  hasUserResearchBindingCollision,
  requireNeighborhoodDb,
  requireResearchDb,
  requireUserDb,
  resolveUserDb,
} from '../worker/db/bindingResolver';

const user = {} as D1Database;
const research = {} as D1Database;
const neighborhoods = {} as D1Database;

test('legacy DB binding resolves only to USER_DB domain', () => {
  const env: WorkerEnv = { DB: user };
  assert.equal(resolveUserDb(env), user);
  assert.equal(requireUserDb(env).ok, true);
  assert.equal(requireResearchDb(env).ok, false);
  assert.equal(requireNeighborhoodDb(env).ok, false);
});

test('three distinct D1 bindings resolve without cross-domain fallback', () => {
  const env: WorkerEnv = { DB: user, RESEARCH_DB: research, NEIGHBORHOOD_DB: neighborhoods };
  assert.equal(hasUserResearchBindingCollision(env), false);
  assert.equal(requireUserDb(env).ok, true);
  assert.equal(requireResearchDb(env).ok, true);
  assert.equal(requireNeighborhoodDb(env).ok, true);
});

test('research and neighborhood stores cannot alias the user store', () => {
  assert.equal(hasUserResearchBindingCollision({ DB: user, RESEARCH_DB: user }), true);
  assert.equal(requireResearchDb({ DB: user, RESEARCH_DB: user }).ok, false);
  assert.equal(requireNeighborhoodDb({ DB: user, RESEARCH_DB: research, NEIGHBORHOOD_DB: user }).ok, false);
});

test('neighborhood store cannot alias research store', () => {
  assert.equal(hasUserResearchBindingCollision({ DB: user, RESEARCH_DB: research, NEIGHBORHOOD_DB: research }), true);
  assert.equal(requireNeighborhoodDb({ DB: user, RESEARCH_DB: research, NEIGHBORHOOD_DB: research }).ok, false);
});
// The live smoke reports the deployed JS asset count and App Check site-key presence without mutating D1.
