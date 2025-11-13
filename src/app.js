const helmet = require('helmet');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const passport = require('passport');
const config = require('./config');
const routes = require('./routes');
const { errorConverter, errorHandler } = require('./middleware/error.middleware');
const ApiError = require('./utils/apiError');
const logger = require('./utils/logger');

const app = express();

// Configuration Passport
require('./config/passport')(passport);

// Security headers
app.use(helmet());

// CORS configuration
app.use(
  cors({
    origin: function (origin, callback) {
      if (config.env === 'development') {
        return callback(null, true);
      }
      const allowedOrigins = [config.frontendUrl];
      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
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

// IMPORTANT: Webhook Stripe AVANT body parser JSON
// Le webhook doit recevoir le body en format raw (Buffer)
app.use(
  '/api/v1/billing/webhook',
  express.raw({ type: 'application/json' })
);

// Body parser (pour toutes les autres routes)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting (après webhook pour ne pas limiter Stripe)
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: 'Trop de requetes depuis cette IP, veuillez reessayer plus tard',
  standardHeaders: true,
  legacyHeaders: false,
  // Exclure le webhook du rate limiting
  skip: (req) => req.path === '/api/v1/billing/webhook'
});
app.use('/api', limiter);

// HTTP request logger
if (config.env === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(
    morgan('combined', {
      stream: { write: (message) => logger.http(message.trim()) },
    })
  );
}

// Passport initialization
app.use(passport.initialize());

// API Routes
app.use('/api/v1', routes);

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

// Error handling middlewares
app.use(errorConverter);
app.use(errorHandler);

module.exports = app;
