import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

/**
 * Read-only Zugriff auf die team-kuratierten Recipes. Es gibt bewusst **keinen**
 * Schreibpfad (create/update/delete) — Recipes sind ausschließlich seed-/team-
 * kuratiert (kein User-/Community-Schreibweg).
 */
@Injectable()
export class RecipeService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.recipe.findMany({
      select: { key: true, name: true, description: true, category: true, shape: true },
      orderBy: { name: 'asc' },
    });
  }
}
