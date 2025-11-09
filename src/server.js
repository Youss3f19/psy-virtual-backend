const dotenv = require("dotenv");
dotenv.config({ path: ".env.development" });
const express = require('express');
const app = require('./app');
const connectDB = require('./config/database');
const config = require('./config');
const logger = require('./utils/logger');
const fs = require('fs');
const path = require('path');

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
