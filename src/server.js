const dotenv = require("dotenv");
const path = require('path');

// Load .env file based on NODE_ENV or use .env.development by default
const envFile = process.env.NODE_ENV === 'production' ? '.env' : '.env.development';
dotenv.config({ path: path.resolve(__dirname, `../${envFile}`) });

const express = require('express');
const app = require('./app');
const connectDB = require('./config/database');
const config = require('./config');
const logger = require('./utils/logger');
const fs = require('fs');

// Créer le dossier logs
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// Connexion à la base de données
connectDB();

// Démarrer le serveur
const server = app.listen(config.port, () => {
  logger.info(` Serveur démarré sur le port ${config.port}`);
  logger.info(` Environnement: ${config.env}`);
  logger.info(` URL: http://localhost:${config.port}`);
  logger.info(` Health check: http://localhost:${config.port}/api/v1/health`);
});

// initialize socket.io (optional)
try {
  const { initSocket } = require('./utils/socket');
  initSocket(server);
  logger.info('Socket.io initialized');
} catch (e) {
  logger.debug('socket.io not started: ' + e.message);
}

// Start weekly summary job
try {
  const { startWeeklyJob } = require('./jobs/weeklySummary.job');
  startWeeklyJob();
} catch (e) {
  logger.error('Impossible de démarrer le weeklySummary job: ' + e.message);
}

// Start inactivity job
try {
  const { startInactivityJob } = require('./jobs/inactivity.job');
  startInactivityJob();
} catch (e) {
  logger.error('Impossible de démarrer le inactivity job: ' + e.message);
}

// Start notification delivery worker
try {
  const { startNotificationDeliveryJob } = require('./jobs/notificationDelivery.job');
  startNotificationDeliveryJob();
} catch (e) {
  logger.error('Impossible de démarrer le notification delivery job: ' + e.message);
}

// Gestion des erreurs non gérées
process.on('unhandledRejection', (err) => {
  logger.error(` UNHANDLED REJECTION: ${err.name} - ${err.message}`);
  logger.error(err.stack);
  
  // Fermer le serveur proprement
  server.close(() => {
    process.exit(1);
  });
});

process.on('uncaughtException', (err) => {
  logger.error(` UNCAUGHT EXCEPTION: ${err.name} - ${err.message}`);
  logger.error(err.stack);
  
  process.exit(1);
});

// Gestion de l'arrêt propre
process.on('SIGTERM', () => {
  logger.info(' SIGTERM reçu. Arrêt du serveur...');
  server.close(() => {
    logger.info(' Serveur arrêté proprement');
    process.exit(0);
  });
});

module.exports = server;
