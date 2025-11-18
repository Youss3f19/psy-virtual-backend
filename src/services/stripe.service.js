const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

class StripeService {
  static async getCustomer(customerId) {
    return await stripe.customers.retrieve(customerId);
  }

  static async createCheckoutSession({ priceId, customerId, metadata = {} }) {
    return await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId, // IMPORTANT: real Stripe customer
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
    return stripe.webhooks.constructEvent(
      payload,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  }
}

module.exports = StripeService;
