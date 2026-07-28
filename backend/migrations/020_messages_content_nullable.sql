-- messages.content doit être NULLABLE : un message peut ne contenir QU'UNE pièce jointe
-- (message vocal, image seule, fichier…) sans texte. En prod, la colonne était restée NOT NULL
-- (l'ALTER de src/db/migrations/013_messaging_features.sql n'a jamais été appliqué car ce dossier
-- n'est pas scanné par le runner) → l'envoi d'un message sans texte échouait en erreur 500.
-- Idempotent : DROP NOT NULL est sans effet si la colonne est déjà nullable (ex. en dev).

ALTER TABLE messages ALTER COLUMN content DROP NOT NULL;
