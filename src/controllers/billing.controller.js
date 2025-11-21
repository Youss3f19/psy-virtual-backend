const StripeService = require('../services/stripe.service');
const User = require('../models/User.model');
const Subscription = require('../models/Subscription.model');
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

      const sub = await Subscription.findOne({ user: userId });
      if (!sub || !sub.isActive) {
        throw ApiError.badRequest('Aucun abonnement actif');
      }

      // Mark subscription as inactive (local cancel)
      sub.isActive = false;
      await sub.save();

      // Clear link on user (optional)
      if (user) {
        user.subscription = null;
        await user.save();
      }

      logger.info(`Abonnement annulé pour user ${user?.email}`);
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
          const stripeSub = await StripeService.getSubscription(subscriptionId);
          const customerEmail = data.customer_email || stripeSub.customer_email;

          if (customerEmail) {
            const user = await User.findOne({ email: customerEmail });

            if (user) {
              const periodEndSec = stripeSub?.current_period_end;
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

              // Create or update local Subscription
              let sub = await Subscription.findOne({ user: user._id });
              const planMeta = (stripeSub?.metadata && stripeSub.metadata.plan) || data?.metadata?.plan || 'premium';
              if (!sub) {
                sub = await Subscription.create({
                  user: user._id,
                  tier: planMeta,
                  isActive: true,
                  startsAt: new Date(),
                  expiresAt: dateEnd,
                  autoRenew: true,
                  metadata: { stripeSubscriptionId: subscriptionId }
                });
              } else {
                sub.tier = planMeta || sub.tier;
                sub.isActive = true;
                sub.expiresAt = dateEnd;
                sub.metadata = Object.assign({}, sub.metadata || {}, { stripeSubscriptionId: subscriptionId });
                await sub.save();
              }

              user.subscription = sub._id;
              await user.save();

              logger.info(`Premium activé: ${customerEmail} jusqu'à ${dateEnd.toISOString()}`);
            } else {
              logger.warn(`[STRIPE] Pas d'utilisateur trouvé pour email ${customerEmail}`);
            }
          }
        }
      }

      if (event.type === 'customer.subscription.deleted') {
        const subscription = event.data.object;
        logger.warn(`Abonnement annulé: ${subscription.id}`);
        const customerEmail = subscription?.customer_email || null;
        if (customerEmail) {
          const user = await User.findOne({ email: customerEmail });
          if (user) {
            const sub = await Subscription.findOne({ user: user._id });
            if (sub) {
              sub.isActive = false;
              await sub.save();
              user.subscription = null;
              await user.save();
            }
          }
        }
      }

      if (event.type === 'invoice.payment_failed') {
        const invoice = event.data.object;
        logger.error(`Échec paiement: ${invoice.customer_email}`);
      }

      return res.json({ received: true });
    } catch (error) {
      logger.error(`Erreur traitement webhook: ${error.message}`);
      return res.status(500).json({ error: 'Webhook processing error' });
    }
}

}

module.exports = BillingController;
