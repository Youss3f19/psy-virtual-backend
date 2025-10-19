const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const User = require('../models/User.model');
const logger = require('../utils/logger');

module.exports = (passport) => {
  // Stratégie d'authentification Google
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          let user = await User.findOne({ googleId: profile.id });

          if (user) {
            logger.info(`Utilisateur Google existant : ${user.email}`);
            return done(null, user);
          }

          // Crée un nouvel utilisateur s'il n'existe pas
          user = await User.create({
            googleId: profile.id,
            name: profile.displayName,
            email: profile.emails[0].value,
            avatar: profile.photos[0]?.value,
            authProvider: 'google',
            isEmailVerified: true,
          });

          logger.info(`Nouvel utilisateur Google créé : ${user.email}`);
          done(null, user);
        } catch (error) {
          logger.error(`Erreur Google OAuth : ${error.message}`);
          done(error, null);
        }
      }
    )
  );

  // Stratégie d'authentification Facebook[web:225][web:231]
  passport.use(
    new FacebookStrategy(
      {
        clientID: process.env.FACEBOOK_APP_ID,
        clientSecret: process.env.FACEBOOK_APP_SECRET,
        callbackURL: `${process.env.GOOGLE_CALLBACK_URL.split('/auth/')[0]}/auth/facebook/callback`, // Construit l'URL de callback pour Facebook
        profileFields: ['id', 'displayName', 'emails', 'photos'],
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          let user = await User.findOne({ facebookId: profile.id });

          if (user) {
            logger.info(`Utilisateur Facebook existant : ${user.email}`);
            return done(null, user);
          }

          // Vérifie si un utilisateur avec le même email existe déjà
          const existingUser = await User.findOne({ email: profile.emails[0].value });
          if (existingUser) {
            logger.warn(`L'email ${profile.emails[0].value} est déjà utilisé par un autre compte.`);
            // Il est recommandé de gérer ce cas, par exemple en liant les comptes ou en affichant une erreur
            return done(new Error(`Un compte avec l'email ${profile.emails[0].value} existe déjà.`), null);
          }
          
          // Crée un nouvel utilisateur s'il n'existe pas
          user = await User.create({
            facebookId: profile.id,
            name: profile.displayName,
            email: profile.emails[0].value,
            avatar: profile.photos[0]?.value,
            authProvider: 'facebook',
            isEmailVerified: true,
          });

          logger.info(`Nouvel utilisateur Facebook créé : ${user.email}`);
          done(null, user);
        } catch (error) {
          logger.error(`Erreur Facebook OAuth : ${error.message}`);
          done(error, null);
        }
      }
    )
  );

  // Sérialise l'utilisateur pour le stocker dans la session
  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  // Désérialise l'utilisateur à partir de la session
  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findById(id);
      done(null, user);
    } catch (error) {
      done(error, null);
    }
  });
};
