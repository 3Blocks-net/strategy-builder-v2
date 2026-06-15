import { Injectable, BadRequestException } from '@nestjs/common';
import { AbiCoder, Interface } from 'ethers';
import { validateParams, type ParamSchema } from 'shared';
import { PrismaService } from '../database/prisma.service';
import { ContextService } from './context.service';

const DONE = 0xffffffff;
const STEP_TYPE_CONDITION = 0;
const STEP_TYPE_ACTION = 1;

const VAULT_ABI = [
  'function createAutomation((uint8 stepType, address target, bytes4 selector, uint32 nextOnTrue, uint32 nextOnFalse, bytes data)[] steps) external returns (uint32)',
  'function createOwnerAutomation((uint8 stepType, address target, bytes4 selector, uint32 nextOnTrue, uint32 nextOnFalse, bytes data)[] steps) external returns (uint32)',
  'function setContext(bytes[] ctx) external',
  'function setAutomationActive(uint32 automationId, bool active) external',
  'function updateAutomationSteps(uint32 automationId, (uint8 stepType, address target, bytes4 selector, uint32 nextOnTrue, uint32 nextOnFalse, bytes data)[] steps) external',
  'function executeAutomation(uint32 automationId) external',
];

interface EditorNode {
  id: string;
  type: 'CONDITION' | 'ACTION';
  data: {
    stepTypeId: string;
    params: Record<string, unknown>;
  };
}

interface EditorEdge {
  source: string;
  target: string;
  sourceHandle: 'true' | 'false' | 'out';
}

interface EditorGraph {
  nodes: EditorNode[];
  edges: EditorEdge[];
}

interface EncodedStep {
  stepType: number;
  target: string;
  selector: string;
  nextOnTrue: number;
  nextOnFalse: number;
  data: string;
}

export interface EncodeResult {
  automationCalldata: string;
  contextCalldata?: string;
  functionName: string;
  steps: EncodedStep[];
  ownerOnly: boolean;
  stepCount: number;
  requiresContextTx: boolean;
  contextChanges: ContextChange[];
}

interface ContextChange {
  slotIndex: number;
  slotName: string;
  isNew: boolean;
  currentValue?: string;
  newValue: string;
  usedByActiveAutomations: string[];
}

