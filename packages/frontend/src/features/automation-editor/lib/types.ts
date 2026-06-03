export const DONE = 0xffffffff;

export type StepCategory = 'CONDITION' | 'ACTION';

export interface GraphNode {
  id: string;
  type: StepCategory;
  position: { x: number; y: number };
  measured?: { width: number; height: number };
  data: {
    stepTypeId: string;
    label: string;
    contractAddress: string;
    selector: string;
    params: Record<string, unknown>;
  };
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle: 'true' | 'false' | 'out';
}

export interface StepOutput {
  stepType: StepCategory;
  target: string;
  selector: string;
  nextOnTrue: number;
  nextOnFalse: number;
  data: Record<string, unknown>;
}

export interface ValidationError {
  message: string;
  nodeId?: string;
  /**
   * Field this error belongs to (param-validation pass only). Inline per-field
   * errors filter the shared `validationErrors` list by `nodeId` + `fieldName`;
   * the aggregated panel reads the same list.
   */
  fieldName?: string;
}

export interface Connection {
  source: string;
  target: string;
  sourceHandle?: string | null;
}
