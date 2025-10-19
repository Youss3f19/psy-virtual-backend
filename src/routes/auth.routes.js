const express = require('express');
const passport = require('passport');
const AuthController = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth.middleware');
const validate = require('../middleware/validation.middleware');
const { signupValidator, loginValidator } = require('../validators/auth.validator');

const router = express.Router();

/**
 * @route   POST /api/v1/auth/signup
 * @desc    Inscription locale
 * @access  Public
 */
router.post('/signup', signupValidator, validate, AuthController.signup);

/**
 * @route   POST /api/v1/auth/login
 * @desc    Connexion locale
 * @access  Public
 */
router.post('/login', loginValidator, validate, AuthController.login);

/**
 * @route   GET /api/v1/auth/google
 * @desc    Redirection vers Google OAuth
 * @access  Public
 */
router.get(
  '/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false,
  })
);

/**
 * @route   GET /api/v1/auth/google/callback
 * @desc    Callback Google OAuth
 * @access  Public
 */
router.get(
  '/google/callback',
  passport.authenticate('google', {
    failureRedirect: `${process.env.FRONTEND_URL}/login?error=google_auth_failed`,
    session: false,
  }),
  AuthController.googleCallback
);

/**
 * @route   GET /api/v1/auth/me
 * @desc    Récupérer l'utilisateur connecté
 * @access  Private
 */
router.get('/me', protect, AuthController.getCurrentUser);

/**
 * @route   POST /api/v1/auth/refresh-token
 * @desc    Rafraîchir le token d'accès
 * @access  Public
 */
router.post('/refresh-token', AuthController.refreshToken);

/**
 * @route   PUT /api/v1/auth/change-password
 * @desc    Changer le mot de passe
 * @access  Private
 */
router.put('/change-password', protect, AuthController.changePassword);

/**
 * @route   PUT /api/v1/auth/profile
 * @desc    Mettre à jour le profil
 * @access  Private
 */
router.put('/profile', protect, AuthController.updateProfile);

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Déconnexion
 * @access  Private
 */
router.post('/logout', protect, AuthController.logout);

/**
 * @route   DELETE /api/v1/auth/account
 * @desc    Supprimer le compte
 * @access  Private
 */
router.delete('/account', protect, AuthController.deleteAccount);

module.exports = router;
