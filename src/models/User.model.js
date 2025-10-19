const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const config = require('../config');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Le nom est requis'],
      trim: true,
      minlength: [2, 'Le nom doit contenir au moins 2 caractères'],
      maxlength: [50, 'Le nom ne peut pas dépasser 50 caractères'],
    },
    email: {
      type: String,
      required: [true, "L'email est requis"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Email invalide'],
      index: true,
    },
    password: {
      type: String,
      minlength: [6, 'Le mot de passe doit contenir au moins 6 caractères'],
      select: false,
    },
    googleId: {
      type: String,
      sparse: true,
      index: true,
    },
      facebookId: {
        type: String,
        unique: true,
        sparse: true 
    },
    avatar: {
      type: String,
      default: null,
    },
    authProvider: {
      type: String,
      enum: ['local', 'google' , 'facebook'],
      default: 'local',
    },
    isPremium: {
      type: Boolean,
      default: false,
    },
    premiumExpiresAt: {
      type: Date,
      default: null,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLogin: {
      type: Date,
      default: null,
    },
    emotionHistory: [
      {
        emotion: {
          type: String,
          enum: ['joie', 'tristesse', 'colère', 'anxiété', 'neutre'],
        },
        intensity: {
          type: Number,
          min: 0,
          max: 1,
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (_doc, ret) {
        delete ret.password;
        delete ret.__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

// Index composé pour recherche optimisée
userSchema.index({ email: 1, authProvider: 1 });

// Middleware pre-save: Hash password
userSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(config.bcryptRounds);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Méthode instance: Comparer password
userSchema.methods.comparePassword = async function (candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw error;
  }
};

// Méthode instance: Vérifier si premium actif
userSchema.methods.isActivePremium = function () {
  if (!this.isPremium) return false;
  if (!this.premiumExpiresAt) return true;
  return this.premiumExpiresAt > new Date();
};

// Méthode statique: Trouver par email
userSchema.statics.findByEmail = function (email) {
  return this.findOne({ email: email.toLowerCase() });
};

// Virtual: Nom d'affichage
userSchema.virtual('displayName').get(function () {
  return this.name || this.email.split('@')[0];
});

module.exports = mongoose.model('User', userSchema);
