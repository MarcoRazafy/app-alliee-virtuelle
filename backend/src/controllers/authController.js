const fs = require('fs');
const bcrypt = require('bcrypt');
const userModel = require('../models/user.model');
const taskModel = require('../models/task.model');
const avatarModel = require('../models/avatar.model');
const { generateToken } = require('../utils/jwt.util');
const { isValidPassword } = require('../utils/validators');

const SALT_ROUNDS = 10;

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

async function register(req, res, next) {
  try {
    const {
      email,
      password,
      first_name: firstName,
      last_name: lastName,
      username,
      phone,
      position,
      postal_address: postalAddress,
      birth_date: birthDate,
    } = req.body;

    const normalizedUsername = username.toLowerCase();

    const existingEmail = await userModel.findByEmail(email);
    if (existingEmail) {
      return res.status(409).json({ error: 'Un compte existe déjà avec cet email' });
    }
    const existingUsername = await userModel.findByUsername(normalizedUsername);
    if (existingUsername) {
      return res.status(409).json({ error: "Ce nom d'utilisateur est déjà pris" });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await userModel.create({
      email,
      passwordHash,
      firstName,
      lastName,
      username: normalizedUsername,
      phone,
      position,
      postalAddress,
      birthDate,
    });

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
    const { identifier, password } = req.body;

    const user = await userModel.findByEmailOrUsername(identifier);
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

    // L'employé doit revalider sa journée à chaque connexion : on repart d'une sélection vide
    if (user.role === userModel.USER_ROLE.EMPLOYEE) {
      await taskModel.replaceDailySelection(user.id, todayDateString(), []);
    }

    const token = generateToken(user);

    res.status(200).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
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
    const avatar = await avatarModel.findByUserId(req.user.id);

    res.status(200).json({
      id: user.id,
      email: user.email,
      username: user.username,
      first_name: user.first_name,
      last_name: user.last_name,
      full_name: user.full_name,
      phone: user.phone_number,
      position: user.position,
      postal_address: user.postal_address,
      birth_date: user.birth_date,
      role: user.role,
      status: user.status,
      has_avatar: !!avatar,
      created_at: user.created_at,
    });
  } catch (err) {
    next(err);
  }
}

async function updateProfile(req, res, next) {
  try {
    const {
      first_name: firstName,
      last_name: lastName,
      phone,
      postal_address: postalAddress,
      birth_date: birthDate,
    } = req.body;

    const updated = await userModel.updateProfile(req.user.id, { firstName, lastName, phone, postalAddress, birthDate });

    res.status(200).json({
      id: updated.id,
      email: updated.email,
      username: updated.username,
      first_name: updated.first_name,
      last_name: updated.last_name,
      full_name: updated.full_name,
      phone: updated.phone_number,
      position: updated.position,
      postal_address: updated.postal_address,
      birth_date: updated.birth_date,
      role: updated.role,
      status: updated.status,
    });
  } catch (err) {
    next(err);
  }
}

async function uploadAvatar(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Image requise' });
    }

    const previous = await avatarModel.findByUserId(req.user.id);

    const avatar = await avatarModel.upsert({
      userId: req.user.id,
      fileName: req.file.originalname,
      filePath: req.file.path,
      fileSize: req.file.size,
      fileType: req.file.mimetype,
    });

    // Remplace l'ancien fichier une fois le nouveau enregistré en base
    if (previous && previous.file_path !== avatar.file_path) {
      fs.unlink(previous.file_path, () => {});
    }

    res.status(200).json({ uploaded: true });
  } catch (err) {
    next(err);
  }
}

async function getMyAvatar(req, res, next) {
  try {
    const avatar = await avatarModel.findByUserId(req.user.id);
    if (!avatar) {
      return res.status(404).json({ error: 'Aucune photo de profil' });
    }

    res.sendFile(avatar.file_path);
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

async function logout(req, res, next) {
  try {
    // Un chrono ne doit jamais rester actif après une déconnexion
    const activeSession = await taskModel.findActiveSessionForEmployee(req.user.id);
    if (activeSession) {
      const stopped = await taskModel.stopSession(activeSession.id);
      await taskModel.recordAudit({
        userId: req.user.id,
        action: 'AUTO_STOP_TIMELOG_LOGOUT',
        entityType: 'task',
        entityId: activeSession.task_id,
        details: { sessionId: stopped.id, duration_seconds: stopped.duration_seconds },
      });
    }

    res.status(200).json({ message: 'Déconnexion réussie' });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, me, updateProfile, uploadAvatar, getMyAvatar, logout, changePassword };
