import mongoose from 'mongoose';
import dns from 'node:dns';
import { logger } from '../logger/logger.js';

// Register MongoDB event listeners only once.
let listenersRegistered = false;

export interface ConnectDBOptions {
  usePublicDns?: boolean;
}

export async function connectDB(uri: string, options?: ConnectDBOptions): Promise<void> {
  if (isDBConnected()) {
    logger.warn('connectDB called but a connection is already active — skipping');
    return;
  }

  if (options?.usePublicDns) {
    logger.warn(
      'Using public DNS resolvers (8.8.8.8, 1.1.1.1) — this mutates the global process DNS config',
    );

    // Use public DNS servers when the environment has DNS resolution issues.
    dns.setServers(['8.8.8.8', '1.1.1.1']);
  }

  // Fail fast instead of buffering queries while the database is disconnected.
  mongoose.set('bufferCommands', false);

  registerConnectionEventLogging();

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10_000,
  });
}

export async function disconnectDB(): Promise<void> {
  if (!isDBConnected()) return;
  await mongoose.disconnect();
}

function registerConnectionEventLogging(): void {
  if (listenersRegistered) return;
  listenersRegistered = true;

  mongoose.connection.on('error', (err) => {
    logger.error({ err }, 'MongoDB connection error');
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
  });

  mongoose.connection.on('reconnected', () => {
    logger.info('MongoDB reconnected');
  });
}

export function isDBConnected(): boolean {
  return mongoose.connection.readyState === mongoose.ConnectionStates.connected;
}
