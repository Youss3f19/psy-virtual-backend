const StripeService = require('../services/stripe.service');

async function checkout(req, res) {
  const { priceId, customerEmail, metadata } = req.body;
  try {
    const session = await StripeService.createCheckoutSession({ priceId, customerEmail, metadata });
    res.json({ url: session.url }); // Send Stripe Checkout URL back to frontend
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = { checkout };
