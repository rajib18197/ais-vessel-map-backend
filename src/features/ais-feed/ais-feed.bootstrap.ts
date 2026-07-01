import { env } from '../../config/env.js';
import { logger } from '../../shared/logger/logger.js';
import { createAisFeedConnection, type AisFeedConnection } from './ais-feed-connection.service.js';
import { createAisDecoderStream } from './ais-feed-decoder.service.js';
import { applyVesselUpdate } from './ais-feed.usecase.js';

// Keep the current AIS connection so we can stop it later.
let connection: AisFeedConnection | null = null;

export function startAisFeed(): void {
  if (!env.AIS_FEED_HOST || !env.AIS_FEED_PORT) {
    logger.warn({}, 'AIS_FEED_HOST/PORT not configured — skipping AIS feed connection');
    return;
  }

  // Decode incoming AIS messages and update vessel data.
  const decoder = createAisDecoderStream((update, rawSentence) => {
    void applyVesselUpdate(update, rawSentence);
  });

  connection = createAisFeedConnection(
    {
      host: env.AIS_FEED_HOST,
      port: env.AIS_FEED_PORT,
      protocol: env.AIS_FEED_PROTOCOL,
      reconnectDelayMs: env.AIS_FEED_RECONNECT_DELAY_MS,
    },
    (line) => {
      // Send each received line to the decoder.
      decoder.write(line);
    },
  );

  connection.start();
}

export function stopAisFeed(): void {
  // Close the connection when the application shuts down.
  connection?.stop();
  connection = null;
}
