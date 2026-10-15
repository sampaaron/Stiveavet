# 0025 — Photos et vocaux reçus par WhatsApp

- Statut : accepté (8 octobre 2026)

## Contexte

Phase 3, lot 22. Depuis le lot 16 (ADR 0019), les photos et vocaux passent par le stockage privé, avec le type lu dans le fichier, une taille bornée, la transcription des vocaux et l'analyse photo désactivée par défaut. Seul le simulateur du propriétaire pouvait en envoyer. Avec le vrai WhatsApp (ADR 0024), le webhook de Meta n'apporte qu'un identifiant de média : le fichier se télécharge ensuite chez Meta, avec le jeton du cabinet, pendant 30 jours au plus.

## Décision

1. **Le webhook ne télécharge rien.** Il enregistre le message du propriétaire (avec la légende éventuelle, ce qui rouvre la fenêtre de 24 h) et inscrit une tâche `whatsapp.media`. La tâche ne porte que des identifiants : message, média chez Meta, photo ou vocal. Le webhook répond donc vite et un rejeu ne crée ni second message ni second téléchargement.
2. **Téléchargement contrôlé** (`downloadMedia` du connecteur) :
   - l'adresse du fichier est demandée à Meta, puis le fichier est lu avec le même jeton ;
   - seuls les hôtes de Meta (`*.fbsbx.com`, `*.whatsapp.net`) en HTTPS sont acceptés, et aucune redirection n'est suivie : le jeton ne part nulle part ailleurs ;
   - la limite (photo 5 Mo, vocal 16 Mo) est vérifiée sur la taille annoncée, sur l'en-tête de la réponse, puis pendant la lecture : un fichier trop lourd n'est jamais lu en entier ;
   - l'empreinte SHA-256 annoncée par Meta est comparée au contenu.
3. **Même suite que le simulateur** : le type est relu dans les premiers octets (ni SVG ni HTML), le fichier va dans le stockage privé, puis l'accusé de réception de Numa et l'analyse si elle est activée (photo), ou la transcription puis le triage (vocal), comme le prévoit l'ADR 0019.
4. **Fichier refusé** (trop lourd, type non lu, vidéo ou document, expiré chez Meta, contenu altéré, ou Meta injoignable jusqu'à l'abandon de la tâche) :
   - le journal garde le type et le motif, jamais le contenu ;
   - la conversation garde une trace pour l'équipe, avec le prénom du propriétaire ;
   - Numa répond par un message fixe : le fichier n'a pas pu être reçu, le renvoyer ou décrire la situation, et appeler le cabinet en cas d'urgence. La légende éventuelle est triée comme un message écrit ;
   - rien n'est déposé dans le stockage.
5. **Échecs** : Meta indisponible, la tâche réessaie ; compte à reconnecter, elle passe en échec tout de suite. Une fois abandonnée, le fichier est refusé comme ci-dessus.

## Conséquences

- Tests unitaires du connecteur contre l'imitation de Meta : téléchargement, empreinte (hexadécimale ou base64), taille annoncée ou réelle trop grande, contenu altéré, média expiré, jeton refusé, adresse hors de Meta jamais appelée.
- Tests d'intégration : photo téléchargée, déposée et accusée ; vocal transcrit ; webhook rejoué sans doublon ; tâche sans contenu ; refus tracés sans contenu, avec la trace pour l'équipe et le message de Numa ; abandon après déconnexion du compte.
- La transcription reste simulée jusqu'au lot 23 (passerelle IA réelle).
- En staging, le stockage objet sera celui de Scaleway à Paris (lot 26) ; rien ne change ici.
