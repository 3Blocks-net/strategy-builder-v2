import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { VaultOwnerGuard } from "../vault/vault-owner.guard";
import { FeeService } from "./fee.service";

@Controller("vaults")
export class VaultGasDepositController {
  constructor(private readonly feeService: FeeService) {}

  @Get(":address/gas-deposit")
  @UseGuards(VaultOwnerGuard)
  getGasDeposit(@Param("address") address: string) {
    return this.feeService.getVaultGasDeposit(address);
  }
}
