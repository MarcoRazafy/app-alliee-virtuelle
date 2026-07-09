const bcrypt = require('bcrypt');
const userModel = require('../models/user.model');
const { generateToken } = require('../utils/jwt.util');
const { isValidPassword } = require('../utils/validators');

const SALT_ROUNDS = 10;

async function register(req, res, next) {
  try {
    const { email, password, full_name, phone, position } = req.body;

    const existingUser = await userModel.findByEmail(email);
    if (existingUser) {
      return res.status(409).json({ error: 'Un compte existe déjà avec cet email' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await userModel.create({ email, passwordHash, fullName: full_name, phone, position });

    res.status(201).json({
      message: 'Inscription envoyée, attente validation admin',
      user,
    });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    const user = await userModel.findByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    if (user.status === userModel.USER_STATUS.PENDING) {
      return res.status(403).json({ error: 'Compte en attente de validation par un administrateur' });
    }
    if (user.status === userModel.USER_STATUS.SUSPENDED) {
      return res.status(403).json({ error: 'Compte suspendu' });
    }
    if (user.status === userModel.USER_STATUS.REJECTED) {
      return res.status(403).json({ error: 'Compte refusé' });
    }

    const token = generateToken(user);

    res.status(200).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        status: user.status,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function me(req, res, next) {
  try {
    const user = await userModel.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }

    res.status(200).json({
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      phone: user.phone_number,
      position: user.position,
      role: user.role,
      status: user.status,
    });
  } catch (err) {
    next(err);
  }
}

async function changePassword(req, res, next) {
  try {
    const { current_password: currentPassword, new_password: newPassword } = req.body;

    if (!isValidPassword(newPassword)) {
      return res.status(400).json({ error: 'Le nouveau mot de passe doit contenir au moins 8 caractères' });
    }

    const user = await userModel.findById(req.user.id);
    const passwordMatches = await bcrypt.compare(currentPassword || '', user.password_hash);
    if (!passwordMatches) {
      return res.status(400).json({ error: 'Mot de passe actuel incorrect' });
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await userModel.updatePasswordHash(user.id, passwordHash);

    res.status(200).json({ message: 'Mot de passe mis à jour' });
  } catch (err) {
    next(err);
  }
}

function logout(req, res) {
  res.status(200).json({ message: 'Déconnexion réussie' });
}

module.exports = { register, login, me, logout, changePassword };
