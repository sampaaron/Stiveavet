# 0049 — Alertes confiées à l'assistante, récapitulatif et « Bien reçu » sur WhatsApp

- Statut : accepté (28 octobre 2026), étape 3 du plan « Faire gagner du temps au vétérinaire » (suite de l'ADR 0048)
- Migration 0032 ; complète l'ADR 0017 (triage et alertes) et l'ADR 0024 (WhatsApp)

## Contexte

Le plan validé prévoit deux changements pour les alertes :

- « une urgence va directement au téléphone du vétérinaire. Un « à surveiller » est d'abord pris en charge par l'assistante, si le cabinet le permet. Le vétérinaire reçoit un récapitulatif deux fois par jour » ;
- accuser réception depuis la notification, sans ouvrir le logiciel.

Choix par défaut annoncés dans le plan : l'assistante ne prend les alertes « à surveiller » que si l'administrateur l'active, et le récapitulatif part à 12 h et à 18 h.

Le cahier des charges ne change pas. Une urgence n'est jamais confiée d'office à l'assistante, et l'assistante n'a que l'accès minimal utile, que le vétérinaire peut élargir (§11).

## Décision

1. **Droit `alerts.watch`, sur décision.**
   - Le droit « Prendre en charge les alertes « à surveiller » » n'est jamais donné d'office à une assistante. L'administrateur l'active dans Équipe et droits, avec l'accès clinique, sans lequel elle ne lit pas le dossier. Le vétérinaire administrateur l'a, comme tous les droits.
   - Il ne vaut que pour une alerte « à surveiller ». Sur une urgence, l'assistante reste en lecture : la règle est dans le service et dans la base, qui refuse de transmettre une urgence.
2. **Ce que fait l'assistante.**
   - « Je m'en occupe » enregistre son accusé de réception. Elle peut aussi clore l'alerte.
   - « Transmettre au vétérinaire » rend l'alerte au vétérinaire prévenu, une seule fois. L'alerte redevient ouverte, sans accusé de réception, et la base fige la transmission.
   - Confier l'alerte à un autre vétérinaire reste une décision de vétérinaire.
   - Chaque geste est journalisé (`alert.acknowledged`, `alert.forwarded`, `alert.resolved`), sans contenu.
3. **Ce que voit le vétérinaire.**
   - Une alerte « à surveiller » que l'équipe a d'abord en main quitte sa boîte « À traiter ». Cela vaut quand une assistante autorisée lit le dossier et que l'alerte n'a été ni transmise, ni reçue par un vétérinaire.
   - Une ligne le dit (« 1 alerte « à surveiller » est prise en charge par l'équipe »), avec un lien vers la page Alertes. L'alerte y reste visible, avec son état.
   - Sans assistante autorisée, rien ne change.
4. **Récapitulatif à 12 h et à 18 h (heure de Paris).**
   - Le premier passage du worker dans le créneau (12 h à 15 h, 18 h à 21 h) inscrit une tâche `alert.recap` par cabinet, une fois par jour et par créneau (`jobs.plan_alert_recaps`). Un créneau manqué n'est pas rattrapé la nuit.
   - Cette tâche inscrit un e-mail par vétérinaire actif (`alert.recap_mail`). Un envoi qui échoue ne renvoie donc pas les autres.
   - L'e-mail compte, sur les dossiers que chacun lit en clinique : les urgences en cours, les alertes « à surveiller » pour lui, celles que l'équipe a en main et celles que l'équipe a closes depuis le point précédent. Il donne un lien vers la page Alertes.
   - Il ne contient ni animal, ni message, ni numéro. Quand il n'y a rien à signaler, aucun e-mail ne part. Comme les autres e-mails d'équipe, il est en français.
5. **« Bien reçu » sous l'alerte WhatsApp.**
   - Les modèles `alerte_urgente` et `alerte_escalade` portent un bouton de réponse rapide « Bien reçu » (« Got it »). Le catalogue passe en version `modeles-v2`, à soumettre de nouveau à Meta.
   - Chaque envoi joint au bouton un jeton propre à sa livraison : `ack:<livraison>:<HMAC>`, signé avec la clé des empreintes (`FINGERPRINT_SECRET`, ADR 0039) et impossible à deviner.
   - Le webhook, déjà authentifié par la signature de Meta, ne traite le bouton que dans ce cas :
     - le jeton est valide ;
     - il vient du numéro d'alerte du vétérinaire qui a reçu cette livraison ;
     - la livraison date de moins de 24 heures ;
     - l'alerte n'est encore ni reçue ni close ;
     - ce vétérinaire lit le dossier en clinique.
   - Il accuse alors réception au nom de ce vétérinaire, comme dans Stivea Vet : l'escalade est annulée et le journal note `via: "whatsapp"`.
   - Un jeton rejoué ne fait plus rien. Un bouton touché ailleurs est ignoré et n'est jamais lu comme un message de propriétaire.
6. **« Rappeler le propriétaire » n'est pas un bouton.** Le numéro du propriétaire ne sort pas de Stivea Vet. Le vétérinaire le retrouve dans le dossier, qu'il ouvre depuis l'alerte ou le récapitulatif.

## Conséquences

- Les signes « à surveiller » du quotidien ne coupent plus le vétérinaire quand une assistante formée s'en charge. Il garde la main par le récapitulatif et la page Alertes.
- Une urgence s'arrête d'un geste depuis le téléphone, sans se connecter. Rien d'autre ne change pour elle : WhatsApp immédiat, puis escalade à l'heure réglée.
- À faire avant le premier vrai cabinet :
  - faire approuver par Meta les deux modèles modifiés (`pnpm whatsapp:modeles`) ;
  - faire relire par le juriste et par un vétérinaire le rôle de l'assistante sur les alertes « à surveiller » (cahier des charges §19).
