/**
 * Génère `mots-de-passe-courants.ts` (ADR 0039), de façon déterministe :
 *   pnpm tsx src/domains/auth/mots-de-passe-courants.generer.mts <10k-most-common.txt> <100k-most-used-passwords-NCSC.txt>
 *
 * Sources :
 * - SecLists (Daniel Miessler, licence MIT), `Passwords/Common-Credentials/10k-most-common.txt`
 *   en entier et les 20 000 premières lignes de `100k-most-used-passwords-NCSC.txt` (liste du
 *   NCSC britannique, tirée de Have I Been Pwned), classées par fréquence ;
 * - les listes françaises ci-dessous, écrites pour Stivea Vet : prénoms, mots, villes, clubs,
 *   noms d'animaux, vocabulaire du métier, et leurs combinaisons les plus fréquentes
 *   (« jetaime », « mon », « ma » + prénom ou animal).
 * Chaque entrée est réduite à sa racine (`passwordRoot`), dédoublonnée puis triée.
 */
import { readFileSync, writeFileSync } from "node:fs";

import { passwordRoot } from "./common-passwords";

const [tenThousand, ncsc] = process.argv.slice(2);
if (!tenThousand || !ncsc) {
  console.error(
    "Usage : <10k-most-common.txt> <100k-most-used-passwords-NCSC.txt>",
  );
  process.exit(1);
}

const lines = (path: string) =>
  readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean);
const words = (text: string) => text.split(/\s+/).filter(Boolean);

const PRENOMS = words(`
  adam adele adrien agathe agnes alain albert alexandra alexandre alexis alice alicia aline
  amandine amelie anais andre andrea angelique anne annie antoine antonin apolline arnaud
  arthur audrey aurelie aurelien axel baptiste bastien benjamin benoit bernard brigitte bruno
  camille capucine carla caroline catherine cecile celine chantal charles charlotte chloe
  christian christine christophe claire clara claude clement clemence colette corentin
  cyril damien daniel david delphine denis diane didier dominique dylan eden edouard eliane
  elisa elise elodie eloise emilie emma enzo eric estelle ethan etienne eva evan fabien
  fabienne fabrice florence florian francis francoise franck frederic gabriel gabrielle
  gael gaelle gerard gilles guillaume helene henri hugo ines isabelle jacqueline jacques
  jade jean jeanne jeremy jerome joel johan jonathan jordan joseph josiane jules julia julie
  julien juliette justine karine kevin laetitia laura laurence laurent lea lea leo leon
  leonie lina lisa loic lola lou louis louise luc lucas lucie lucile ludovic lukas manon
  marc marcel margaux margot marie marina marine marion martin martine mathilde mathis
  mathieu matteo maud maxence maxime melanie melissa michel michele mickael mila monique
  morgane muriel nadine nathalie nathan nicolas nina noah noemie oceane olivier oscar pascal
  pascale patrice patricia patrick paul pauline philippe pierre quentin raphael regis remi
  renaud robert romain rose sabine sacha samuel sandrine sarah sebastien serge simon sophie
  stephane stephanie sylvain sylvie theo thibault thierry thomas timothee tom valentin
  valerie vanessa victor vincent virginie xavier yann yannick yves zoe
`);

const MOTS = words(`
  amour amoureux amitie ange angel bebe bisou bisous bonheur bonjour bonsoir bebou
  biquette boubou bouboule cherie cheri chouchou chouquette cocinelle coccinelle coucou
  copain copine coeur doudou douceur famille fleur fleurs liberte lapin loulou loulotte
  maman papa mamie papy papi mamour mimi minou minette nounours nounou poupee poussin
  princesse prince puce reine roi soleil etoile lune ciel mer plage vacances voyage
  musique chanson danse cinema football rugby tennis basket velo moto voiture camion
  chocolat bonbon gateau fraise framboise cerise pomme banane citron vanille caramel
  noisette pistache biscuit croissant baguette fromage pizza sushi
  bienvenue salut merci motdepasse motdepass mdp secret code acces accueil connexion
  utilisateur administrateur admin ordinateur internet travail bureau maison jardin
  printemps ete automne hiver noel paques janvier fevrier mars avril mai juin juillet
  aout septembre octobre novembre decembre lundi mardi mercredi jeudi vendredi samedi
  dimanche france paris bretagne normandie provence alsace corse savoie
  jetaime toujours jamais demain hier aujourdhui
`);

