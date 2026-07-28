const fs = require('fs');
const bcrypt = require('bcrypt');
const userModel = require('../models/user.model');
const taskModel = require('../models/task.model');
const avatarModel = require('../models/avatar.model');
const sessionModel = require('../models/session.model');
const realtime = require('../realtime/io');
const { generateToken } = require('../utils/jwt.util');
const { isValidPassword } = require('../utils/validators');
const { AUTH_COOKIE, authCookieOptions } = require('../utils/cookies');
const env = require('../config/env');

const SALT_ROUNDS = 10;

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
      return res.status(409).json({ error: 'An account already exists with this email' });
    }
    const existingUsername = await userModel.findByUsername(normalizedUsername);
    if (existingUsername) {
      return res.status(409).json({ error: 'This username is already taken' });
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
      message: 'Registration submitted, awaiting admin approval',
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
      return res.status(401).json({ error: 'Incorrect email or password' });
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Incorrect email or password' });
    }

    if (user.status === userModel.USER_STATUS.PENDING) {
      return res.status(403).json({ error: 'Account awaiting approval by an administrator' });
    }
    if (user.status === userModel.USER_STATUS.SUSPENDED) {
      return res.status(403).json({ error: 'Account suspended' });
    }
    if (user.status === userModel.USER_STATUS.REJECTED) {
      return res.status(403).json({ error: 'Account rejected' });
    }

    // La sélection de la journée est faite UNE SEULE FOIS par jour : elle persiste toute la
    // journée. Se reconnecter le même jour ne la remet plus à zéro (l'employé retrouve sa
    // sélection déjà validée). Le lendemain, une nouvelle date = nouvelle sélection.

    const token = generateToken(user);

    // Chrono de connexion (présence) : indépendant du chrono de tâche, jamais visible
    // à l'employé autrement que comme une plage colorée sur son planning de la semaine.
    await sessionModel.startSession(user.id);
    // Nouvelle présence (arrivée) → rafraîchit le dashboard temps réel des admins.
    realtime.broadcast('presence:update', {});

    // Le navigateur reçoit le token dans un cookie httpOnly (invisible au JS → anti-XSS).
    // Le token reste aussi dans le corps pour les clients non-navigateur (tests, API).
    res.cookie(AUTH_COOKIE, token, authCookieOptions(env.nodeEnv));

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
      return res.status(404).json({ error: 'User not found' });
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
      description: user.description,
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
      position,
      email,
      description,
    } = req.body;

    // Email modifiable : refuser s'il est déjà utilisé par un autre compte.
    if (email && (await userModel.emailTakenByOther(email, req.user.id))) {
      return res.status(409).json({ error: 'An account already exists with this email' });
    }

    // Champs non fournis : on conserve la valeur actuelle (pas d'écrasement involontaire).
    const current = await userModel.findById(req.user.id);
    const updated = await userModel.updateProfile(req.user.id, {
      firstName,
      lastName,
      phone,
      postalAddress,
      birthDate,
      position: position !== undefined ? position : current.position,
      email: email !== undefined ? email : current.email,
      description: description !== undefined ? description : current.description,
    });

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
      description: updated.description,
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
      return res.status(400).json({ error: 'Image required' });
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
      return res.status(404).json({ error: 'No profile photo' });
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
      return res.status(400).json({ error: 'The new password must be at least 8 characters long' });
    }

    const user = await userModel.findById(req.user.id);
    const passwordMatches = await bcrypt.compare(currentPassword || '', user.password_hash);
    if (!passwordMatches) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await userModel.updatePasswordHash(user.id, passwordHash);

    res.status(200).json({ message: 'Password updated' });
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

    // Ferme aussi le chrono de connexion (présence), indépendant du chrono de tâche ci-dessus.
    await sessionModel.closeOpenSessions(req.user.id);

    // Supprime le cookie d'authentification côté navigateur.
    res.clearCookie(AUTH_COOKIE, { ...authCookieOptions(env.nodeEnv), maxAge: undefined });

    res.status(200).json({ message: 'Successfully logged out' });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, me, updateProfile, uploadAvatar, getMyAvatar, logout, changePassword };
