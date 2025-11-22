const helmet = require('helmet');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const passport = require('passport');
const config = require('./config');
const routes = require('./routes');
const path = require('path');
// Swagger UI
let swaggerUi;
let swaggerDocument;
try {
  swaggerUi = require('swagger-ui-express');
  swaggerDocument = require('./swagger.json');
} catch (e) {
  swaggerUi = null;
  swaggerDocument = null;
}
const { errorConverter, errorHandler } = require('./middleware/error.middleware');
const ApiError = require('./utils/apiError');
const logger = require('./utils/logger');
const app = express();
const BillingController = require('./controllers/billing.controller'); // If not imported yet


// Passport config
require('./config/passport')(passport);

// Security headers
app.use(helmet());

// CORS
app.use(
  cors({
    origin: function (origin, callback) {
      if (config.env === 'development') {
        // Allow Flutter Web / localhost / null origins
        return callback(null, true);
      }

      const allowedOrigins = [config.frontendUrl];

      if (!origin || origin === "null" || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);


// IMPORTANT: Stripe webhook route FIRST and RAW!
app.post(
  '/api/v1/billing/webhook',
  express.raw({ type: 'application/json' }),
  BillingController.handleWebhook
);
// Now, body parser for other routes
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting (skip webhook)
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: 'Trop de requetes depuis cette IP, veuillez reessayer plus tard',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/api/v1/billing/webhook'
});
app.use('/api', limiter);

// HTTP log
if (config.env === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined', {
    stream: { write: (message) => logger.http(message.trim()) },
  }));
}

// Passport initialization
app.use(passport.initialize());

// API Routes
app.use('/api/v1', routes);

// Swagger UI (optional)
if (swaggerUi && swaggerDocument) {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, { explorer: true }));
  app.get('/swagger.json', (req, res) => res.json(swaggerDocument));
}

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Bienvenue sur l\'API Psychologue Virtuel',
    version: '1.0.0',
    documentation: '/api/v1/health',
  });
});

// 404 handler
app.use((req, res, next) => {
  next(ApiError.notFound(`Route non trouvee: ${req.originalUrl}`));
});

// Error handling
app.use(errorConverter);
app.use(errorHandler);

module.exports = app;
