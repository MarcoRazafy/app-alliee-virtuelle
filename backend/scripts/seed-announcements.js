#!/usr/bin/env node
/*
 * Insère quelques annonces de démonstration (avec images externes) pour tester la page Annonces.
 * Usage : node scripts/seed-announcements.js
 * Les images viennent de picsum.photos (URL internet, autorisées par la CSP `img-src https:`).
 */
const db = require('../src/config/database');

const ANNOUNCEMENTS = [
  {
    title: 'Maintenance prévue du système',
    body:
      "Une maintenance est prévue ce samedi de 22h à 02h. Certaines fonctionnalités pourraient être indisponibles pendant cette période. Merci de votre compréhension.",
    image_url: 'https://picsum.photos/seed/maintenance-systeme/800/400',
    is_important: true,
    is_pinned: true,
  },
  {
    title: "Réunion d'équipe vendredi",
    body:
      "Notre réunion hebdomadaire aura lieu vendredi à 10h en salle B. Merci d'arriver 5 minutes en avance et de préparer vos points.",
    image_url: 'https://picsum.photos/seed/reunion-equipe/800/400',
  },
  {
    title: 'Nouvelle politique RH',
    body:
      "La nouvelle politique de télétravail est maintenant disponible. Veuillez en prendre connaissance et nous faire part de vos questions.",
    image_url: 'https://picsum.photos/seed/politique-rh/800/400',
    is_important: true,
  },
  {
    title: 'Mise à jour du planning',
    body:
      "Le planning du mois a été mis à jour. Consultez-le dans la section Planning pour vérifier vos disponibilités et signaler tout conflit.",
    image_url: 'https://picsum.photos/seed/planning-mois/800/400',
  },
];

async function main() {
  const admin = (
    await db.query("SELECT id, full_name FROM users WHERE role = 'ADMIN' ORDER BY created_at ASC LIMIT 1")
  ).rows[0];
  if (!admin) {
    console.error('❌ Aucun administrateur trouvé — impossible de seeder.');
    process.exit(1);
  }

  // Contrainte : une seule annonce épinglée. On dépingle tout avant d'insérer la nouvelle.
  await db.query('UPDATE announcements SET is_pinned = false WHERE is_pinned = true');

  let inserted = 0;
  for (const a of ANNOUNCEMENTS) {
    await db.query(
      `INSERT INTO announcements (author_id, title, body, is_important, is_pinned, image_url, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, now() - ($7::int * interval '1 minute'))`,
      [admin.id, a.title, a.body, a.is_important || false, a.is_pinned || false, a.image_url || null, inserted * 37]
    );
    inserted += 1;
  }

  console.log(`✅ ${inserted} annonces de test insérées (auteur : ${admin.full_name}).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
