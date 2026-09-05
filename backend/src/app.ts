import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { ApiError } from './utils/ApiError';
import { apiLimiter } from './middleware/rateLimit.middleware';
import routes from './routes';

/**
 * Builds the Express application.
 *
 * Kept free of side effects (no listen, no cron, no database connection) so it
 * can be imported directly by tests.
 */
export function createApp(): Express {
  const app = express();

  // Behind a reverse proxy in production, so client IPs (and therefore rate
  // limiting) come from X-Forwarded-For.
  app.set('trust proxy', env.isProduction ? 1 : false);
  app.disable('x-powered-by');

  app.use(helmet());

  app.use(
    cors({
      origin(origin, callback) {
        // Allow non-browser clients (curl, server-to-server) which send no Origin.
        if (!origin || env.allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        // An ApiError (not a bare Error) so the handler answers 403 rather
        // than treating a blocked origin as an internal fault.
        callback(ApiError.forbidden(`Origin ${origin} is not allowed by CORS`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  if (!env.isTest) {
    app.use(morgan(env.isProduction ? 'combined' : 'dev'));
  }

  app.use('/api', apiLimiter, routes);

  app.get('/', (_req, res) => {
    res.json({
      success: true,
      data: {
        name: 'TIMS API',
        description: 'Thermal Intelligence & Monitoring System',
        docs: '/api/health',
        version: '1.0.0',
      },
    });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
