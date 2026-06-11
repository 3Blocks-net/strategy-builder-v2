/**
 * Recipe = kuratierte Few-Shot-Referenz-Form: ein Platzhalter-Graph, dessen Nodes
 * Step-Types über ihren **stabilen Namen** referenzieren (keine Adressen), Werte als
 * Platzhalter. Der Seed validiert jedes Recipe gegen den aktuellen Katalog, bevor es
 * ausgeliefert wird — unbekannter Step-Type oder Param-Drift => nicht ausgeliefert.
 */

export interface RecipeNode {
  id: string;
  /** Stabiler StepType-Name (z. B. "Interval Condition"). */
  stepType: string;
  params?: Record<string, unknown>;
}

export interface RecipeEdge {
  source: string;
  target: string;
  sourceHandle?: string;
}

export interface RecipeShape {
  nodes: RecipeNode[];
  edges: RecipeEdge[];
}

export interface RecipeDefinition {
  key: string;
  name: string;
  description: string;
  category: string;
  shape: RecipeShape;
}

/** name → erlaubte Param-Keys (aus dem `paramSchema.properties` des Step-Types). */
export type Catalog = Map<string, Set<string>>;

interface CatalogStepLike {
  name: string;
  paramSchema?: { properties?: Record<string, unknown> };
}

export function buildCatalog(stepTypes: CatalogStepLike[]): Catalog {
  const catalog: Catalog = new Map();
  for (const s of stepTypes) {
    catalog.set(s.name, new Set(Object.keys(s.paramSchema?.properties ?? {})));
  }
  return catalog;
}

/**
 * Validiert eine Recipe-Form gegen den Katalog. Liefert eine Liste lesbarer
 * Fehler; leeres Array = gültig.
 */
export function validateRecipeShape(shape: RecipeShape, catalog: Catalog): string[] {
  const errors: string[] = [];
  const nodeIds = new Set<string>();

  for (const node of shape.nodes) {
    nodeIds.add(node.id);
    const allowedParams = catalog.get(node.stepType);
    if (!allowedParams) {
      errors.push(`unknown step type "${node.stepType}"`);
      continue;
    }
    for (const key of Object.keys(node.params ?? {})) {
      if (!allowedParams.has(key)) {
        errors.push(`param drift: "${node.stepType}" has no parameter "${key}"`);
      }
    }
  }

  for (const edge of shape.edges) {
    if (!nodeIds.has(edge.source)) errors.push(`edge source "${edge.source}" is not a node`);
    if (!nodeIds.has(edge.target)) errors.push(`edge target "${edge.target}" is not a node`);
  }

  return errors;
}