const VILLES = words(`
  paris marseille lyon toulouse nice nantes montpellier strasbourg bordeaux lille rennes
  reims toulon grenoble dijon angers nimes villeurbanne clermont lemans aix brest tours
  amiens limoges annecy perpignan metz besancon orleans rouen mulhouse caen nancy avignon
  poitiers pau calais cannes antibes ajaccio bastia lorient vannes quimper larochelle
  bayonne biarritz chambery valence troyes niort colmar lourdes
`);

const CLUBS = words(`
  om psg ol asse losc ogcnice fcnantes girondins staderennais rclens asmonaco tfc mhsc
  olympique olympiquedemarseille parissaintgermain allezlom allezparis realmadrid barcelone
  barca juventus liverpool chelsea arsenal manchester bayern messi ronaldo mbappe zidane
  griezmann neymar benzema platini
`);

const ANIMAUX = words(`
  chien chienne chiot chat chatte chaton lapin hamster cochon cheval poney oiseau perroquet
  tortue poisson furet souris rat cobaye canari
  rex medor milou pollux felix minou minouche tigrou titi grisou caramel filou oscar
  simba nala kiwi pepette pupuce choupette biscotte noisette moka praline pirate
  rocky max bella luna lucky snoopy scooby idefix garfield tom jerry pluto rantanplan
  belle sultan voyou kiki gribouille pompon ronron mistigri plume vanille
`);

const METIER = words(`
  veterinaire veterinaires veto vetos clinique cliniqueveterinaire cabinet cabinetveterinaire
  soins sante animal animaux consultation chirurgie vaccin vaccination ordonnance urgence
  urgences docteur toubib infirmier infirmiere asv assistante assistant secretaire
  accueil stivea stiveavet strivea striveavet numa stive tilleuls
`);

const CLAVIER = words(`
  azerty azertyuiop azertyu azertyui qsdfgh qsdfghjk qsdfghjklm wxcvbn wxcvbnmazerty
  azertyqsdfgh azertyqsdf aqwzsx aqwzsxedc aqwzsxedcrfv azeqsdwxc qwerty qwertyuiop
  asdfgh asdfghjkl zxcvbn zxcvbnm qazwsx qazwsxedc qwertz 1q2w3e4r 1q2w3e4r5t 1qaz2wsx
  zaq12wsx a1z2e3r4 a1z2e3r4t5 azerty123 qwerty123 abc123 abcdef abcdefgh
`);

// Ancienne liste embarquée (avant l'ADR 0039), gardée en entier.
const HISTORIQUE = words(`
  123456789 1234567890 12345678910 0123456789 987654321 password passw0rd mot2passe
  jesus olympique marseille13 dragon monkey letmein welcome iloveyou administrator root user
  login changeme default master superman batman sunshine shadow michael jennifer charlie
  baseball trustno1 starwars whatever freedom computer aaaaaa
`);

const compounds = [...PRENOMS, ...ANIMAUX].flatMap((name) => [
  `jetaime${name}`,
  `mon${name}`,
  `ma${name}`,
  `${name}jetaime`,
  `ilove${name}`,
  `${name}${name}`,
]);

const sources = [
  ...lines(tenThousand),
  ...lines(ncsc).slice(0, 20_000),
  ...PRENOMS,
  ...MOTS,
  ...VILLES,
  ...CLUBS,
  ...ANIMAUX,
  ...METIER,
  ...CLAVIER,
  ...HISTORIQUE,
  ...compounds,
];

// Entrées sûres dans un gabarit de texte : ni accent grave, ni barre oblique inverse.
const roots = [
  ...new Set(
    sources.map(passwordRoot).filter((root) => /^[^`\\$]+$/u.test(root)),
  ),
].sort();

writeFileSync(
  new URL("./mots-de-passe-courants.ts", import.meta.url),
  `/**
 * Mots de passe courants sous forme de racine (\`passwordRoot\`), une par ligne : ${roots.length} entrées.
 * Fichier généré par \`mots-de-passe-courants.generer.mts\` (sources et licence dans son en-tête) :
 * ne pas modifier à la main.
 */
export const COMMON_PASSWORDS = \`
${roots.join("\n")}
\`;
`,
);
console.warn(`${roots.length} racines écrites.`);
