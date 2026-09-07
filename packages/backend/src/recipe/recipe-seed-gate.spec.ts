import { RECIPES } from './recipe-seed-data';
import { buildCatalog, validateRecipeShape } from './recipe-validation';
import { STEP_TYPE_CATALOG } from '../../prisma/seed/step-types';

/**
 * The seed drops any recipe whose shape does not match the deployed catalog —
 * quietly, with a warning nobody reads until a recipe is missing from the
 * gallery. That gate only runs against a live database, so recipe drift stays
 * invisible in the normal test run.
 *
 * This is the same gate against the seeded catalog, without a database. It
 * would have caught the swap steps losing `amountOutMinimum` while the recipes
 * still passed it.
 */
describe('seed recipe gate', () => {
  it('delivers every curated recipe — none is silently dropped', () => {
    const catalog = buildCatalog(STEP_TYPE_CATALOG as never);

    const rejected = RECIPES.map((recipe) => ({
      key: recipe.key,
      errors: validateRecipeShape(recipe.shape, catalog),
    }))
      .filter((result) => result.errors.length > 0)
      .map((result) => `${result.key}: ${result.errors.join('; ')}`);

    expect(rejected).toEqual([]);
  });

  it('rejects a recipe that names a parameter the catalog does not have', () => {
    // Guards the guard: without this, an empty catalog or a broken walk would
    // make the assertion above pass no matter what the recipes say.
    const catalog = buildCatalog(STEP_TYPE_CATALOG as never);
    const [first] = RECIPES;
    const tampered = {
      ...first.shape,
      nodes: first.shape.nodes.map((node, index) =>
        index === 0 ? { ...node, params: { ...node.params, notAParam: '1' } } : node,
      ),
    };

    expect(validateRecipeShape(tampered, catalog)).not.toEqual([]);
  });
});
