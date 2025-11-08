const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

class StripeService {
  /**
   * Créer une session Checkout pour abonnement
   * @param {string} priceId - ID du tarif Stripe (mensuel/3mois/annuel)
   * @param {string} customerEmail - Email de l'utilisateur
   * @param {object} metadata - Métadonnées optionnelles
   * @returns {object} Session Checkout
   */
  static async createCheckoutSession({ priceId, customerEmail, metadata = {} }) {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: customerEmail,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${process.env.FRONTEND_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/payment/cancel`,
      metadata,
      allow_promotion_codes: true, // Active les codes promo
    });

    return session;
  }

  /**
   * Récupérer une session Checkout
   * @param {string} sessionId - ID de la session
   * @returns {object} Session
   */
  static async getCheckoutSession(sessionId) {
    return await stripe.checkout.sessions.retrieve(sessionId);
  }

  /**
   * Récupérer une subscription
   * @param {string} subscriptionId - ID subscription
   * @returns {object} Subscription
   */
  static async getSubscription(subscriptionId) {
    return await stripe.subscriptions.retrieve(subscriptionId);
  }

  /**
   * Annuler une subscription
   * @param {string} subscriptionId - ID subscription
   * @returns {object} Subscription annulée
   */
  static async cancelSubscription(subscriptionId) {
    return await stripe.subscriptions.cancel(subscriptionId);
  }

  /**
   * Vérifier la signature webhook
   * @param {Buffer} payload - Raw body
   * @param {string} signature - Header stripe-signature
   * @returns {object} Event vérifié
   */
  static verifyWebhookSignature(payload, signature) {
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
    return stripe.webhooks.constructEvent(payload, signature, endpointSecret);
  }
}

module.exports = StripeService;
