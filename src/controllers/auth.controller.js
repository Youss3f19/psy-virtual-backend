const AuthService = require('../services/auth.service');
const ApiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');
const config = require('../config');

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

      const response = ApiResponse.created(
        {
          user: {
            id: result.user._id,
            name: result.user.name,
            email: result.user.email,
            avatar: result.user.avatar,
            isPremium: result.user.isPremium,
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

      const response = ApiResponse.success(
        {
          user: {
            id: result.user._id,
            name: result.user.name,
            email: result.user.email,
            avatar: result.user.avatar,
            isPremium: result.user.isPremium,
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
   * @desc    Authentification Google (redirection)
   * @route   GET /api/v1/auth/google
   * @access  Public
   */
  static googleAuth(req, res, next) {
    // Géré par Passport middleware
    logger.info('Redirection vers Google OAuth');
  }

  /**
   * @desc    Callback Google OAuth
   * @route   GET /api/v1/auth/google/callback
   * @access  Public
   */
  static async googleCallback(req, res, next) {
    try {
      const tokens = await AuthService.googleOAuthCallback(req.user);

      // Redirection vers le frontend avec les tokens
      const redirectUrl = `${config.frontendUrl}/auth-success?accessToken=${tokens.accessToken}&refreshToken=${tokens.refreshToken}`;
      
      res.redirect(redirectUrl);
    } catch (error) {
      logger.error(`Erreur Google callback: ${error.message}`);
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

      const response = ApiResponse.success({
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        isPremium: user.isPremium,
        premiumExpiresAt: user.premiumExpiresAt,
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
   * @desc    Déconnexion (optionnel - côté client)
   * @route   POST /api/v1/auth/logout
   * @access  Private
   */
  static async logout(req, res, next) {
    try {
      // Dans un système JWT, la déconnexion se fait principalement côté client
      // On peut logger l'événement ici
      logger.info(`Déconnexion utilisateur: ${req.user.email}`);

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
