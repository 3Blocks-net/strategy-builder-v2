import { BackendClient } from '../backend-client.js';

export interface Recipe {
  key: string;
  name: string;
  description: string;
  category: string;
  /** Platzhalter-Graph: Nodes referenzieren Step-Types per Name, Werte als Platzhalter. */
  shape: unknown;
}

/**
 * Kuratierte Few-Shot-Referenz-Shapes (DCA, …). Der Agent nutzt sie als Anleitung
 * für gute Graph-Formen, bevor er frei aus dem Katalog assembliert. Rein lesend;
 * das Backend liefert nur gegen den Katalog validierte Recipes aus.
 */
export async function listRecipes(bc: BackendClient): Promise<Recipe[]> {
  return bc.get<Recipe[]>('/recipes');
}
