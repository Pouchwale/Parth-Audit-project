import { embeddedDatabaseWarning, loadConfig, withDcrsAiSettings, type Config, type DcrsAiSettings } from './config.ts';
import { connectors, SIGN_IN_CONNECTOR } from './connectors/index.ts';
import { createRegistry } from './connectors/registry.ts';
import { startServer } from './server.ts';

// A setting the server refuses (a missing key, production on an embedded database: DCRS REQUIREMENTS §107) is said in
// its own plain words, not as a stack trace, and the server does not start.
let config: Config;
let aiFrom: DcrsAiSettings;
try {
  // ONE AI KEY FOR BOTH APPS (DCRS REQUIREMENTS §109): with no OpenAI key of its own, this server takes the AI settings
  // from DCRS's backend/.env (DCRS_ENV_FILE), and nothing else from it. The file is read, never printed.
  aiFrom = withDcrsAiSettings();
  config = loadConfig(aiFrom.env);
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
// Where the data is kept, every time the server starts: an embedded folder is not PostgreSQL (DCRS REQUIREMENTS §107),
// said in plain words before it is opened, until DATABASE_URL names Mitra's PostgreSQL database.
const embedded = embeddedDatabaseWarning(config.databaseUrl);
if (embedded) console.warn(`\n${embedded}\n`);
await startServer(config, createRegistry(connectors(config), SIGN_IN_CONNECTOR), { aiFrom });
