import { recoverAfterRestart } from './agent/agent.ts';
import { aiModel } from './agent/model.ts';
import { aiTitler } from './agent/titles.ts';
import { aiService } from './ai.ts';
import { buildApp } from './app.ts';
import { aiSetupWords, type Config, type DcrsAiSettings } from './config.ts';
import type { Registry } from './connectors/registry.ts';
import { openDatabase } from './db/index.ts';
import { aiImageReader } from './files/vision.ts';
import { startMaintenance } from './maintenance.ts';
import { aiTranscriber } from './voice/transcriber.ts';

export interface StartOptions {
  logLevel?: 'info' | 'warn';
  /** Where the AI settings came from (config.ts withDcrsAiSettings), for the start-up line: names only, never a key. */
  aiFrom?: DcrsAiSettings;
}

/** Opens the database, starts the API and shuts both down cleanly on Ctrl+C. */
export async function startServer(config: Config, registry: Registry, options: StartOptions = {}) {
  const database = await openDatabase(config.databaseUrl);
  const recovered = await recoverAfterRestart(database.db);
  // ONE AI SERVICE for the agent, the titles, the photos and the microphone (DCRS REQUIREMENTS §109; ai.ts). Its
  // warnings (the day's allowance, a parameter a model refuses) go to the server's log once there is one.
  let warn = (line: string) => console.warn(line);
  const service = aiService(config, { warn: (line) => warn(line) });
  const app = await buildApp(
    {
      config,
      db: database.db,
      registry,
      model: aiModel(config, service),
      titler: aiTitler(config, service),
      transcriber: aiTranscriber(config, service, registry.connectors),
      imageReader: aiImageReader(config, service),
    },
    { logger: { level: options.logLevel ?? 'info' } },
  );
  warn = (line) => app.log.warn(line);
  if (recovered > 0) app.log.warn({ conversations: recovered }, 'settled replies that were cut off when the server last stopped');
  const stopMaintenance = startMaintenance(database.db, config, app.log);

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, async () => {
      stopMaintenance();
      await app.close();
      await database.close();
      process.exit(0);
    });
  }

  await app.listen({ port: config.port, host: config.host });
  // Which service answers, with which models, and where its settings came from: names and numbers, never a key.
  const words = aiSetupWords(config, options.aiFrom);
  for (const line of words.info) app.log.info(line);
  for (const line of words.warn) app.log.warn(line);
  return app;
}