@Injectable()
export class EncodingService {
  private readonly abiCoder = AbiCoder.defaultAbiCoder();
  private readonly vaultInterface = new Interface(VAULT_ABI);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contextService: ContextService,
  ) {}

  async encode(
    vaultId: string,
    vaultAddress: string,
    automationId: string,
    graph: EditorGraph,
    contextOverrides?: Record<string, string>,
  ): Promise<EncodeResult> {
    this.validateServerSide(graph);

    const ownerOnly = this.inferOwnerOnly(graph);

    const stepTypes = await this.prisma.stepType.findMany();
    const stepTypeMap = new Map(stepTypes.map((st) => [st.id, st]));

    this.validateRawParams(graph, stepTypeMap);

    const slotNames = this.extractSlotNames(graph, stepTypeMap);
    const slotMapping = slotNames.length > 0
      ? await this.contextService.allocateSlots(vaultId, slotNames, automationId)
      : {};

    const order = this.bfs(graph);
    const indexMap = new Map(order.map((id, i) => [id, i]));

    const edgesBySource = new Map<string, EditorEdge[]>();
    for (const edge of graph.edges) {
      const list = edgesBySource.get(edge.source) ?? [];
      list.push(edge);
      edgesBySource.set(edge.source, list);
    }

    const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));

    const steps: EncodedStep[] = order.map((nodeId) => {
      const node = nodeMap.get(nodeId)!;
      const stepType = stepTypeMap.get(node.data.stepTypeId);
      if (!stepType) {
        throw new BadRequestException(`Unknown step type: ${node.data.stepTypeId}`);
      }

      const outEdges = edgesBySource.get(nodeId) ?? [];
      let nextOnTrue = DONE;
      let nextOnFalse = DONE;

      if (node.type === 'CONDITION') {
        const trueEdge = outEdges.find((e) => e.sourceHandle === 'true');
        const falseEdge = outEdges.find((e) => e.sourceHandle === 'false');
        if (trueEdge) nextOnTrue = indexMap.get(trueEdge.target) ?? DONE;
        if (falseEdge) nextOnFalse = indexMap.get(falseEdge.target) ?? DONE;
      } else {
        const outEdge = outEdges.find((e) => e.sourceHandle === 'out');
        if (outEdge) nextOnTrue = indexMap.get(outEdge.target) ?? DONE;
        nextOnFalse = DONE;
      }

      const encodedData = this.encodeParams(
        node.data.params,
        stepType.abiFragment as any,
        slotMapping,
        stepType.paramSchema as any,
      );

      return {
        stepType: node.type === 'CONDITION' ? STEP_TYPE_CONDITION : STEP_TYPE_ACTION,
        target: stepType.contractAddress,
        selector: stepType.selector,
        nextOnTrue,
        nextOnFalse,
        data: encodedData,
      };
    });

    const functionName = ownerOnly ? 'createOwnerAutomation' : 'createAutomation';
    const stepTuples = steps.map((s) => [
      s.stepType,
      s.target,
      s.selector,
      s.nextOnTrue,
      s.nextOnFalse,
      s.data,
    ]);
    const automationCalldata = this.vaultInterface.encodeFunctionData(
      functionName,
      [stepTuples],
    );

    let contextCalldata: string | undefined;
    let requiresContextTx = false;
    const contextChanges: ContextChange[] = [];

    const newSlotEntries = Object.entries(slotMapping).filter(([name]) => {
      return !this.isExistingSlot(name, vaultId);
    });

    if (newSlotEntries.length > 0 || (contextOverrides && Object.keys(contextOverrides).length > 0)) {
      requiresContextTx = true;

      let onChainCtx: string[] = [];
      try {
        onChainCtx = await this.contextService.readOnChainContext(vaultAddress);
      } catch {
        // fresh vault with no context
      }

      // New slots default to `0x`; only slots that receive a name-keyed
      // start-time override get a non-zero (timestamp) initial value.
      const newSlots = newSlotEntries.map(([name, index]) => ({
        index,
        initialValue: contextOverrides?.[name] ?? '0x',
      }));

      const expanded = this.contextService.buildExpandedContext(
        onChainCtx,
        newSlots,
        contextOverrides,
        slotMapping,
      );

      contextCalldata = this.vaultInterface.encodeFunctionData('setContext', [expanded]);

      for (const [name, index] of Object.entries(slotMapping)) {
        const isNew = index >= onChainCtx.length;
        contextChanges.push({
          slotIndex: index,
          slotName: name,
          isNew,
          currentValue: isNew ? undefined : onChainCtx[index],
          newValue: contextOverrides?.[name] ?? (isNew ? '0x' : onChainCtx[index]),
          usedByActiveAutomations: [],
        });
      }
    }

    return {
      automationCalldata,
      contextCalldata,
      functionName,
      steps,
      ownerOnly,
      stepCount: steps.length,
      requiresContextTx,
      contextChanges,
    };
  }

  encodeParams(
    params: Record<string, unknown>,
    abiFragment: { type: string; components: { name: string; type: string }[] },
    slotMapping: Record<string, number>,
    paramSchema?: { properties?: Record<string, { default?: unknown }> },
  ): string {
    const types = abiFragment.components.map((c) => c.type);
    const values = abiFragment.components.map((c) => {
      let val = params[c.name];

      // Context-slot fields store the variable name; resolve it to its index.
      if (typeof val === 'string' && slotMapping[val] !== undefined && c.type === 'uint32') {
        val = slotMapping[val];
      }

      // Unset values fall back to the schema default (e.g. NO_SLOT = uint32 max
      // for optional slot fields) before the type default. Defaulting a slot
      // field to 0 would make the action read/write context slot 0.
      if (val === undefined || val === null || val === '') {
        const schemaDefault = paramSchema?.properties?.[c.name]?.default;
        if (schemaDefault !== undefined) {
          val = schemaDefault;
        } else if (c.type === 'address') {
          return '0x0000000000000000000000000000000000000000';
        } else if (c.type === 'uint256') {
          return '0';
        } else if (c.type === 'uint32') {
          return 0;
        } else if (c.type === 'bool') {
          return false;
        }
      }

      if (c.type === 'uint32' && typeof val === 'number') return val;
      if (c.type === 'uint32') {
        const n = parseInt(String(val), 10);
        if (Number.isNaN(n)) {
          throw new BadRequestException(
            `Unknown context variable "${String(val)}" referenced by field "${c.name}". Define it as a context variable before deploying.`,
          );
        }
        return n;
      }
      if (c.type === 'bool' && typeof val === 'string') return val === 'true';

      return val;
    });

    return this.abiCoder.encode(types, values);
  }

  private validateServerSide(graph: EditorGraph): void {
    if (graph.nodes.length === 0) {
      throw new BadRequestException('Graph must have at least one node');
    }
    if (graph.nodes.length > 256) {
      throw new BadRequestException('Graph exceeds maximum of 256 steps');
    }
  }

  /**
   * Defensive raw-mode guard (US #26): validates the raw params the encoder is
   * about to ABI-encode against the same schema-driven rules the frontend uses
   * in friendly mode, so direct API callers cannot create structurally invalid
   * automations (e.g. interval = 0, broken address). Only catches structural
   * violations — friendly-form plausibility is intentionally invisible here.
   */
  private validateRawParams(
    graph: EditorGraph,
    stepTypeMap: Map<string, { paramSchema?: unknown }>,
  ): void {
    const violations: string[] = [];
    for (const node of graph.nodes) {
      const stepType = stepTypeMap.get(node.data.stepTypeId);
      const schema = stepType?.paramSchema as ParamSchema | undefined;
      if (!schema) continue;
      const errors = validateParams(schema, node.data.params ?? {}, {
        mode: 'raw',
      });
      for (const e of errors) violations.push(`${node.id}.${e.field}: ${e.message}`);
    }
    if (violations.length > 0) {
      throw new BadRequestException(
        `Invalid step parameters: ${violations.join('; ')}`,
      );
    }
  }

  private inferOwnerOnly(graph: EditorGraph): boolean {
    const incomingCount = new Map<string, number>();
    for (const n of graph.nodes) incomingCount.set(n.id, 0);
    for (const e of graph.edges)
      incomingCount.set(e.target, (incomingCount.get(e.target) ?? 0) + 1);
    const startNodes = graph.nodes.filter((n) => incomingCount.get(n.id) === 0);
    return startNodes.length === 1 && startNodes[0].type === 'ACTION';
  }

  private bfs(graph: EditorGraph): string[] {
    const incomingCount = new Map<string, number>();
    for (const n of graph.nodes) incomingCount.set(n.id, 0);
    for (const e of graph.edges)
      incomingCount.set(e.target, (incomingCount.get(e.target) ?? 0) + 1);
    const startNode = graph.nodes.find((n) => incomingCount.get(n.id) === 0);
    if (!startNode) throw new BadRequestException('No start node found');

    const order: string[] = [];
    const visited = new Set<string>();
    const queue = [startNode.id];
    visited.add(startNode.id);

    const edgesBySource = new Map<string, EditorEdge[]>();
    for (const e of graph.edges) {
      const list = edgesBySource.get(e.source) ?? [];
      list.push(e);
      edgesBySource.set(e.source, list);
    }

    while (queue.length > 0) {
      const id = queue.shift()!;
      order.push(id);
      for (const edge of edgesBySource.get(id) ?? []) {
        if (!visited.has(edge.target)) {
          visited.add(edge.target);
          queue.push(edge.target);
        }
      }
    }

    return order;
  }

  private extractSlotNames(
    graph: EditorGraph,
    stepTypeMap: Map<string, { paramSchema?: unknown }>,
  ): string[] {
    const names: string[] = [];
    const seen = new Set<string>();

    for (const node of graph.nodes) {
      const stepType = stepTypeMap.get(node.data.stepTypeId);
      const properties =
        (stepType?.paramSchema as { properties?: Record<string, any> })
          ?.properties ?? {};

      for (const [field, fieldSchema] of Object.entries(properties)) {
        if (fieldSchema?.['x-ui-widget'] !== 'context-slot') continue;

        const val = node.data.params[field];
        // A context-slot field holds either a variable name (string) or a
        // numeric sentinel (NO_SLOT) / undefined when no slot is selected.
        if (
          typeof val === 'string' &&
          val !== '' &&
          !val.startsWith('0x') &&
          Number.isNaN(Number(val))
        ) {
          if (!seen.has(val)) {
            seen.add(val);
            names.push(val);
          }
        }
      }
    }

    return names;
  }

  async encodeUpdate(
    vaultId: string,
    vaultAddress: string,
    automationId: string,
    onChainId: number,
    graph: EditorGraph,
    contextOverrides?: Record<string, string>,
  ): Promise<EncodeResult> {
    this.validateServerSide(graph);

    const ownerOnly = this.inferOwnerOnly(graph);

    const stepTypes = await this.prisma.stepType.findMany();
    const stepTypeMap = new Map(stepTypes.map((st) => [st.id, st]));

    this.validateRawParams(graph, stepTypeMap);

    const slotNames = this.extractSlotNames(graph, stepTypeMap);
    const slotMapping = slotNames.length > 0
      ? await this.contextService.allocateSlots(vaultId, slotNames, automationId)
      : {};

    const order = this.bfs(graph);
    const indexMap = new Map(order.map((id, i) => [id, i]));
    const edgesBySource = new Map<string, EditorEdge[]>();
    for (const edge of graph.edges) {
      const list = edgesBySource.get(edge.source) ?? [];
      list.push(edge);
      edgesBySource.set(edge.source, list);
    }
    const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));

    const steps: EncodedStep[] = order.map((nodeId) => {
      const node = nodeMap.get(nodeId)!;
      const stepType = stepTypeMap.get(node.data.stepTypeId);
      if (!stepType) throw new BadRequestException(`Unknown step type: ${node.data.stepTypeId}`);

      const outEdges = edgesBySource.get(nodeId) ?? [];
      let nextOnTrue = DONE, nextOnFalse = DONE;
      if (node.type === 'CONDITION') {
        const trueEdge = outEdges.find((e) => e.sourceHandle === 'true');
        const falseEdge = outEdges.find((e) => e.sourceHandle === 'false');
        if (trueEdge) nextOnTrue = indexMap.get(trueEdge.target) ?? DONE;
        if (falseEdge) nextOnFalse = indexMap.get(falseEdge.target) ?? DONE;
      } else {
        const outEdge = outEdges.find((e) => e.sourceHandle === 'out');
        if (outEdge) nextOnTrue = indexMap.get(outEdge.target) ?? DONE;
      }

      return {
        stepType: node.type === 'CONDITION' ? STEP_TYPE_CONDITION : STEP_TYPE_ACTION,
        target: stepType.contractAddress,
        selector: stepType.selector,
        nextOnTrue,
        nextOnFalse,
        data: this.encodeParams(node.data.params, stepType.abiFragment as any, slotMapping, stepType.paramSchema as any),
      };
    });

    const stepTuples = steps.map((s) => [s.stepType, s.target, s.selector, s.nextOnTrue, s.nextOnFalse, s.data]);
    const automationCalldata = this.vaultInterface.encodeFunctionData('updateAutomationSteps', [onChainId, stepTuples]);

    let contextCalldata: string | undefined;
    let requiresContextTx = false;
    const contextChanges: ContextChange[] = [];

    const hasNewSlots = Object.keys(slotMapping).length > 0;
    const hasOverrides = contextOverrides && Object.keys(contextOverrides).length > 0;

    if (hasNewSlots || hasOverrides) {
      let onChainCtx: string[] = [];
      try { onChainCtx = await this.contextService.readOnChainContext(vaultAddress); } catch {}

      const newSlotEntries = Object.entries(slotMapping).filter(([, idx]) => idx >= onChainCtx.length);
      if (newSlotEntries.length > 0 || hasOverrides) {
        requiresContextTx = true;
        // New slots default to `0x`; only name-keyed start-time overrides seed
        // a timestamp.
        const newSlots = newSlotEntries.map(([name, index]) => ({ index, initialValue: contextOverrides?.[name] ?? '0x' }));
        const expanded = this.contextService.buildExpandedContext(onChainCtx, newSlots, contextOverrides, slotMapping);
        contextCalldata = this.vaultInterface.encodeFunctionData('setContext', [expanded]);
      }

      for (const [name, index] of Object.entries(slotMapping)) {
        const isNew = index >= onChainCtx.length;
        contextChanges.push({
          slotIndex: index,
          slotName: name,
          isNew,
          currentValue: isNew ? undefined : onChainCtx[index],
          newValue: contextOverrides?.[name] ?? (isNew ? '0x' : onChainCtx[index]),
          usedByActiveAutomations: [],
        });
      }
    }

    return {
      automationCalldata,
      contextCalldata,
      functionName: 'updateAutomationSteps',
      steps,
      ownerOnly,
      stepCount: steps.length,
      requiresContextTx,
      contextChanges,
    };
  }

  encodeToggle(onChainId: number, active: boolean): string {
    return this.vaultInterface.encodeFunctionData('setAutomationActive', [
      onChainId,
      active,
    ]);
  }

  encodeExecute(onChainId: number): string {
    return this.vaultInterface.encodeFunctionData('executeAutomation', [
      onChainId,
    ]);
  }

  private isExistingSlot(_name: string, _vaultId: string): boolean {
    return false;
  }
}
