# 0051 — Accord WhatsApp du propriétaire par QR code à l'accueil

- Statut : accepté (28 octobre 2026), dernier point du plan « Faire gagner du temps au vétérinaire » (suite de l'ADR 0050)
- Migration 0034 ; complète l'ADR 0024 (WhatsApp réel) et l'ADR 0047 (accord noté depuis « Prêts à lancer »)

## Contexte

Le plan validé prévoit : « le propriétaire donne son accord WhatsApp à l'accueil, sur un QR code. La case disparaît de la fiche du vétérinaire ».

WhatsApp interdit d'écrire à quelqu'un qui ne l'a pas accepté (migration 0017). Jusqu'ici, un membre de l'équipe cochait cet accord à la place du propriétaire, dans la fiche de lancement ou depuis « Prêts à lancer ». Ce clic coûte du temps et ne prouve ni l'accord ni le numéro.

## Décision

1. **Un écran tourné vers le propriétaire.**
   - La page `/app/suivis/[id]/accord` s'ouvre depuis « Prêts à lancer » (« QR code d'accord ») ou depuis la fiche de lancement.
   - Elle est réservée à qui peut préparer ce brouillon (`followups.launch`, `clinical.read`, mêmes règles que la fiche). Elle n'existe pas pour un suivi test, et un suivi déjà lancé renvoie à son dossier.
   - Elle dit au propriétaire ce qu'il accepte. Le cabinet lui écrira sur WhatsApp pour ce suivi. Numa, l'assistante IA, lui posera des questions et ne remplace pas le vétérinaire. L'équipe lit ses réponses, et STOP arrête tout.
   - Elle montre un QR code par propriétaire actif encore sans accord, avec son numéro masqué.
2. **Le QR code ouvre WhatsApp avec un message prêt.**
   - Le QR code est un lien `wa.me` vers le numéro public du cabinet. Le message prêt dit l'accord dans la langue du propriétaire et porte un code à usage unique (`ACCORD-` et 8 caractères sans 0, O, 1, I ni L).
   - Le code vaut une heure et sert une seule fois. Un nouveau QR code remplace le précédent.
   - La base garde l'empreinte à clé du code (HMAC, `FINGERPRINT_SECRET`), son échéance et le membre qui l'a montré, jamais le code lui-même.
   - L'image est produite sur le serveur (`qrcode`, en SVG) : rien n'est chargé ailleurs.
3. **Le message reçu note l'accord.**
   - Le webhook lit le code dans un message texte avant tout autre traitement.
   - L'accord est noté seulement si toutes ces conditions sont réunies :
     - le code est en cours et appartient à ce cabinet ;
     - le suivi est encore un brouillon, hors suivi test ;
     - le message vient du numéro noté dans la fiche pour ce contact.
   - Le numéro qui envoie est ainsi vérifié du même coup. Un identifiant WhatsApp sans numéro ne suffit pas.
   - L'accord est attribué au membre qui a montré le QR code. Le journal garde `followup.whatsapp_optin_qr`, sans contenu.
   - Rien du message n'est gardé et rien n'est répondu : aucun suivi n'est encore en cours.
   - Sinon (autre numéro, code échu, remplacé ou déjà servi, autre cabinet), le message est ignoré.
4. **L'écran suit l'arrivée de l'accord.**
   - Il relit l'accord toutes les trois secondes. Chaque propriétaire passe à « Accord reçu », puis l'écran propose la fiche de lancement, où la case a disparu.
   - Un QR code échu se remplace d'un clic.
5. **Numéro public du cabinet.**
   - Il est enregistré au branchement de WhatsApp (`whatsapp_accounts.display_phone`, E.164).
   - Un cabinet relié avant cette migration doit refaire le branchement pour afficher le QR code. En attendant, l'écran le dit et l'accord se note encore à la main.
6. **WhatsApp simulé.**
   - Le QR code ne contient que le texte du message, sans numéro : il n'ouvre aucune conversation.
   - Un bouton « Simuler l'envoi depuis le téléphone » suit le même chemin que le webhook, avec le numéro de la fiche. Il est refusé quand WhatsApp est réel.

## Conséquences

- L'accueil n'a plus rien à cocher, et l'accord vient du propriétaire lui-même, depuis son téléphone.
- La case de la fiche et « Noter l'accord du propriétaire » restent pour l'accord donné de vive voix (propriétaire sans téléphone sous la main). Elles disparaissent dès que l'accord est reçu.
- L'accord clinique demandé par Numa au début du suivi ne change pas. Le message d'accord n'étant pas gardé, il n'ouvre pas la fenêtre de 24 h : le premier message de Numa suit les règles habituelles (ADR 0024).
