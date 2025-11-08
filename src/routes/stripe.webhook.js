const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
const User = require('../models/User.model');

router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  let event;
  try {
    const sig = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed' || event.type === 'invoice.paid') {
    const data = event.data.object;
    const subscriptionId = data.subscription;
    if (subscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const customerEmail =
        data.customer_email || subscription?.customer_details?.email || subscription?.customer_email;
      if (customerEmail) {
        const user = await User.findOne({ email: customerEmail });
        if (user) {
          const periodEndMs = subscription.current_period_end * 1000;
          user.isPremium = true;
          user.premiumExpiresAt = new Date(periodEndMs);
          await user.save();
        }
      }
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    // Option: basculer l’utilisateur en Free si l’abonnement devient inactif.
  }

  return res.json({ received: true });
});

module.exports = router;
