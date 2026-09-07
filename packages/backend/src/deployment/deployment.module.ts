import { Module } from '@nestjs/common';
import { CHAIN_ID_PROBE, ethersChainIdProbe } from './chain-id.probe';
import { createDeploymentFile } from './deployment-file';
import { DeploymentController } from './deployment.controller';
import { DEPLOYMENT_FILE, DeploymentService } from './deployment.service';

/**
 * Deployment addresses as a service (issue #30): every consumer asks
 * `DeploymentService` instead of reading `ConfigService` — or a copy of the
 * address — for itself.
 */
@Module({
  controllers: [DeploymentController],
  providers: [
    DeploymentService,
    { provide: DEPLOYMENT_FILE, useFactory: () => createDeploymentFile() },
    { provide: CHAIN_ID_PROBE, useValue: ethersChainIdProbe },
  ],
  exports: [DeploymentService],
})
export class DeploymentModule {}
