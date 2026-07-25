import type { GraphState } from '../graph.ts';

export function responseNode() {
  return async (_state: GraphState): Promise<Partial<GraphState>> => {
    return {};
  };
}
