import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { RecipeService } from './recipe.service';

@ApiTags('Recipes')
@Public()
@Controller('recipes')
export class RecipeController {
  constructor(private readonly recipes: RecipeService) {}

  @Get()
  @ApiOperation({ summary: 'Curated few-shot reference recipe shapes (read-only)' })
  findAll() {
    return this.recipes.findAll();
  }
}
