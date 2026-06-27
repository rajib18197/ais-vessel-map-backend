import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import compression from 'compression';
import hpp from 'hpp';
import rateLimit from 'express-rate-limit';

import { env } from './config/env.js';
import { RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS } from './config/constants.js';
import { requestLogger } from './shared/middleware/request-logger.middleware.js';

export function createApp(): express.Application {
  const app = express();

  app.set('trust proxy', 1);

  // 1) GLOBAL MIDDLEWARES
  // Implement CORS
  app.use(
    cors({
      origin: env.ALLOWED_ORIGINS,
      methods: ['GET'],
      allowedHeaders: ['Content-Type', 'x-request-id'],
    }),
  );

  // Set security HTTP headers
  app.use(helmet());

  // Body parser, reading data from body into req.body
  app.use(express.json({ limit: '10kb' }));

  // Prevent parameter pollution
  app.use(hpp());
  app.use(compression());

  // Development logging
  if (env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
  }
  app.use(requestLogger);

  // Limit requests from same API
  const apiLimiter = rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: RATE_LIMIT_MAX_REQUESTS,
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: 'error', message: 'Too many requests, please try again later.' },
  });
  app.use('/api', apiLimiter);

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  return app;
}
