const db = require('../config/database');
const userModel = require('../models/user.model');
const taskModel = require('../models/task.model');
const avatarModel = require('../models/avatar.model');
const mailService = require('../services/mail.service');
const { sendFileOr404 } = require('../utils/sendFile');

// Annuaire minimal, ouvert à tout utilisateur connecté (nécessaire pour démarrer une conversation)
async function listDirectory(req, res, next) {
  try {
    const users = await userModel.findActiveExcept(req.user.id);
    res.status(200).json(users);
  } catch (err) {
    next(err);
  }
}


async function getUserAvatar(req, res, next) {
  try {
    const { id } = req.params;
    const user = await userModel.findById(id);

    // L'annuaire de messagerie n'expose que les membres actifs de l'équipe.
    if (!user || user.status !== userModel.USER_STATUS.ACTIVE) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }

    const avatar = await avatarModel.findByUserId(id);
    if (!avatar) {
      return res.status(404).json({ error: 'Aucune photo de profil' });
    }

    return sendFileOr404(res, avatar.file_path, 'Aucune photo de profil');
  } catch (err) {
    next(err);
  }
}

async function listUsers(req, res, next) {
  try {
    const { status, role, search } = req.query;
    const users = await userModel.findAllFiltered({ status, role, search });
    res.status(200).json(users);
  } catch (err) {
    next(err);
  }
}

async function listPending(req, res, next) {
  try {
    const users = await userModel.findPending();
    res.status(200).json(users);
  } catch (err) {
    next(err);
  }
}

async function approveUser(req, res, next) {
  try {
    const { id } = req.params;
    const user = await userModel.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }
    if (user.status !== userModel.USER_STATUS.PENDING) {
      return res.status(400).json({ error: 'Seul un compte en attente peut être approuvé' });
    }

    await db.withTransaction(async (client) => {
      await userModel.updateStatus(id, userModel.USER_STATUS.ACTIVE, client);
      await taskModel.recordAudit(
        { userId: req.user.id, action: 'APPROVE_USER', entityType: 'user', entityId: id },
        client
      );
    });

    // Email de validation à l'employé (best-effort : n'interrompt pas la réponse).
    mailService.sendAccountApproved(user).catch(() => {});

    res.status(200).json({ status: userModel.USER_STATUS.ACTIVE });
  } catch (err) {
    next(err);
  }
}

async function rejectUser(req, res, next) {
  try {
    const { id } = req.params;
    const { motif } = req.body;

    const user = await userModel.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }
    if (user.status !== userModel.USER_STATUS.PENDING) {
      return res.status(400).json({ error: 'Seul un compte en attente peut être refusé' });
    }

    await db.withTransaction(async (client) => {
      await userModel.updateStatus(id, userModel.USER_STATUS.REJECTED, client);
      await taskModel.recordAudit(
        {
          userId: req.user.id,
          action: 'REJECT_USER',
          entityType: 'user',
          entityId: id,
          details: motif ? { motif } : null,
        },
        client
      );
    });

    // Email d'information à l'employé (best-effort).
    mailService.sendAccountRejected(user, motif).catch(() => {});

    res.status(200).json({ status: userModel.USER_STATUS.REJECTED });
  } catch (err) {
    next(err);
  }
}

async function suspendUser(req, res, next) {
  try {
    const { id } = req.params;

    if (id === req.user.id) {
      return res.status(400).json({ error: 'Vous ne pouvez pas suspendre votre propre compte' });
    }

    const user = await userModel.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }
    if (user.status !== userModel.USER_STATUS.ACTIVE) {
      return res.status(400).json({ error: 'Seul un compte actif peut être suspendu' });
    }

    await db.withTransaction(async (client) => {
      await userModel.updateStatus(id, userModel.USER_STATUS.SUSPENDED, client);
      await taskModel.recordAudit(
        { userId: req.user.id, action: 'SUSPEND_USER', entityType: 'user', entityId: id },
        client
      );
    });

    res.status(200).json({ status: userModel.USER_STATUS.SUSPENDED });
  } catch (err) {
    next(err);
  }
}

async function activateUser(req, res, next) {
  try {
    const { id } = req.params;
    const user = await userModel.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }
    if (user.status !== userModel.USER_STATUS.SUSPENDED) {
      return res.status(400).json({ error: 'Seul un compte suspendu peut être réactivé' });
    }

    await db.withTransaction(async (client) => {
      await userModel.updateStatus(id, userModel.USER_STATUS.ACTIVE, client);
      await taskModel.recordAudit(
        { userId: req.user.id, action: 'ACTIVATE_USER', entityType: 'user', entityId: id },
        client
      );
    });

    res.status(200).json({ status: userModel.USER_STATUS.ACTIVE });
  } catch (err) {
    next(err);
  }
}

async function promoteUser(req, res, next) {
  try {
    const { id } = req.params;

    if (id === req.user.id) {
      return res.status(400).json({ error: 'Vous ne pouvez pas modifier votre propre rôle' });
    }

    const user = await userModel.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }
    if (user.role !== userModel.USER_ROLE.EMPLOYEE) {
      return res.status(400).json({ error: 'Seul un employé peut être promu administrateur' });
    }

    await db.withTransaction(async (client) => {
      await userModel.promoteToAdmin(id, client);
      await taskModel.recordAudit(
        { userId: req.user.id, action: 'PROMOTE_USER', entityType: 'user', entityId: id },
        client
      );
    });

    res.status(200).json({ role: userModel.USER_ROLE.ADMIN });
  } catch (err) {
    next(err);
  }
}

