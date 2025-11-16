const connectDB = require('./config'); 
const mongoose = require('mongoose');
const User = require('./models/User.model');   

async function cleanExpiredPremiums() {
  const now = new Date();
  const result = await User.updateMany(
    { isPremium: true, premiumExpiresAt: { $lte: now } },
    { $set: { isPremium: false, stripeSubscriptionId: null } }
  );
  console.log('Expired users cleaned:', result.modifiedCount);
}

(async () => {
  await connectDB(); 
  await cleanExpiredPremiums();
  mongoose.disconnect(); 
})();

// crontab -e
// 0 0 * * * /usr/bin/node ""path script0js"" >> /home/youruser/myproject/cleanup.log 2>&1
