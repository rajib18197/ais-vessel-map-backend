import { createServer } from 'http';
import { WebSocketServer } from 'ws';

import { env } from './config/env.js';
import { logger } from './shared/logger/logger.js';
import { connectDB, disconnectDB } from './shared/db/connection.js';
import { createApp } from './app.js';
import { startAisFeed, stopAisFeed } from './features/ais-feed/ais-feed.bootstrap.js';
import { registerVesselStream } from './features/stream-vessels/stream-vessels.handler';
import { startCleanupJob, stopCleanupJob } from './features/cleanup-vessels/cleanup-vessels.job.js';

/**
 * App starts here:
 */
async function bootstrap(): Promise<void> {
  process.on('uncaughtException', (err) => {
    logger.error({ err }, 'UNCAUGHT EXCEPTION — shutting down');
    process.exit(1);
  });

  await connectDB(env.DATABASE_URL, { usePublicDns: true });
  logger.info('MongoDB connection established');

  const app = createApp();
  const httpServer = createServer(app);

  // Single WS server shares the HTTP server's port — no second port to manage.
  const wss = new WebSocketServer({ server: httpServer, path: '/ws/vessels' });
  registerVesselStream(wss);

  httpServer.listen(env.PORT, () => {
    logger.info(`Server running on port ${env.PORT} (${env.NODE_ENV})`);
  });

  // Starts the TCP/UDP AIS feed connection
  startAisFeed();
  startCleanupJob();

  process.on('unhandledRejection', (err) => {
    logger.error({ err }, 'UNHANDLED REJECTION — shutting down gracefully');
    httpServer.close(() => process.exit(1));
  });

  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info(`${signal} received — shutting down gracefully`);

    stopAisFeed();
    stopCleanupJob();

    wss.clients.forEach((client) => client.close(1001, 'Server shutting down'));
    wss.close();

    httpServer.close(async () => {
      await disconnectDB();
      logger.info('Process terminated');
      process.exit(0);
    });

    setTimeout(() => {
      logger.error('Graceful shutdown timed out — forcing exit');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
