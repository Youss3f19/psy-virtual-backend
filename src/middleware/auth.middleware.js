const jwt = require('jsonwebtoken');
const User = require('../models/User.model');
const ApiError = require('../utils/apiError');
const config = require('../config');
const logger = require('../utils/logger');

const protect = async (req, _res, next) => {
  try {
    let token;

    if (req.headers.authorization?.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      throw ApiError.unauthorized('Accès refusé. Token manquant');
    }

    const decoded = jwt.verify(token, config.jwt.secret);
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      throw ApiError.unauthorized('Utilisateur non trouvé');
    }

    if (!user.isActive) {
      throw ApiError.forbidden('Compte désactivé');
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      next(ApiError.unauthorized('Token invalide'));
    } else if (error.name === 'TokenExpiredError') {
      next(ApiError.unauthorized('Token expiré'));
    } else {
      next(error);
    }
  }
};

const restrictTo = (...roles) => {
  return (req, _res, next) => {
    if (!roles.includes(req.user.role)) {
      throw ApiError.forbidden('Vous n\'avez pas la permission d\'effectuer cette action');
    }
    next();
  };
};

const checkPremium = async (req, _res, next) => {
  if (!req.user || !(await req.user.isActivePremium())) {
    throw ApiError.forbidden('Accès réservé aux utilisateurs premium');
  }
  next();
};

module.exports = {
  protect,
  restrictTo,
  checkPremium,
};
