const ApiError = require('../utils/apiError');
const Session = require('../models/Session.model');
const NotificationService = require('../services/notification.service');

// Limits for non-premium users. Configurable via env vars.
const FREE_MESSAGES_PER_SESSION = Number(process.env.FREE_MESSAGES_PER_SESSION) || 10;
const FREE_SESSION_COOLDOWN_MINUTES = Number(process.env.FREE_SESSION_COOLDOWN_MINUTES) || 60; // minutes

/**
 * enforcePremiumLimits
 * - If user is premium => allow
 * - If user has an ongoing session (req.validatedSession): count user messages in that session and deny if over limit
 * - If no ongoing session: check the most recent completed session closedAt and enforce cooldown for starting a new one
 */
module.exports = async function enforcePremiumLimits(req, res, next) {
  try {
    const user = req.user;
    if (!user) return next();

    // user.isActivePremium() is async
    if (typeof user.isActivePremium === 'function') {
      try {
        const isPremium = await user.isActivePremium();
        if (isPremium) return next();
      } catch (e) {
        // If premium check fails, fall through to limits (safe default)
      }
    }

    // If we have a validated session (continuation), enforce per-session message limit
    const session = req.validatedSession || null;
    if (session) {
      // Count number of user messages already in session
      const userMsgs = Array.isArray(session.messages) ? session.messages.filter(m => m.role === 'user').length : 0;
      if (userMsgs >= FREE_MESSAGES_PER_SESSION) {
        // notify user about block
        await NotificationService.createNotification(user.id, 'usage_blocked', 'Limite atteinte', `Vous avez atteint la limite gratuite de ${FREE_MESSAGES_PER_SESSION} messages par séance. Passez en Premium pour continuer.`, { limit: FREE_MESSAGES_PER_SESSION }, 'inapp', true);
        return next(ApiError.forbidden(`Limite atteinte: ${FREE_MESSAGES_PER_SESSION} messages par séance pour les comptes gratuits. Passez en Premium pour continuer.`));
      }
      return next();
    }

    // No active session: enforce cooldown between completed sessions
    const last = await Session.findOne({ user: user.id, status: 'completed' }).sort({ closedAt: -1 }).select('closedAt createdAt').lean();
    if (!last || !last.closedAt) return next();

    const cooldownMs = FREE_SESSION_COOLDOWN_MINUTES * 60 * 1000;
    const elapsed = Date.now() - new Date(last.closedAt).getTime();
    if (elapsed < cooldownMs) {
      const remainingMs = cooldownMs - elapsed;
      const minutes = Math.ceil(remainingMs / (60 * 1000));
      const availableAt = new Date(Date.now() + remainingMs);
      // create notification to inform when they can come back
      await NotificationService.createNotification(user.id, 'cooldown', 'Revenez plus tard', `Revenez dans ${minutes} minute(s) pour démarrer une nouvelle séance, ou passez en Premium.`, { availableAt }, 'inapp', true);
      return next(ApiError.forbidden(`Limite d'utilisation: revenez dans ${minutes} minute(s) pour démarrer une nouvelle séance, ou passez en Premium.`));
    }

    return next();
  } catch (err) {
    return next(err);
  }
};
