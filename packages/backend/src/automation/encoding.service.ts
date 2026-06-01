import { Injectable, BadRequestException } from '@nestjs/common';
import { AbiCoder, Interface } from 'ethers';
import { PrismaService } from '../database/prisma.service';
import { ContextService } from './context.service';

const DONE = 0xffffffff;
const STEP_TYPE_CONDITION = 0;
const STEP_TYPE_ACTION = 1;

const VAULT_ABI = [
  'function createAutomation((uint8 stepType, address target, bytes4 selector, uint32 nextOnTrue, uint32 nextOnFalse, bytes data)[] steps) external returns (uint32)',
  'function createOwnerAutomation((uint8 stepType, address target, bytes4 selector, uint32 nextOnTrue, uint32 nextOnFalse, bytes data)[] steps) external returns (uint32)',
  'function setContext(bytes[] ctx) external',
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
    contextOverrides?: Record<number, string>,
  ): Promise<EncodeResult> {
    this.validateServerSide(graph);

    const ownerOnly = this.inferOwnerOnly(graph);

    const slotNames = this.extractSlotNames(graph);
    const slotMapping = slotNames.length > 0
      ? await this.contextService.allocateSlots(vaultId, slotNames, automationId)
      : {};

    const stepTypes = await this.prisma.stepType.findMany();
    const stepTypeMap = new Map(stepTypes.map((st) => [st.id, st]));

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

      const newSlots = newSlotEntries.map(([, index]) => ({
        index,
        initialValue: contextOverrides?.[index] ?? '0x',
      }));

      const expanded = this.contextService.buildExpandedContext(
        onChainCtx,
        newSlots,
        contextOverrides,
      );

      contextCalldata = this.vaultInterface.encodeFunctionData('setContext', [expanded]);

      for (const [name, index] of Object.entries(slotMapping)) {
        const isNew = index >= onChainCtx.length;
        contextChanges.push({
          slotIndex: index,
          slotName: name,
          isNew,
          currentValue: isNew ? undefined : onChainCtx[index],
          newValue: contextOverrides?.[index] ?? (isNew ? '0x' : onChainCtx[index]),
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
  ): string {
    const types = abiFragment.components.map((c) => c.type);
    const values = abiFragment.components.map((c) => {
      let val = params[c.name];

      if (typeof val === 'string' && slotMapping[val] !== undefined && c.type === 'uint32') {
        val = slotMapping[val];
      }

      if (val === undefined || val === null || val === '') {
        if (c.type === 'address') return '0x0000000000000000000000000000000000000000';
        if (c.type === 'uint256') return '0';
        if (c.type === 'uint32') return 0;
        if (c.type === 'bool') return false;
      }

      if (c.type === 'uint32' && typeof val === 'number') return val;
      if (c.type === 'uint32') return parseInt(String(val), 10);
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

  private extractSlotNames(graph: EditorGraph): string[] {
    const names = new Set<string>();
    for (const node of graph.nodes) {
      for (const val of Object.values(node.data.params)) {
        if (typeof val === 'string' && val !== '' && !val.startsWith('0x')) {
          // Could be a slot name - we check during encoding
        }
      }
    }
    // Slot names are identified during encoding via the schema's x-ui-widget: context-slot
    // For now, collect names referenced by context slot fields from step type schemas
    return Array.from(names);
  }

  private isExistingSlot(_name: string, _vaultId: string): boolean {
    return false;
  }
}
