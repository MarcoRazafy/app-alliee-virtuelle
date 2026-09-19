-- Coupure des 8 h de connexion déjà faite, par employé et par journée de travail.
--
-- La coupure a lieu UNE fois par journée : l'employé est déconnecté avec un message, puis
-- peut se reconnecter et continuer. Sans cette trace, il resterait au-dessus de la limite en
-- se reconnectant, et le heartbeat suivant (20 s plus tard) le déconnecterait de nouveau.
-- La clé primaire garantit aussi qu'une seule requête déclenche la coupure quand plusieurs
-- onglets envoient leur heartbeat au même moment.
CREATE TABLE IF NOT EXISTS connection_limit_hits (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_day date NOT NULL,
  hit_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (user_id, business_day)
);
