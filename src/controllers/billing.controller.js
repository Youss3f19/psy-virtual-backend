const StripeService = require('../services/stripe.service');
const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const User = require('../models/User.model');
const ApiError = require('../utils/apiError');
const apiResponse = require('../utils/apiResponse');

class BillingController {

  // CREATE CHECKOUT SESSION
  static async createCheckout(req, res) {
    try {
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
      const user = await User.findById(req.user.id);

      if (!user || !user.stripeSubscriptionId) {
        return res.json({
          success: false,
          code: 400,
          message: "Aucun abonnement actif"
        });
      }

      await StripeService.cancelSubscription(user.stripeSubscriptionId);

      user.isPremium = false;
      user.premiumExpiresAt = null;
      user.stripeSubscriptionId = null;
      await user.save();

      return res.json({
        success: true,
        code: 200,
        message: "Abonnement annulé"
      });

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
      const signature = req.headers["stripe-signature"];
      event = StripeService.verifyWebhookSignature(req.body, signature);
    } catch (err) {
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    switch (event.type) {

      case "invoice.paid": {
        const invoice = event.data.object;
        const subscriptionId =
          invoice.parent?.subscription_details?.subscription ||
          invoice.subscription ||
          null;

        if (!subscriptionId) break;

        const customerId = invoice.customer;
        const customer = await StripeService.getCustomer(customerId);
        const email = customer.email.toLowerCase();

        const user = await User.findOne({ email });
        if (!user) break;

        const subscription = await StripeService.getSubscription(subscriptionId);

        let periodEnd = subscription?.current_period_end
          ? new Date(subscription.current_period_end * 1000)
          : null;

        user.isPremium = true;
        user.stripeSubscriptionId = subscriptionId;

        if (!periodEnd || isNaN(periodEnd)) {
          const amount = invoice.amount_paid;
          periodEnd = new Date();

          if (amount === 999) {
            periodEnd.setMonth(periodEnd.getMonth() + 1);
          } else if (amount === 1499) {
            periodEnd.setMonth(periodEnd.getMonth() + 3);
          } else if (amount === 7999) {
            periodEnd.setFullYear(periodEnd.getFullYear() + 1);
          } else {
            periodEnd.setMonth(periodEnd.getMonth() + 1);
          }
        }

        user.premiumExpiresAt = periodEnd;

        await user.save();
        break;
      }


      case "customer.subscription.deleted": {
        const subscription = event.data.object;

        const user = await User.findOne({
          stripeSubscriptionId: subscription.id,
        });

        if (user) {
          user.isPremium = false;
          user.premiumExpiresAt = null;
          user.stripeSubscriptionId = null;
          await user.save();
        }
        break;
      }
    }

    return res.json({ success: true, code: 200, received: true });
  }
}

module.exports = BillingController;

