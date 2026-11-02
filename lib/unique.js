import { read } from './db';
import { findSimilarDescriptions } from './text';
import { UNIQUE_BLOCK } from './ai';

/** Returns an error message if `description` is too close to another listing (any seller), else null. */
export function duplicateProblem(description, excludeId = null) {
  const all = read((db) => db.products);
  const hit = findSimilarDescriptions(description, all, { threshold: UNIQUE_BLOCK, excludeId, limit: 1 })[0];
  return hit ? `Описанието е твърде сходно с „${hit.title}“ (${Math.round(hit.score * 100)}% съвпадение). Променете го, за да е уникално, и опитайте отново.` : null;
}
