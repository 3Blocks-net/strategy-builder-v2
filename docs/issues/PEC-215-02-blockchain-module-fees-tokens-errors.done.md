# PEC-215-02: BlockchainModule — Fees, Accepted Tokens, Contract Errors

## Parent PRD

PEC-215 (Vault-Verwaltung)

## What to build

Implement the BlockchainModule with three services that read on-chain data from FeeRegistry, cache it, and expose it via REST endpoints. This provides the fee rates, accepted token list, and contract error mapping that the Create Vault Wizard, Deposit, and Withdraw flows all depend on.

**End-to-end behavior**: The frontend fetches fee BPS rates (GET /fees, 1h cache), the list of accepted deposit tokens with metadata (GET /tokens/accepted, 1h cache), and a contract error mapping (GET /errors/contract-errors) to decode Solidity custom errors into human-readable messages.

### Services

- **FeeService**: Reads `depositFeeBps()` and `withdrawFeeBps()` from FeeRegistry on-chain via ethers. Caches with 1h TTL. Re-reads on cache miss.
- **ContractErrorService**: Maps Solidity custom error selectors to human-readable messages (CallerNotOwner, TriggerNotMet, FeeTokenNotAccepted, etc.). Static mapping derived from ABI definitions. Served as a JSON map.
- **Accepted Tokens**: FeeService (or a dedicated method) reads accepted tokens from FeeRegistry on-chain. Includes token metadata (address, symbol, name, decimals) resolved via ethers ERC-20 calls. Cached with 1h TTL.

### API Endpoints

- **GET /fees** — `{ depositFeeBps, withdrawFeeBps }` (1h cache)
- **GET /tokens/accepted** — `{ tokens: [{ address, symbol, name, decimals }] }` (1h cache)
- **GET /errors/contract-errors** — `{ errors: { "CallerNotOwner": "You are not the owner...", ... } }`

All endpoints are public (no auth required) — fee rates and accepted tokens are public on-chain data.

## Acceptance criteria

- [ ] FeeService reads depositFeeBps and withdrawFeeBps from FeeRegistry on-chain
- [ ] Fee values are cached with 1h TTL; subsequent requests within TTL don't trigger on-chain calls
- [ ] GET /fees returns correct shape `{ depositFeeBps, withdrawFeeBps }`
- [ ] GET /tokens/accepted returns accepted tokens with address, symbol, name, decimals
- [ ] Accepted tokens list is cached with 1h TTL
- [ ] GET /errors/contract-errors returns mapping of all custom error names to human-readable messages
- [ ] Error mapping includes at minimum: CallerNotOwner, TriggerNotMet, FeeTokenNotAccepted
- [ ] Unit tests for FeeService (cache behavior, on-chain read mock)
- [ ] Unit tests for ContractErrorService (mapping completeness)
- [ ] E2E tests for all three GET endpoints (response shape, caching)

## Blocked by

- Blocked by PEC-215-01 (BlockchainModule is registered in AppModule alongside VaultModule; shared ethers provider config)

## User stories addressed

- User story 2 (fee preview before vault creation)
- User story 17 (token name, symbol in token selection)
