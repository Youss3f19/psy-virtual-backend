const StripeService = require('../services/stripe.service');
const User = require('../models/User.model');
const ApiError = require('../utils/apiError');
const apiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');

class BillingController {
  /**
   * Créer une session de paiement Stripe Checkout
   */
  static async createCheckout(req, res, next) {
    try {
      const { plan } = req.body; // monthly , quarterly , yearly
      const userId = req.user.id;

      const user = await User.findById(userId);
      if (!user) throw ApiError.notFound('Utilisateur non trouvé');

      const priceMap = {
        monthly: process.env.PRICE_MONTH,
        quarterly: process.env.PRICE_QUARTER,
        yearly: process.env.PRICE_YEAR,
      };

      const priceId = priceMap[plan];
      if (!priceId) {
        throw ApiError.badRequest('Plan invalide. Choix: monthly, quarterly, yearly');
      }

      const session = await StripeService.createCheckoutSession({
        priceId,
        customerEmail: user.email,
        metadata: {
          userId: user._id.toString(),
          plan,
        },
      });

      logger.info(`Session Checkout créée: ${session.id} pour user ${user.email}`);

      return res.json(
        apiResponse.success({
          sessionId: session.id,
          url: session.url,
        })
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Vérifier le statut d'une session après paiement
   */
  static async getSessionStatus(req, res, next) {
    try {
      const { sessionId } = req.params;
      const session = await StripeService.getCheckoutSession(sessionId);

      return res.json(
        apiResponse.success({
          status: session.payment_status,
          customerEmail: session.customer_email,
          subscriptionId: session.subscription,
        })
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Annuler l'abonnement Premium
   */
  static async cancelSubscription(req, res, next) {
    try {
      const userId = req.user.id;
      const user = await User.findById(userId);

      if (!user || !user.isPremium) {
        throw ApiError.badRequest('Aucun abonnement actif');
      }
      // Simule l'annulation 
      logger.info(`Abonnement annulé pour user ${user.email}`);
      return res.json(apiResponse.success({ message: 'Abonnement annulé avec succès' }));
    } catch (error) {
      next(error);
    }
  }

  /**
   * Webhook Stripe - reçoit événements paiement
   */
  static async handleWebhook(req, res, next) {
  let event;

  try {
    const signature = req.headers['stripe-signature'];
    event = StripeService.verifyWebhookSignature(req.body, signature);
    logger.info(`Webhook reçu: ${event.type}`);
  } catch (err) {
    logger.error(`Webhook signature invalide: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === 'checkout.session.completed' || event.type === 'invoice.paid') {
      const data = event.data.object;
      const subscriptionId = data.subscription;

      if (subscriptionId) {
        const subscription = await StripeService.getSubscription(subscriptionId);
        const customerEmail = data.customer_email || subscription.customer_email;

        if (customerEmail) {
          const user = await User.findOne({ email: customerEmail });

          if (user) {
            // Teste l'existence et le format de current_period_end
            const periodEndSec = subscription?.current_period_end;

            if (!periodEndSec) {
              logger.error(`[STRIPE] Subscription sans current_period_end pour user ${customerEmail}`);
              return res.json({ received: true });
            }

            const periodEndMs = Number(periodEndSec) * 1000;
            const dateEnd = new Date(periodEndMs);

            if (isNaN(dateEnd.getTime()) || !isFinite(dateEnd.getTime())) {
              logger.error(`[STRIPE] current_period_end "${periodEndSec}" non convertible pour user ${customerEmail}`);
              return res.json({ received: true });
            }

            user.isPremium = true;
            user.premiumExpiresAt = dateEnd;

            // Stocker  subscriptionId
            // Houni bch nzidha nouha;

            await user.save();

            logger.info(` Premium activé: ${customerEmail} jusqu'à ${dateEnd.toISOString()}`);
          } else {
            logger.warn(`[STRIPE] Pas d'utilisateur trouvé pour email ${customerEmail}`);
          }
        }
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      logger.warn(` Abonnement annulé: ${subscription.id}`);
      // A implementer desactivation premium 
    }

    if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object;
      logger.error(` Échec paiement: ${invoice.customer_email}`);
      // Actions possibles notification email
    }

    return res.json({ received: true });
  } catch (error) {
    logger.error(`Erreur traitement webhook: ${error.message}`);
    return res.status(500).json({ error: 'Webhook processing error' });
  }
}

}

module.exports = BillingController;
