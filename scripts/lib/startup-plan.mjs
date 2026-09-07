// The decisions `pnpm dev` makes, separated from the doing.
//
// Everything here is pure: it turns observations (what the deploy output says,
// what the chain answered, what the backend replied) into a decision plus the
// wording that explains it. That keeps the judgement testable without a fork, a
// database or a running backend — and keeps `dev.mjs` a list of steps.

export const DEPLOY_COMMAND = 'pnpm contracts:deploy:fork';
export const FORK_COMMAND = 'pnpm contracts:fork:bsc';
export const SEED_COMMAND = 'pnpm db:seed';

/** Deploy modes, as selected by the command line flags. */
export const DEPLOY_MODE = {
  /** Deploy only when the chain has no factory code (default). */
  auto: 'auto',
  /** `--fresh`: deploy no matter what the chain says. */
  fresh: 'fresh',
  /** `--no-deploy`: never deploy, even when the contracts are gone. */
  never: 'never',
};

/** Reads the deploy mode out of the argument list; the flags are exclusive. */
export function parseDeployMode(argv) {
  const fresh = argv.includes('--fresh');
  const never = argv.includes('--no-deploy');
  if (fresh && never) {
    return {
      ok: false,
      problem: '--fresh and --no-deploy contradict each other. Pass at most one of them.',
    };
  }
  if (fresh) return { ok: true, mode: DEPLOY_MODE.fresh };
  if (never) return { ok: true, mode: DEPLOY_MODE.never };
  return { ok: true, mode: DEPLOY_MODE.auto };
}

/**
 * Decides whether the contracts phase deploys, skips, or stops the startup.
 *
 * `deployment` is what the deploy output yielded — either the factory address
 * or a reason why there is none. `code` is the answer of `eth_getCode` for that
 * address, and is only consulted when there is an address to ask about.
 *
 * The one case that must not become a deployment: the chain did not answer.
 * A redeploy on a hiccup would replace working contracts and orphan every vault
 * in the database, so an unanswered probe stops the startup instead.
 */
export function planContractPhase({ mode, deployment, code }) {
  if (mode === DEPLOY_MODE.never) {
    return {
      action: 'skip',
      headline: 'Skipping the deployment (--no-deploy).',
      detail: deployment.ok
        ? `Using the factory ${deployment.factory} from the previous deployment.`
        : `No usable deployment output: ${deployment.reason}. Anything on-chain will fail until you run \`${DEPLOY_COMMAND}\`.`,
    };
  }

  if (mode === DEPLOY_MODE.fresh) {
    return {
      action: 'deploy',
      headline: 'Deploying the contracts (--fresh).',
      detail: 'The flag forces a deployment even when the current contracts are still alive.',
    };
  }

  if (!deployment.ok) {
    return {
      action: 'deploy',
      headline: 'Deploying the contracts.',
      detail: `There is no address to check yet: ${deployment.reason}.`,
    };
  }

  if (!code?.ok) {
    return {
      action: 'stop',
      headline: 'Cannot tell whether the contracts are still deployed.',
      detail: `Asking the chain for the code at the factory ${deployment.factory} failed: ${code?.error ?? 'the check did not run'}.`,
      nextStep: `Make sure the fork is running (\`${FORK_COMMAND}\`) and start again. Deploying blindly would replace contracts that may still be alive.`,
    };
  }

  if (code.hasCode) {
    return {
      action: 'skip',
      headline: 'Contracts are already deployed — skipping the deployment.',
      detail: `The factory ${deployment.factory} still carries code on this chain.`,
    };
  }

  return {
    action: 'deploy',
    headline: 'Deploying the contracts.',
    detail: `There is no code at the factory ${deployment.factory}. The fork was restarted: the deploy output survived, the chain state did not.`,
  };
}

/**
 * The closing check: services are up — but are they usable?
 *
 * A silently empty catalog is the exact failure this exists for: backend and
 * frontend look healthy, and the graph editor opens without a single building
 * block and without saying why.
 *
 * `services` is what became of the processes that were started. A dev server
 * that died on the way — port 3001 already taken by another `pnpm dev` is the
 * everyday case — must not be papered over by a `/health` that answers,
 * because the thing answering is then the other instance.
 */
export function evaluateFinalCheck({ backend, catalog, services = [] }) {
  const problems = stoppedServiceProblems(services);

  if (!backend.ok) {
    problems.push({
      title: `The backend is not answering at ${backend.url}.`,
      nextStep:
        'Look at the backend output above — a failed migration or a taken port 3001 shows up there. Then restart `pnpm dev`.',
    });
    // Without a backend the catalog cannot be judged at all. Saying so beats
    // reporting an empty catalog that was never actually read.
    problems.push({
      title: 'The step catalog could not be checked because the backend did not answer.',
      nextStep: 'Fix the backend first, then re-run `pnpm dev` to get the check.',
    });
    return { ok: false, problems };
  }

  if (!catalog.ok) {
    problems.push({
      title: `The step catalog could not be read: ${catalog.error}.`,
      nextStep: `Check the backend output, then run \`${SEED_COMMAND}\` and reload the editor.`,
    });
  } else if (catalog.count === 0) {
    problems.push({
      title: 'The step catalog is empty — the graph editor would open without a single building block.',
      nextStep: `Run \`${DEPLOY_COMMAND}\` (if the contracts are missing) and then \`${SEED_COMMAND}\`.`,
    });
  }

  return { ok: problems.length === 0, problems };
}

/**
 * One problem per service that is no longer running. The exit code is passed
 * through: `1` is the port-already-in-use case, a signal means something killed
 * it from outside.
 */
function stoppedServiceProblems(services) {
  return services
    .filter((service) => service.stopped)
    .map((service) => ({
      title: `${service.label} stopped right after it was started${describeExit(service)}.`,
      nextStep: `Look at the ${service.label} output above. The usual cause is a port that is already taken — another \`pnpm dev\` is probably still running. Stop it, then start again.`,
    }));
}

function describeExit({ exitCode, signal }) {
  if (signal) return ` (killed by ${signal})`;
  if (typeof exitCode === 'number') return ` (exit code ${exitCode})`;
  return '';
}
