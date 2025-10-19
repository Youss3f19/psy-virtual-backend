const jwt = require('jsonwebtoken');
const User = require('../models/User.model');
const ApiError = require('../utils/apiError');
const config = require('../config');
const logger = require('../utils/logger');

class AuthService {
  /**
   * Générer un JWT token
   * @param {string} userId - ID de l'utilisateur
   * @param {string} expiresIn - Durée d'expiration
   * @returns {string} Token JWT
   */
  static generateToken(userId, expiresIn = config.jwt.accessExpire) {
    return jwt.sign({ id: userId }, config.jwt.secret, { expiresIn });
  }

  /**
   * Générer access token et refresh token
   * @param {string} userId - ID de l'utilisateur
   * @returns {object} Tokens
   */
  static generateAuthTokens(userId) {
    const accessToken = this.generateToken(userId, config.jwt.accessExpire);
    const refreshToken = this.generateToken(userId, config.jwt.refreshExpire);

    return {
      accessToken,
      refreshToken,
    };
  }

  /**
   * Créer un nouvel utilisateur (inscription locale)
   * @param {object} userData - Données utilisateur
   * @returns {object} Utilisateur et tokens
   */
  static async signup(userData) {
    const { name, email, password } = userData;

    // Vérifier si l'email existe déjà
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      throw ApiError.conflict('Cet email est déjà utilisé');
    }

    // Créer l'utilisateur
    const user = await User.create({
      name,
      email,
      password,
      authProvider: 'local',
    });

    logger.info(`Nouvel utilisateur créé: ${email}`);

    // Générer tokens
    const tokens = this.generateAuthTokens(user._id);

    return {
      user,
      tokens,
    };
  }

  /**
   * Connexion utilisateur  
   * @param {string} email - Email de l'utilisateur
   * @param {string} password - Mot de passe
   * @returns {object} Utilisateur et tokens
   */
  static async login(email, password) {
    // Trouver l'utilisateur avec le mot de passe
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      throw ApiError.unauthorized('Email ou mot de passe incorrect');
    }

    // Vérifier si l'utilisateur utilise l'authentification locale
    if (user.authProvider !== 'local' || !user.password) {
      throw ApiError.badRequest(
        `Veuillez vous connecter avec ${user.authProvider === 'google' ? 'Google' : 'votre méthode d\'origine'}`
      );
    }

    // Comparer les mots de passe
    const isPasswordMatch = await user.comparePassword(password);
    if (!isPasswordMatch) {
      throw ApiError.unauthorized('Email ou mot de passe incorrect');
    }

    // Vérifier si le compte est actif
    if (!user.isActive) {
      throw ApiError.forbidden('Votre compte a été désactivé. Contactez le support');
    }

    // Mettre à jour lastLogin
    user.lastLogin = new Date();
    await user.save();

    logger.info(`Connexion réussie: ${email}`);

    // Générer tokens
    const tokens = this.generateAuthTokens(user._id);

    // Retirer le password de l'objet user
    user.password = undefined;

    return {
      user,
      tokens,
    };
  }

  /**
   * Récupérer les informations de l'utilisateur connecté
   * @param {string} userId - ID de l'utilisateur
   * @returns {object} Utilisateur
   */
  static async getCurrentUser(userId) {
    const user = await User.findById(userId);

    if (!user) {
      throw ApiError.notFound('Utilisateur non trouvé');
    }

    if (!user.isActive) {
      throw ApiError.forbidden('Compte désactivé');
    }

    return user;
  }

  /**
   * Rafraîchir le token d'accès
   * @param {string} refreshToken - Refresh token
   * @returns {object} Nouveaux tokens
   */
  static async refreshToken(refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, config.jwt.secret);
      
      const user = await User.findById(decoded.id);
      if (!user || !user.isActive) {
        throw ApiError.unauthorized('Token invalide');
      }

      const tokens = this.generateAuthTokens(user._id);
      
      return tokens;
    } catch (error) {
      throw ApiError.unauthorized('Refresh token invalide ou expiré');
    }
  }

  /**
   * Authentification Google OAuth (callback)
   * @param {object} user - Utilisateur depuis Passport
   * @returns {object} Tokens
   */
  static async googleOAuthCallback(user) {
    // Mettre à jour lastLogin
    user.lastLogin = new Date();
    await user.save();

    logger.info(`Connexion Google réussie: ${user.email}`);

    // Générer tokens
    const tokens = this.generateAuthTokens(user._id);

    return tokens;
  }

  /**
   * Changer le mot de passe
   * @param {string} userId - ID de l'utilisateur
   * @param {string} oldPassword - Ancien mot de passe
   * @param {string} newPassword - Nouveau mot de passe
   * @returns {boolean} Succès
   */
  static async changePassword(userId, oldPassword, newPassword) {
    const user = await User.findById(userId).select('+password');

    if (!user) {
      throw ApiError.notFound('Utilisateur non trouvé');
    }

    if (user.authProvider !== 'local') {
      throw ApiError.badRequest('Impossible de changer le mot de passe pour les comptes OAuth');
    }

    // Vérifier l'ancien mot de passe
    const isPasswordMatch = await user.comparePassword(oldPassword);
    if (!isPasswordMatch) {
      throw ApiError.unauthorized('Ancien mot de passe incorrect');
    }

    // Mettre à jour le mot de passe
    user.password = newPassword;
    await user.save();

    logger.info(`Mot de passe changé pour: ${user.email}`);

    return true;
  }

  /**
   * Mettre à jour le profil utilisateur
   * @param {string} userId - ID de l'utilisateur
   * @param {object} updates - Données à mettre à jour
   * @returns {object} Utilisateur mis à jour
   */
  static async updateProfile(userId, updates) {
    const allowedUpdates = ['name', 'avatar'];
    const filteredUpdates = {};

    // Filtrer les champs autorisés
    Object.keys(updates).forEach((key) => {
      if (allowedUpdates.includes(key)) {
        filteredUpdates[key] = updates[key];
      }
    });

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: filteredUpdates },
      { new: true, runValidators: true }
    );

    if (!user) {
      throw ApiError.notFound('Utilisateur non trouvé');
    }

    logger.info(`Profil mis à jour: ${user.email}`);

    return user;
  }

  /**
   * Supprimer le compte utilisateur
   * @param {string} userId - ID de l'utilisateur
   * @returns {boolean} Succès
   */
  static async deleteAccount(userId) {
    const user = await User.findByIdAndUpdate(
      userId,
      { isActive: false },
      { new: true }
    );

    if (!user) {
      throw ApiError.notFound('Utilisateur non trouvé');
    }

    logger.info(`Compte désactivé: ${user.email}`);

    return true;
  }
}

module.exports = AuthService;
