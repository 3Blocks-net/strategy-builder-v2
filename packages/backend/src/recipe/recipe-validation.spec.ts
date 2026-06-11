import { buildCatalog, validateRecipeShape, type RecipeShape } from './recipe-validation';
import { RECIPES } from './recipe-seed-data';

const catalog = buildCatalog([
  { name: 'Interval Condition', paramSchema: { properties: { interval: {}, startTime: {}, timeSlot: {} } } },
  {
    name: 'PancakeSwap V3 Swap',
    paramSchema: { properties: { tokenIn: {}, tokenOut: {}, fee: {}, amountIn: {} } },
  },
  {
    name: 'Aave V3 Supply',
    paramSchema: { properties: { asset: {}, mode: {}, amount: {}, amountFromSlot: {}, targetHealthFactor: {}, amountToSlot: {} } },
  },
  { name: 'PancakeSwap V3 Collect', paramSchema: { properties: { tokenIdFromSlot: {} } } },
  {
    name: 'PancakeSwap V3 Increase Liquidity',
    paramSchema: {
      properties: { tokenA: {}, tokenB: {}, tokenIdFromSlot: {}, amountADesired: {}, amountAFromSlot: {}, amountBDesired: {}, amountBFromSlot: {} },
    },
  },
]);

describe('validateRecipeShape', () => {
  it('akzeptiert eine katalog-konforme Form', () => {
    const shape: RecipeShape = {
      nodes: [
        { id: 't', stepType: 'Interval Condition', params: { interval: 'INTERVALL' } },
        { id: 'b', stepType: 'PancakeSwap V3 Swap', params: { tokenIn: 'A', tokenOut: 'B', fee: '500', amountIn: 'X' } },
      ],
      edges: [{ source: 't', target: 'b', sourceHandle: 'out' }],
    };
    expect(validateRecipeShape(shape, catalog)).toEqual([]);
  });

  it('lehnt einen unbekannten Step-Type ab', () => {
    const shape: RecipeShape = {
      nodes: [{ id: 'x', stepType: 'Price Condition', params: {} }],
      edges: [],
    };
    expect(validateRecipeShape(shape, catalog)).toContainEqual(expect.stringContaining('unknown step type'));
  });

  it('lehnt Param-Drift ab (Param existiert nicht im Schema)', () => {
    const shape: RecipeShape = {
      nodes: [{ id: 'b', stepType: 'PancakeSwap V3 Swap', params: { nonexistent: 'X' } }],
      edges: [],
    };
    expect(validateRecipeShape(shape, catalog)).toContainEqual(expect.stringContaining('param drift'));
  });

  it('lehnt Kanten auf nicht existierende Nodes ab', () => {
    const shape: RecipeShape = {
      nodes: [{ id: 't', stepType: 'Interval Condition' }],
      edges: [{ source: 't', target: 'ghost' }],
    };
    expect(validateRecipeShape(shape, catalog)).toContainEqual(expect.stringContaining('edge target'));
  });
});

describe('RECIPES (seed data)', () => {
  it('alle ausgelieferten Recipes sind gegen den Beispiel-Katalog gültig', () => {
    for (const recipe of RECIPES) {
      expect(validateRecipeShape(recipe.shape, catalog)).toEqual([]);
    }
  });

  it('Recipe-Keys sind eindeutig', () => {
    const keys = RECIPES.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
