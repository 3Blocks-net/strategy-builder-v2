import type { RawGraph } from 'shared';

/** Verzweigt = mindestens eine Node mit getrennten true/false-Ausgangskanten. */
export function isBranched(rawGraph: RawGraph): boolean {
  return rawGraph.nodes.some((node) => {
    const handles = new Set(
      rawGraph.edges.filter((e) => e.source === node.id).map((e) => e.sourceHandle),
    );
    return handles.has('true') && handles.has('false');
  });
}