async function getUserDetail(req, res, next) {
  try {
    const { id } = req.params;
    const user = await userModel.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }

    const today = new Date().toISOString().slice(0, 10);
    const [stats, tasks, recentActivity, avatar, dailySelection] = await Promise.all([
      taskModel.computeEmployeeStats(id),
      taskModel.findTasksForEmployee(id),
      taskModel.findRecentAuditForUser(id, 10),
      avatarModel.findByUserId(id),
      taskModel.findDailySelection(id, today),
    ]);

    res.status(200).json({
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        position: user.position,
        status: user.status,
        has_avatar: !!avatar,
        // Champs contact/identité pour la fiche employé (vue admin).
        role: user.role,
        username: user.username,
        phone_number: user.phone_number,
        birth_date: user.birth_date,
        postal_address: user.postal_address,
        created_at: user.created_at,
      },
      stats,
      tasks,
      // Tâches que l'employé a sélectionnées dans « Ma journée » aujourd'hui (onglet "Aujourd'hui").
      daily_task_ids: dailySelection.map((row) => row.task_id),
      recent_activity: recentActivity,
    });
  } catch (err) {
    next(err);
  }
}

// --- Notes internes admin sur un employé ---
async function listUserNotes(req, res, next) {
  try {
    const notes = await userModel.listNotes(req.params.id);
    res.status(200).json(notes);
  } catch (err) {
    next(err);
  }
}

async function createUserNote(req, res, next) {
  try {
    const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
    if (!content) return res.status(400).json({ error: 'La note ne peut pas être vide' });
    if (content.length > 2000) return res.status(400).json({ error: 'La note est trop longue (2000 caractères max)' });

    const target = await userModel.findById(req.params.id);
    if (!target) return res.status(404).json({ error: 'Utilisateur introuvable' });

    const note = await userModel.createNote(req.params.id, req.user.id, content);
    // Renvoie la note enrichie de l'auteur (l'admin courant) pour un affichage immédiat.
    res.status(201).json({ ...note, author_name: req.user.full_name || null });
  } catch (err) {
    next(err);
  }
}

async function deleteUserNote(req, res, next) {
  try {
    const removed = await userModel.deleteNote(req.params.noteId, req.params.id);
    if (!removed) return res.status(404).json({ error: 'Note introuvable' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

// --- Évaluations mensuelles -------------------------------------------------

const EVAL_MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const EVAL_RATINGS = ['good', 'bad'];
const EVAL_MAX_ITEMS = 30; // garde-fou par critère
// Champs texte libre « développement / carrière » de l'évaluation.
const EVAL_TEXT_FIELDS = [
  'forces_actuelles',
  'competences_ameliorer',
  'competences_developper',
  'objectifs_professionnels',
  'formations_recommandees',
  'nouvelles_responsabilites',
  'prochaine_etape',
];

function cleanComment(value, max) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

// Normalise une liste de remarques d'un critère : [{ rating: 'good'|'bad', comment }].
// On ignore les entrées sans note valide OU sans commentaire.
function cleanItems(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((it) => it && EVAL_RATINGS.includes(it.rating))
    .map((it) => ({ rating: it.rating, comment: cleanComment(it.comment, 2000) }))
    .filter((it) => it.comment)
    .slice(0, EVAL_MAX_ITEMS);
}

// Admin : historique complet des évaluations d'un employé.
async function listUserEvaluations(req, res, next) {
  try {
    const target = await userModel.findById(req.params.id);
    if (!target) return res.status(404).json({ error: 'Utilisateur introuvable' });
    const evaluations = await userModel.listEvaluations(req.params.id);
    res.status(200).json(evaluations);
  } catch (err) {
    next(err);
  }
}

// Admin : crée ou met à jour l'évaluation d'un mois (mois = 'YYYY-MM').
async function upsertUserEvaluation(req, res, next) {
  try {
    const { month } = req.params;
    if (!EVAL_MONTH_RE.test(month)) {
      return res.status(400).json({ error: 'Mois invalide (format attendu AAAA-MM)' });
    }
    const target = await userModel.findById(req.params.id);
    if (!target) return res.status(404).json({ error: 'Utilisateur introuvable' });

    const b = req.body || {};
    const data = {
      visible_to_employee: Boolean(b.visible_to_employee),
      global_comment: cleanComment(b.global_comment, 4000),
      delais_items: cleanItems(b.delais_items),
      qualite_items: cleanItems(b.qualite_items),
      autonomie_items: cleanItems(b.autonomie_items),
      adaptabilite_items: cleanItems(b.adaptabilite_items),
    };
    // Champs libres « développement / carrière ».
    for (const f of EVAL_TEXT_FIELDS) data[f] = cleanComment(b[f], 4000);

    const saved = await userModel.upsertEvaluation(req.params.id, month, req.user.id, data);
    res.status(200).json(saved);
  } catch (err) {
    next(err);
  }
}

// Employé : ses propres évaluations (commentaire global toujours visible ;
// détail des critères seulement si l'admin l'a rendu visible).
async function listMyEvaluations(req, res, next) {
  try {
    const evaluations = await userModel.listEvaluationsForEmployee(req.user.id);
    res.status(200).json(evaluations);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listDirectory,
  getUserAvatar,
  listUsers,
  listPending,
  approveUser,
  rejectUser,
  suspendUser,
  activateUser,
  promoteUser,
  getUserDetail,
  listUserNotes,
  createUserNote,
  deleteUserNote,
  listUserEvaluations,
  upsertUserEvaluation,
  listMyEvaluations,
};
