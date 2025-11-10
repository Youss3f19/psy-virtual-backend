const Session = require('../models/Session.model');
const ApiError = require('../utils/apiError');

/**
 * Middleware pour vérifier que la session appartient à l'utilisateur authentifié
 * Utilise req.body.session_id pour valider
 */
async function validateSessionOwnership(req, res, next) {
  try {
    const sessionId = req.body.sessionId;
    
    if (!sessionId) {
      return next();
    }
    
    const userId = req.user.id;
    
    const sessionIdInt = parseInt(sessionId);
    if (isNaN(sessionIdInt)) {
      return next(ApiError.badRequest('session_id doit être un entier'));
    }
    
    // Vérifier que la session existe et appartient à l'utilisateur
    const session = await Session.findOne({
      user: userId,
      mlSessionId: sessionIdInt,
      closedAt: null
    });
    
    if (!session) {
      return next(ApiError.forbidden('Session invalide ou non autorisée'));
    }
    
    // Session valide, attacher à req pour utilisation dans le controller
    req.validatedSession = session;
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = { validateSessionOwnership };
