import { buildGraph } from './graph.ts';
import { Neo4jService } from '../services/neo4j.service.ts';
import { OpenRouterService } from '../services/openrouter.service.ts';
import { RagService } from '../services/rag.service.ts';
import { ImageAnnotatorService } from '../services/image.annotator.ts';

const neo4jService = new Neo4jService();
const ragService = new RagService(neo4jService);
const llmService = new OpenRouterService();
const imageAnnotatorService = new ImageAnnotatorService();

export const graph = buildGraph({
  llmClient: llmService,
  ragService,
  imageAnnotatorService,
});
