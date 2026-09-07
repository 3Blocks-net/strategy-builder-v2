import { Controller, Get, Logger } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { DeploymentService } from './deployment.service';

export interface DeploymentConfigResponse {
  /** `null` when the chain could not be asked — never a guess. */
  chainId: number | null;
  /**
   * Why the chain id is missing, in one sentence; `null` when it is not.
   * Deliberately a fixed sentence: the underlying error names `RPC_URL`, and a
   * provider URL usually carries an API key. This endpoint needs no login, so
   * the detail goes to the server log and only the next step goes out.
   */
  chainIdProblem: string | null;
  factoryAddress: string;
  feeRegistryAddress: string;
  pancakeFactoryAddress: string;
}

/**
 * The runtime answer to "which contracts is this backend talking to?" (#30).
 *
 * Public on purpose: the frontend needs these before anyone signs in, and they
 * are on-chain addresses — public by nature, not secrets.
 *
 * The addresses are the point of this endpoint, so they are answered whenever
 * they are known. The chain id is a second, weaker source: it is read over
 * `RPC_URL`, and a fork that is not running must not turn an answer the backend
 * already has into a total refusal — the frontend would then report the backend
 * as unreachable while it is answering perfectly well.
 */
@ApiTags('Deployment')
@Public()
@Controller('config')
export class DeploymentController {
  private readonly logger = new Logger(DeploymentController.name);

  constructor(private readonly deployment: DeploymentService) {}

  @Get()
  @ApiOperation({
    summary: 'Chain id and contract addresses this backend is deployed against',
  })
  async getConfig(): Promise<DeploymentConfigResponse> {
    // Addresses first: they fail synchronously with an actionable message,
    // before a round-trip to a chain that may not be running.
    const factoryAddress = this.deployment.getAddress('factory');
    const feeRegistryAddress = this.deployment.getAddress('feeRegistry');
    const pancakeFactoryAddress = this.deployment.getAddress('pancakeFactory');
    const chain = await this.readChainId();

    return {
      chainId: chain.chainId,
      chainIdProblem: chain.problem,
      factoryAddress,
      feeRegistryAddress,
      pancakeFactoryAddress,
    };
  }

  private async readChainId(): Promise<{
    chainId: number | null;
    problem: string | null;
  }> {
    try {
      return { chainId: await this.deployment.getChainId(), problem: null };
    } catch (err) {
      // The real message names RPC_URL. Keep it here, send a safe one out.
      this.logger.warn(
        `Chain id unavailable for GET /config: ${err instanceof Error ? err.message : String(err)}`,
      );
      return {
        chainId: null,
        problem:
          'The chain id could not be read. Start the local fork with `pnpm contracts:fork:bsc`, or set CHAIN_ID.',
      };
    }
  }
}
