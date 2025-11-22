const Stripe = require('stripe');
const logger = require('../utils/logger');

const stripeSecret = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET;
if (!stripeSecret) {
  logger.warn('STRIPE_SECRET_KEY or STRIPE_SECRET env var not set. Stripe integration disabled');
}
const stripe = stripeSecret ? new Stripe(stripeSecret) : null;

class StripeService {
  static async getCustomer(customerId) {
    if (!stripe) throw new Error('Stripe not configured');
    return await stripe.customers.retrieve(customerId);
  }

  static async createCheckoutSession({ priceId, customerId, metadata = {} }) {
    if (!stripe) throw new Error('Stripe not configured');
    return await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId, // IMPORTANT real Stripe customer
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.FRONTEND_URL}/#/success`,
      cancel_url: `${process.env.FRONTEND_URL}/#/cancel`,
      metadata,
    });
  }

  static async getCheckoutSession(sessionId) {
    return await stripe.checkout.sessions.retrieve(sessionId);
  }

  static async getSubscription(subscriptionId) {
    return await stripe.subscriptions.retrieve(subscriptionId);
  }

  static async cancelSubscription(subscriptionId) {
    return await stripe.subscriptions.cancel(subscriptionId);
  }

  static verifyWebhookSignature(payload, signature) {
    if (!stripe) throw new Error('Stripe not configured');
    return stripe.webhooks.constructEvent(
      payload,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  }
}

module.exports = StripeService;
