import { buildGraph } from './graph.ts';
import { ImageService } from '../services/image.service.ts';
import { ImageTransformService } from '../services/image.transform.ts';
import { Neo4jService } from '../services/neo4j.service.ts';
import { OpenRouterService } from '../services/openrouter.service.ts';

const neo4jService = new Neo4jService();
const imageService = new ImageService();
const imageTransformService = new ImageTransformService(neo4jService);
const llmService = new OpenRouterService();

export const graph = buildGraph({
  llmClient: llmService,
  imageService,
  imageTransformService,
});
