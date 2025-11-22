const StripeService = require('../services/stripe.service');
const logger = require('../utils/logger');

const stripeSecret = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET;
const Stripe = require('stripe');
const stripe = stripeSecret ? new Stripe(stripeSecret) : null;

const User = require('../models/User.model');
const Subscription = require('../models/Subscription.model');
const ApiError = require('../utils/apiError');
const apiResponse = require('../utils/apiResponse');

class BillingController {

  // CREATE CHECKOUT SESSION
  static async createCheckout(req, res) {
    try {
      if (!stripe) {
        return res.json({
          success: false,
          code: 503,
          message: "Stripe not configured. Payment unavailable."
        });
      }
      const { plan } = req.body;
      const userId = req.user.id;

      const user = await User.findById(userId);

      if (!user) {
        return res.json({
          success: false,
          code: 404,
          message: "Utilisateur non trouvé"
        });
      }

      // Already premium: return code 407 safely
      if (user.isPremium && user.premiumExpiresAt && user.premiumExpiresAt > new Date()) {
        return res.json({
          success: false,
          code: 407,
          message: "Votre abonnement est déjà actif."
        });
      }

      const priceMap = {
        monthly: process.env.PRICE_MONTH,
        quarterly: process.env.PRICE_QUARTER,
        yearly: process.env.PRICE_YEAR,
      };

      const priceId = priceMap[plan];
      if (!priceId) {
        return res.json({
          success: false,
          code: 400,
          message: "Plan invalide"
        });
      }

      // Ensure Stripe Customer Exists
      if (!user.stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: { userId: user._id.toString() },
        });

        user.stripeCustomerId = customer.id;
        await user.save();
      }

      // Create Checkout Session
      const session = await StripeService.createCheckoutSession({
        priceId,
        customerId: user.stripeCustomerId,
        metadata: { userId: user._id.toString(), plan },
      });

      return res.json({
        success: true,
        code: 200,
        data: {
          sessionId: session.id,
          url: session.url,
        },
      });

    } catch (error) {
      return res.json({
        success: false,
        code: 500,
        message: error.message || "Erreur serveur"
      });
    }
  }


  // GET SESSION STATUS
  static async getSessionStatus(req, res) {
    try {
      if (!stripe) {
        return res.json({
          success: false,
          code: 503,
          message: "Stripe not configured."
        });
      }
      const { sessionId } = req.params;
      const session = await StripeService.getCheckoutSession(sessionId);

      const userId = session.metadata.userId;
      const subscriptionId = session.subscription;

      const user = await User.findById(userId);
      if (!user) {
        return res.json({
          success: false,
          code: 404,
          message: "Utilisateur non trouvé"
        });
      }

      if (subscriptionId && !user.stripeSubscriptionId) {
        user.stripeSubscriptionId = subscriptionId;
        await user.save();
      }

      return res.json({
        success: true,
        code: 200,
        data: {
          status: session.payment_status,
          subscriptionId,
        }
      });

    } catch (error) {
      return res.json({
        success: false,
        code: 500,
        message: error.message || "Erreur serveur"
      });
    }
  }


  // CANCEL SUBSCRIPTION
  static async cancelSubscription(req, res) {
    try {
      if (!stripe) {
        return res.json({
          success: false,
          code: 503,
          message: "Stripe not configured."
        });
      }
      const user = await User.findById(req.user.id);

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
      return res.json({
        success: false,
        code: 500,
        message: error.message
      });
    }
  }


  // WEBHOOK
  static async handleWebhook(req, res) {
    let event;

    try {
      if (!stripe) {
        return res.status(503).json({ error: 'Stripe not configured' });
      }
      const signature = req.headers["stripe-signature"];
      event = StripeService.verifyWebhookSignature(req.body, signature);
    } catch (err) {
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

