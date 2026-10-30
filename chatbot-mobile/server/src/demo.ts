// Demo mode (npm run demo): the real server with made-up findings instead of DCRS, so the whole
// flow can be tried before DCRS is connected. Accounts: demo/demo, and admin/admin as super admin.
// The database is in memory and everything resets on restart. Never run this in production.
import { randomBytes } from 'node:crypto';
import { loadConfig, productionSaidBy, withDcrsAiSettings } from './config.ts';
import { createDemoConnector } from './connectors/demo/index.ts';
import { createRegistry } from './connectors/registry.ts';
import { startServer } from './server.ts';

// Never in production (DCRS REQUIREMENTS §107): its database is in memory, and it lets anyone in as demo/demo.
const production = productionSaidBy();
if (production) {
  console.error(`Demo mode is never run in production (${production}=production): start the real server with npm start instead.`);
  process.exit(1);
}

process.env.CREDENTIALS_KEY ||= randomBytes(32).toString('base64');
// The AI key from DCRS's backend/.env when this server has none of its own (DCRS REQUIREMENTS §109), as in index.ts.
const aiFrom = withDcrsAiSettings();
const config = loadConfig(aiFrom.env);
const app = await startServer(
  // Any web origin, so the app works whether it's opened at localhost, 127.0.0.1 or this computer's network address.
  { ...config, databaseUrl: 'memory://', superAdmins: new Set([...config.superAdmins, 'admin']), corsOrigins: ['*'] },
  createRegistry([createDemoConnector()], 'demo'),
  // Keep the terminal quiet: only warnings and errors, not a line per request.
  { logLevel: 'warn', aiFrom },
);
app.log.warn('DEMO MODE: sample data; sign in as demo/demo, or admin/admin for the Accounts view. Data resets on restart.');
