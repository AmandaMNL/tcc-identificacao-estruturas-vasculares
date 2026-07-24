import { buildGraph } from './graph.ts';
import { Neo4jService } from '../services/neo4j.service.ts';
import { OpenRouterService } from '../services/openrouter.service.ts';
import { RagService } from '../services/rag.service.ts';

const neo4jService = new Neo4jService();
const ragService = new RagService(neo4jService);
const llmService = new OpenRouterService();

export const graph = buildGraph({
  llmClient: llmService,
  ragService,
});
