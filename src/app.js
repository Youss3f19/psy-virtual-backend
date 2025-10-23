const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const passport = require('passport');
const config = require('./config');
const routes = require('./routes');
const { errorConverter, errorHandler } = require('./middleware/error.middleware');
const ApiError = require('./utils/apiError');
const logger = require('./utils/logger');

// Initialiser Express
const app = express();

// Configuration Passport
require('./config/passport')(passport);

// Security headers
app.use(helmet());

// CORS configuration
app.use(
  cors({
    origin: function (origin, callback) {
      // Autoriser toutes les origines en développement
      if (config.env === 'development') {
        return callback(null, true);
      }
      // En production, vérifier les origines autorisées
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

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: 'Trop de requêtes depuis cette IP, veuillez réessayer plus tard',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', limiter);

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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
  next(ApiError.notFound(`Route non trouvée: ${req.originalUrl}`));
});

// Error handling middlewares
app.use(errorConverter);
app.use(errorHandler);

module.exports = app;
