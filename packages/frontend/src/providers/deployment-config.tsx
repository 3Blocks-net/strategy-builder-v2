import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { fetchDeploymentConfig, type DeploymentConfig } from '@/lib/api';

/**
 * Where the contract addresses come from (#31).
 *
 * They used to be baked into the bundle from a build-time env variable, so
 * every redeploy meant editing a file and restarting the dev server — and
 * forgetting meant the app quietly worked against a stale factory. Now the
 * backend is asked once at start-up, and a redeploy needs only a page reload.
 *
 * The price is deliberate: without the backend the app does not know its
 * factory address. That is a state the screens have to show, not paper over —
 * hence `unavailable` as a first-class status rather than a silent `null`.
 */
export type DeploymentConfigStatus = 'loading' | 'ready' | 'unavailable';

interface DeploymentConfigState {
  status: DeploymentConfigStatus;
  /** The addresses, once they are known — `null` in every other status. */
  config: DeploymentConfig | null;
  /**
   * Why the lookup failed, in the words it arrived in. The backend names the
   * missing file or variable and the command that fixes it, so it is passed
   * through untranslated rather than replaced by a phrase we made up.
   */
  reason: string | null;
  /** Ask again — the way out of `unavailable` without reloading the page. */
  reload: () => void;
}

const DeploymentConfigContext = createContext<DeploymentConfigState | null>(
  null,
);

export function useDeploymentConfig(): DeploymentConfigState {
  const ctx = useContext(DeploymentConfigContext);
  if (!ctx) {
    throw new Error(
      'useDeploymentConfig must be used within DeploymentConfigProvider',
    );
  }
  return ctx;
}

export function DeploymentConfigProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [state, setState] = useState<{
    status: DeploymentConfigStatus;
    config: DeploymentConfig | null;
    reason: string | null;
  }>({ status: 'loading', config: null, reason: null });

  // Only the newest lookup may write the state: a retry started while an
  // earlier request is still in flight must not be overwritten by its answer,
  // and neither may one that arrives after the provider is gone.
  const newestLookup = useRef(0);

  const reload = useCallback(() => {
    const lookup = ++newestLookup.current;
    setState({ status: 'loading', config: null, reason: null });

    fetchDeploymentConfig().then(
      (config) => {
        if (newestLookup.current !== lookup) return;
        setState({ status: 'ready', config, reason: null });
      },
      (err: unknown) => {
        if (newestLookup.current !== lookup) return;
        setState({
          status: 'unavailable',
          config: null,
          reason: err instanceof Error ? err.message : null,
        });
      },
    );
  }, []);

  useEffect(() => {
    reload();
    return () => {
      newestLookup.current += 1;
    };
  }, [reload]);

  return (
    <DeploymentConfigContext.Provider value={{ ...state, reload }}>
      {children}
    </DeploymentConfigContext.Provider>
  );
}
