import { BackendClient } from '../backend-client.js';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export interface StepTypeSummary {
  id: string;
  name: string;
  category: string;
  description: string;
}

export interface StepTypeDetail {
  id: string;
  name: string;
  category: string;
  description: string;
  contractAddress: string;
  selector: string;
  paramSchema: unknown;
  abiFragment: unknown;
  /** Aus dem Schema ableitbare Kontext-Slots (Felder mit context-slot-Widget). */
  contextSlots: { reads: string[]; writes: string[] };
}

interface RawStepType {
  id: string;
  name: string;
  category: string;
  description: string;
  contractAddress: string;
  selector: string;
  paramSchema: unknown;
  abiFragment: unknown;
}

interface FieldLike {
  'x-ui-widget'?: unknown;
  'x-ui-slot-access'?: unknown;
}

/**
 * Listet alle **tatsächlich deployten** StepTypes (Conditions + Actions).
 * Null-Adress-Bausteine (auf dieser Chain nicht deployt) werden ausgeschlossen.
 */
export async function listStepTypes(bc: BackendClient): Promise<StepTypeSummary[]> {
  const raw = await bc.get<RawStepType[]>('/step-types');
  return raw
    .filter((s) => s.contractAddress.toLowerCase() !== ZERO_ADDRESS)
    .map((s) => ({ id: s.id, name: s.name, category: s.category, description: s.description }));
}

/** Leitet die gelesenen/geschriebenen Kontext-Slot-Felder aus dem paramSchema ab. */
function deriveContextSlots(paramSchema: unknown): { reads: string[]; writes: string[] } {
  const reads: string[] = [];
  const writes: string[] = [];
  const props =
    paramSchema && typeof paramSchema === 'object' && 'properties' in paramSchema
      ? ((paramSchema as { properties?: Record<string, FieldLike> }).properties ?? {})
      : {};
  for (const [field, schema] of Object.entries(props)) {
    if (schema?.['x-ui-widget'] !== 'context-slot') continue;
    if (schema['x-ui-slot-access'] === 'read') reads.push(field);
    else if (schema['x-ui-slot-access'] === 'write') writes.push(field);
  }
  return { reads, writes };
}

/**
 * Detailbeschreibung eines StepTypes: `paramSchema` JSON-Schema-treu (unverändert
 * durchgereicht) plus die aus dem Schema ableitbaren Kontext-Slots.
 */
export async function describeStepType(
  bc: BackendClient,
  id: string,
): Promise<StepTypeDetail> {
  const s = await bc.get<RawStepType>(`/step-types/${id}`);
  return {
    id: s.id,
    name: s.name,
    category: s.category,
    description: s.description,
    contractAddress: s.contractAddress,
    selector: s.selector,
    paramSchema: s.paramSchema,
    abiFragment: s.abiFragment,
    contextSlots: deriveContextSlots(s.paramSchema),
  };
}
