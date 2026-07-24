import neo4j, {
  type Driver,
  type ManagedTransaction,
  type QueryResult,
  type Session,
  type SessionConfig,
} from 'neo4j-driver';

export type Neo4jServiceConfig = {
  uri?: string;
  user?: string;
  password?: string;
  database?: string;
};

type BatchOptions = {
  batchSize?: number;
  label?: string;
};

const DEFAULT_URI = process.env.NEO4J_URI ?? 'bolt://localhost:7687';
const DEFAULT_USER = process.env.NEO4J_USER ?? 'neo4j';
const DEFAULT_PASSWORD = process.env.NEO4J_PASSWORD ?? 'neo4j_password';
const DEFAULT_DATABASE = process.env.NEO4J_DATABASE ?? 'neo4j';

const chunk = <T,>(items: T[], size: number): T[][] => {
  const result: T[][] = [];

  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }

  return result;
};

export class Neo4jService {
  private readonly driver: Driver;
  private readonly database: string;

  constructor(config?: Neo4jServiceConfig) {
    this.driver = neo4j.driver(
      config?.uri ?? DEFAULT_URI,
      neo4j.auth.basic(config?.user ?? DEFAULT_USER, config?.password ?? DEFAULT_PASSWORD),
    );
    this.database = config?.database ?? DEFAULT_DATABASE;
  }

  getDatabase(): string {
    return this.database;
  }

  async verifyConnectivity(): Promise<void> {
    await this.driver.verifyConnectivity();
  }

  async close(): Promise<void> {
    await this.driver.close();
  }

  createSession(sessionConfig?: SessionConfig): Session {
    return this.driver.session({
      database: this.database,
      ...sessionConfig,
    });
  }

  async withSession<T>(runner: (session: Session) => Promise<T>): Promise<T> {
    const session = this.createSession();

    try {
      return await runner(session);
    } finally {
      await session.close();
    }
  }

  async executeRead(
    session: Session,
    query: string,
    params?: Record<string, unknown>,
  ): Promise<QueryResult> {
    return session.executeRead((tx: ManagedTransaction) => tx.run(query, params));
  }

  async executeWrite(
    session: Session,
    query: string,
    params?: Record<string, unknown>,
  ): Promise<QueryResult> {
    return session.executeWrite((tx: ManagedTransaction) => tx.run(query, params));
  }

  async runBatched<T>(
    session: Session,
    query: string,
    rows: T[],
    options?: BatchOptions,
  ): Promise<void> {
    const batchSize = Math.max(1, Math.trunc(options?.batchSize ?? 300));
    const groups = chunk(rows, batchSize);

    for (let i = 0; i < groups.length; i += 1) {
      const group = groups[i];
      await this.executeWrite(session, query, { rows: group });

      if (options?.label) {
        console.log(`[seed] ${options.label}: lote ${i + 1}/${groups.length} (${group.length} itens)`);
      }
    }
  }
}
