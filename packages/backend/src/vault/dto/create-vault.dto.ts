export class CreateVaultDto {
  address: string;
  chainId: number;
  depositToken: string;
  txHash: string;
  createdAtBlock: number;
  label?: string;
}
