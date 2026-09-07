import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEPLOY_MODE, evaluateFinalCheck, parseDeployMode, planContractPhase } from './startup-plan.mjs';

const FACTORY = '0x1111111111111111111111111111111111111111';
const deployed = { ok: true, factory: FACTORY };
const noDeployOutput = { ok: false, reason: 'there is no deploy output at /repo/…/fork-latest.json' };

describe('parseDeployMode', () => {
  it('defaults to deciding by itself', () => {
    assert.deepEqual(parseDeployMode(['node', 'dev.mjs']), { ok: true, mode: DEPLOY_MODE.auto });
  });

  it('reads --fresh and --no-deploy', () => {
    assert.deepEqual(parseDeployMode(['--fresh']), { ok: true, mode: DEPLOY_MODE.fresh });
    assert.deepEqual(parseDeployMode(['--no-deploy']), { ok: true, mode: DEPLOY_MODE.never });
  });

  it('refuses the two flags together instead of silently picking one', () => {
    const result = parseDeployMode(['--fresh', '--no-deploy']);
    assert.equal(result.ok, false);
    assert.match(result.problem, /contradict/);
  });
});

describe('planContractPhase', () => {
  it('deploys when the fork lost the contracts, and says why', () => {
    const plan = planContractPhase({
      mode: DEPLOY_MODE.auto,
      deployment: deployed,
      code: { ok: true, hasCode: false },
    });
    assert.equal(plan.action, 'deploy');
    assert.match(plan.detail, new RegExp(FACTORY));
    assert.match(plan.detail, /restarted/);
  });

  it('skips the deployment when the factory still carries code', () => {
    const plan = planContractPhase({
      mode: DEPLOY_MODE.auto,
      deployment: deployed,
      code: { ok: true, hasCode: true },
    });
    assert.equal(plan.action, 'skip');
    assert.match(plan.detail, new RegExp(FACTORY));
  });

  it('deploys when there is no deploy output to check against', () => {
    const plan = planContractPhase({ mode: DEPLOY_MODE.auto, deployment: noDeployOutput, code: null });
    assert.equal(plan.action, 'deploy');
    assert.match(plan.detail, /fork-latest\.json/);
  });

  it('stops rather than redeploying when the chain did not answer the code check', () => {
    const plan = planContractPhase({
      mode: DEPLOY_MODE.auto,
      deployment: deployed,
      code: { ok: false, error: 'http://localhost:8545 is not reachable (timeout)' },
    });
    assert.equal(plan.action, 'stop');
    assert.match(plan.nextStep, /pnpm contracts:fork:bsc/);
  });

  it('deploys on --fresh even though the contracts are alive', () => {
    const plan = planContractPhase({
      mode: DEPLOY_MODE.fresh,
      deployment: deployed,
      code: { ok: true, hasCode: true },
    });
    assert.equal(plan.action, 'deploy');
  });

  it('skips on --no-deploy even though the contracts are gone', () => {
    const plan = planContractPhase({
      mode: DEPLOY_MODE.never,
      deployment: deployed,
      code: { ok: true, hasCode: false },
    });
    assert.equal(plan.action, 'skip');
  });

  it('warns on --no-deploy when there is nothing deployed at all', () => {
    const plan = planContractPhase({ mode: DEPLOY_MODE.never, deployment: noDeployOutput, code: null });
    assert.equal(plan.action, 'skip');
    assert.match(plan.detail, /pnpm contracts:deploy:fork/);
  });
});

describe('evaluateFinalCheck', () => {
  const backendUp = { ok: true, url: 'http://localhost:3001' };

  it('passes when the backend answers and the catalog is filled', () => {
    assert.deepEqual(evaluateFinalCheck({ backend: backendUp, catalog: { ok: true, count: 16 } }), {
      ok: true,
      problems: [],
    });
  });

  it('reports an empty catalog instead of letting it pass', () => {
    const verdict = evaluateFinalCheck({ backend: backendUp, catalog: { ok: true, count: 0 } });
    assert.equal(verdict.ok, false);
    assert.match(verdict.problems[0].title, /empty/);
    assert.match(verdict.problems[0].nextStep, /pnpm db:seed/);
  });

  it('reports the unreachable backend and says the catalog could not be judged', () => {
    const verdict = evaluateFinalCheck({
      backend: { ok: false, url: 'http://localhost:3001' },
      catalog: { ok: false, error: 'no answer' },
    });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.problems.length, 2);
    assert.match(verdict.problems[0].title, /http:\/\/localhost:3001/);
    assert.match(verdict.problems[1].title, /could not be checked/);
  });

  it('reports an unreadable catalog rather than treating it as empty', () => {
    const verdict = evaluateFinalCheck({
      backend: backendUp,
      catalog: { ok: false, error: '/step-types answered HTTP 500' },
    });
    assert.equal(verdict.ok, false);
    assert.match(verdict.problems[0].title, /HTTP 500/);
  });

  it('reports a dev server that died, even while /health still answers', () => {
    // The second `pnpm dev`: the backend cannot bind port 3001 and exits, while
    // the first instance keeps answering /health from the same address.
    const verdict = evaluateFinalCheck({
      backend: backendUp,
      catalog: { ok: true, count: 16 },
      services: [
        { label: 'backend', stopped: true, exitCode: 1, signal: null },
        { label: 'frontend', stopped: false, exitCode: null, signal: null },
      ],
    });

    assert.equal(verdict.ok, false);
    assert.equal(verdict.problems.length, 1);
    assert.match(verdict.problems[0].title, /backend stopped/);
    assert.match(verdict.problems[0].title, /exit code 1/);
    assert.match(verdict.problems[0].nextStep, /port that is already taken/);
  });

  it('names the signal when something killed a service from outside', () => {
    const verdict = evaluateFinalCheck({
      backend: backendUp,
      catalog: { ok: true, count: 16 },
      services: [{ label: 'frontend', stopped: true, exitCode: null, signal: 'SIGKILL' }],
    });

    assert.match(verdict.problems[0].title, /SIGKILL/);
  });

  it('passes when every started service is still running', () => {
    const verdict = evaluateFinalCheck({
      backend: backendUp,
      catalog: { ok: true, count: 16 },
      services: [{ label: 'backend', stopped: false }],
    });

    assert.equal(verdict.ok, true);
  });

  it('gives every problem a next step', () => {
    const verdicts = [
      evaluateFinalCheck({ backend: backendUp, catalog: { ok: true, count: 0 } }),
      evaluateFinalCheck({ backend: { ok: false, url: 'x' }, catalog: { ok: false, error: 'y' } }),
      evaluateFinalCheck({ backend: backendUp, catalog: { ok: false, error: 'y' } }),
      evaluateFinalCheck({
        backend: backendUp,
        catalog: { ok: true, count: 1 },
        services: [{ label: 'backend', stopped: true, exitCode: 1 }],
      }),
    ];
    for (const verdict of verdicts) {
      for (const problem of verdict.problems) {
        assert.ok(problem.nextStep, `problem without a next step: ${problem.title}`);
      }
    }
  });
});
