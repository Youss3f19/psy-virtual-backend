const AuthService = require('../services/auth.service');
const ApiResponse = require('../utils/apiResponse');
const ApiError = require('../utils/apiError');
const logger = require('../utils/logger');
const config = require('../config');
const Subscription = require('../models/Subscription.model');

class AuthController {
  /**
   * @desc    Inscription d'un nouvel utilisateur
   * @route   POST /api/v1/auth/signup
   * @access  Public
   */
  static async signup(req, res, next) {
    try {
      const { name, email, password } = req.body;
      const result = await AuthService.signup({ name, email, password });


      const isPremium = await (result.user.isActivePremium ? result.user.isActivePremium() : false);
      const response = ApiResponse.created(
        {
          user: {
            id: result.user._id,
            name: result.user.name,
            email: result.user.email,
            avatar: result.user.avatar,
            isPremium,
            authProvider: result.user.authProvider,
          },
          accessToken: result.tokens.accessToken,
          refreshToken: result.tokens.refreshToken,
        },
        'Inscription réussie'
      );

      res.status(response.statusCode).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Connexion utilisateur
   * @route   POST /api/v1/auth/login
   * @access  Public
   */
  static async login(req, res, next) {
    try {
      const { email, password } = req.body;
      const result = await AuthService.login(email, password);


      const isPremium = await (result.user.isActivePremium ? result.user.isActivePremium() : false);
      const response = ApiResponse.success(
        {
          user: {
            id: result.user._id,
            name: result.user.name,
            email: result.user.email,
            avatar: result.user.avatar,
            isPremium,
            authProvider: result.user.authProvider,
            lastLogin: result.user.lastLogin,
          },
          accessToken: result.tokens.accessToken,
          refreshToken: result.tokens.refreshToken,
        },
        'Connexion réussie'
      );

      res.status(response.statusCode).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Callback générique pour OAuth (Google, Facebook, etc.)
   * @route   GET /api/v1/auth/google/callback
   * @route   GET /api/v1/auth/facebook/callback
   * @access  Public
   */
  static async oAuthCallback(req, res, next) {
    try {
      // Générer les tokens JWT pour l'utilisateur authentifié
      const tokens = await AuthService.generateAuthTokens(req.user);

      // Redirection vers le frontend avec les tokens
      const redirectUrl = `${config.frontendUrl}/auth-success?accessToken=${tokens.accessToken}&refreshToken=${tokens.refreshToken}`;
      
      res.redirect(redirectUrl);
    } catch (error) {
      const authProvider = req.user ? req.user.authProvider : 'unknown';
      logger.error(`Erreur lors du callback OAuth (${authProvider}) : ${error.message}`);
      res.redirect(`${config.frontendUrl}/login?error=auth_failed`);
    }
  }

  /**
   * @desc    Récupérer les informations de l'utilisateur connecté
   * @route   GET /api/v1/auth/me
   * @access  Private
   */
  static async getCurrentUser(req, res, next) {
    try {
      const user = await AuthService.getCurrentUser(req.user._id);


      // Resolve current subscription info
      const sub = await Subscription.findOne({ user: user._id });
      const isPremium = sub ? sub.isActiveNow() : false;
      const response = ApiResponse.success({
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        isPremium,
        premiumExpiresAt: sub ? sub.expiresAt : null,
        authProvider: user.authProvider,
        isEmailVerified: user.isEmailVerified,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt,
      });

      res.status(response.statusCode).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Rafraîchir le token d'accès
   * @route   POST /api/v1/auth/refresh-token
   * @access  Public
   */
  static async refreshToken(req, res, next) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        throw ApiError.badRequest('Refresh token requis');
      }

      const tokens = await AuthService.refreshToken(refreshToken);
      const response = ApiResponse.success(tokens, 'Token rafraîchi avec succès');

      res.status(response.statusCode).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Changer le mot de passe
   * @route   PUT /api/v1/auth/change-password
   * @access  Private
   */
  static async changePassword(req, res, next) {
    try {
      const { oldPassword, newPassword } = req.body;
      await AuthService.changePassword(req.user._id, oldPassword, newPassword);

      const response = ApiResponse.success(null, 'Mot de passe changé avec succès');
      res.status(response.statusCode).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Mettre à jour le profil
   * @route   PUT /api/v1/auth/profile
   * @access  Private
   */
  static async updateProfile(req, res, next) {
    try {
      const updates = req.body;
      const user = await AuthService.updateProfile(req.user._id, updates);

      const response = ApiResponse.success(
        {
          id: user._id,
          name: user.name,
          email: user.email,
          avatar: user.avatar,
        },
        'Profil mis à jour avec succès'
      );

      res.status(response.statusCode).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Déconnexion
   * @route   POST /api/v1/auth/logout
   * @access  Private
   */
  static async logout(req, res, next) {
    try {
      logger.info(`Déconnexion utilisateur : ${req.user.email}`);
      const response = ApiResponse.success(null, 'Déconnexion réussie');
      res.status(response.statusCode).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Supprimer le compte
   * @route   DELETE /api/v1/auth/account
   * @access  Private
   */
  static async deleteAccount(req, res, next) {
    try {
      await AuthService.deleteAccount(req.user._id);
      const response = ApiResponse.success(null, 'Compte supprimé avec succès');
      res.status(response.statusCode).json(response);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = AuthController;
