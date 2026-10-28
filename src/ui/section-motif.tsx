import type { Section } from "./sections";

const range = (count: number) => Array.from({ length: count }, (_, i) => i);

/** Motif propre à chaque rubrique : lignes fines, très atténuées. */
export function SectionMotif({ section }: { section: Section }) {
  switch (section) {
    case "today":
      // Lever de soleil : arcs concentriques depuis l'angle.
      return (
        <g strokeWidth="1">
          {range(7).map((i) => (
            <circle
              key={i}
              cx="600"
              cy="-10"
              r={60 + i * 46}
              opacity={1 - i * 0.12}
            />
          ))}
          <circle
            cx="600"
            cy="-10"
            r="44"
            fill="currentColor"
            stroke="none"
            opacity="0.08"
          />
        </g>
      );
    case "followups":
      // Fil des conversations : ondes parallèles.
      return (
        <g strokeWidth="1.1">
          {range(9).map((i) => (
            <path
              key={i}
              d={`M120 ${60 + i * 26} C 240 ${20 + i * 26}, 360 ${110 + i * 26}, 480 ${60 + i * 26} S 620 ${20 + i * 26}, 700 ${70 + i * 26}`}
              opacity={0.9 - i * 0.08}
            />
          ))}
        </g>
      );
    case "patients":
      // Registre : bulles de tailles variées, comme des pastilles d'animaux.
      return (
        <g strokeWidth="1">
          {[
            [520, 70, 54],
            [430, 40, 22],
            [600, 170, 34],
            [470, 160, 14],
            [360, 90, 30],
            [560, 250, 18],
            [300, 30, 10],
            [400, 230, 40],
            [250, 120, 16],
          ].map(([cx, cy, r]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />
          ))}
          <circle
            cx="520"
            cy="70"
            r="40"
            fill="currentColor"
            stroke="none"
            opacity="0.07"
          />
        </g>
      );
    case "alerts":
      // Triage : ondes qui partent d'un point.
      return (
        <g strokeWidth="1.1">
          {range(8).map((i) => (
            <circle
              key={i}
              cx="520"
              cy="90"
              r={18 + i * 34}
              opacity={1 - i * 0.11}
            />
          ))}
          <circle
            cx="520"
            cy="90"
            r="7"
            fill="currentColor"
            stroke="none"
            opacity="0.5"
          />
        </g>
      );
    case "agenda":
      // Le temps : règle graduée et repère de l'heure.
      return (
        <g>
          {range(34).map((i) => (
            <line
              key={i}
              x1={200 + i * 13}
              x2={200 + i * 13}
              y1="40"
              y2={i % 4 === 0 ? 120 : 76}
              strokeWidth={i % 4 === 0 ? 1.4 : 0.8}
            />
          ))}
          <line x1="180" x2="660" y1="40" y2="40" strokeWidth="1" />
          <line
            x1="461"
            x2="461"
            y1="20"
            y2="300"
            strokeWidth="1.6"
            opacity="0.6"
          />
          <circle
            cx="461"
            cy="20"
            r="5"
            fill="currentColor"
            stroke="none"
            opacity="0.6"
          />
        </g>
      );
    case "assistants":
      // Assistants IA : orbites autour d'un noyau.
      return (
        <g strokeWidth="1">
          {[0, 60, 120].map((angle) => (
            <ellipse
              key={angle}
              cx="500"
              cy="120"
              rx="170"
              ry="56"
              transform={`rotate(${angle - 15} 500 120)`}
            />
          ))}
          <circle
            cx="500"
            cy="120"
            r="26"
            fill="currentColor"
            stroke="none"
            opacity="0.12"
          />
          <circle
            cx="650"
            cy="90"
            r="5"
            fill="currentColor"
            stroke="none"
            opacity="0.5"
          />
          <circle
            cx="380"
            cy="210"
            r="4"
            fill="currentColor"
            stroke="none"
            opacity="0.5"
          />
        </g>
      );
    case "protocols":
      // Bibliothèque : page réglée avec sa marge.
      return (
        <g strokeWidth="0.9">
          {range(11).map((i) => (
            <line
              key={i}
              x1="260"
              x2="660"
              y1={30 + i * 24}
              y2={30 + i * 24}
              opacity={1 - i * 0.07}
            />
          ))}
          <line
            x1="320"
            x2="320"
            y1="0"
            y2="320"
            strokeWidth="1.3"
            opacity="0.7"
          />
        </g>
      );
    case "team":
      // Équipe : cercles qui se chevauchent.
      return (
        <g strokeWidth="1.1">
          {range(5).map((i) => (
            <circle
              key={i}
              cx={330 + i * 70}
              cy={90 + (i % 2) * 40}
              r="64"
              opacity={0.95 - i * 0.1}
            />
          ))}
        </g>
      );
    case "billing":
      // Facturation : rayures fines et reflet d'une carte.
      return (
        <g strokeWidth="0.9">
          {range(26).map((i) => (
            <line
              key={i}
              x1={260 + i * 18}
              y1="0"
              x2={180 + i * 18}
              y2="320"
              opacity="0.7"
            />
          ))}
          {range(4).map((i) => (
            <circle
              key={`c${i}`}
              cx="560"
              cy="80"
              r={30 + i * 22}
              strokeWidth="1.2"
            />
          ))}
        </g>
      );
    case "tasks":
      // Tâches : liste de cases et de traits.
      return (
        <g strokeWidth="1.1">
          {range(7).map((i) => (
            <g key={i} opacity={1 - i * 0.12}>
              <rect x="380" y={30 + i * 38} width="16" height="16" rx="4" />
              <line
                x1="412"
                x2={540 + (i % 3) * 30}
                y1={38 + i * 38}
                y2={38 + i * 38}
              />
            </g>
          ))}
        </g>
      );
    case "journal":
      // Journal : ligne du temps et ses jalons.
      return (
        <g strokeWidth="1.1">
          <line x1="470" x2="470" y1="0" y2="320" />
          {range(7).map((i) => (
            <g key={i} opacity={1 - i * 0.1}>
              <circle
                cx="470"
                cy={26 + i * 44}
                r="6"
                fill="currentColor"
                stroke="none"
                opacity="0.4"
              />
              <line
                x1="486"
                x2={560 + (i % 2) * 50}
                y1={26 + i * 44}
                y2={26 + i * 44}
              />
            </g>
          ))}
        </g>
      );
    default:
      // Aide et démarrage : chemin pointillé, étape par étape.
      return (
        <g strokeWidth="1.4">
          <path
            d="M240 260 C 320 140, 420 260, 500 140 S 600 40, 660 60"
            strokeDasharray="2 10"
            strokeLinecap="round"
          />
          {[
            [240, 260],
            [370, 196],
            [500, 140],
            [620, 52],
          ].map(([cx, cy]) => (
            <circle key={cx} cx={cx} cy={cy} r="8" />
          ))}
        </g>
      );
  }
}
