import type { GraphState } from '../graph.ts';

export function getImage(defaultImagePath: string) {
	return async (state: GraphState): Promise<Partial<GraphState>> => {
		const resolvedImagePath = state.imagePath?.trim() || defaultImagePath;

		if (!resolvedImagePath) {
			throw new Error('imagePath is required.');
		}

		return {
			imagePath: resolvedImagePath,
		};
	};
}