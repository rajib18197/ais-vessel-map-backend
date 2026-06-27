import { env } from '../../config/env.js';
import { logger } from '../../shared/logger/logger.js';
import { createAisFeedConnection, type AisFeedConnection } from './ais-feed-connection.service.js';
import { createAisDecoderStream } from './ais-feed-decoder.service.js';
import { applyVesselUpdate } from './ais-feed.usecase.js';

let connection: AisFeedConnection | null = null;

export function startAisFeed(): void {
  if (!env.AIS_FEED_HOST || !env.AIS_FEED_PORT) {
    logger.warn('AIS_FEED_HOST/PORT not configured — skipping AIS feed connection');
    return;
  }

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
      // console.log(line, 17167);
      decoder.write(line);
    },
  );

  connection.start();
}

export function stopAisFeed(): void {
  connection?.stop();
  connection = null;
}
