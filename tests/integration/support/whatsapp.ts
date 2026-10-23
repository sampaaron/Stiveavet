import type { AiGateway } from "@/adapters/ai-gateway/types";
import { fakeWhatsApp } from "@/adapters/whatsapp/fake";
import { WhatsAppSendError } from "@/adapters/whatsapp/types";
import type { WhatsAppConnector } from "@/adapters/whatsapp/types";
import { conversationHandlers } from "@/domains/conversations/service";
import { createWorker } from "@/domains/taches/worker";
import type {
  AnyJobHandler,
  ClaimedJob,
  DeadJobHandler,
  StagedJobHandler,
} from "@/domains/taches/worker";
import { alertHandlers } from "@/domains/urgences/service";
import { simulatedProvider } from "@/domains/whatsapp/connexion";
import type { WhatsAppProvider } from "@/domains/whatsapp/connexion";
import { sendHandlers } from "@/domains/whatsapp/envoi";
import { fillTemplate } from "@/domains/whatsapp/modeles";
import type { TemplateKey } from "@/domains/whatsapp/modeles";
import { withTenant } from "@/server/db/tenant";
import type { Database } from "@/server/db/tenant";

/** Un envoi vu par le propriétaire : destinataire (numéro, ou « groupe ») et texte lu. */
export type Sent = {
  to: string;
  body: string;
  /** Identifiant du message ou de la livraison d'alerte. */
  reference: string;
  template: TemplateKey | null;
  at: Date;
};

/**
 * WhatsApp simulé pour les tests : garde chaque envoi et chaque opération de groupe, et peut
 * tomber en panne à la demande (`failNext`). Sans groupes, il se comporte comme l'API de Meta.
 */
export function recordingWhatsApp(options: { groups?: boolean } = {}) {
  const sent: Sent[] = [];
  /** Opérations de groupe : `create:<numéros triés>`, `remove:<numéro>`, `close`. */
  const groupCalls: string[] = [];
  let failures = 0;
  const connector: WhatsAppConnector = {
    simulated: true,
    groups: options.groups ?? true,
    async send(input) {
      if (failures > 0) {
        failures -= 1;
        throw new WhatsAppSendError("retry", "test");
      }
      const { to, content, reference } = input;
      sent.push({
        to: to.kind === "phone" ? to.phone : "groupe",
        body:
          content.kind === "text"
            ? content.body
            : fillTemplate(content.key, content.language, content.params),
        reference,
        template: content.kind === "template" ? content.key : null,
        at: new Date(),
      });
      return fakeWhatsApp.send(input);
    },
    async createGroup(input) {
      groupCalls.push(`create:${[...input.members].sort().join(",")}`);
      return fakeWhatsApp.createGroup(input);
    },
    async removeFromGroup(input) {
      groupCalls.push(`remove:${input.member}`);
    },
    async closeGroup() {
      groupCalls.push("close");
    },
    downloadMedia: fakeWhatsApp.downloadMedia,
  };
  return {
    connector,
    provider: simulatedProvider(connector),
    sent,
    groupCalls,
    /** Les `count` prochains envois échouent (prestataire indisponible). */
    failNext(count = 1) {
      failures += count;
    },
  };
}

/** Exécutants limités à un cabinet : la base est partagée entre fichiers de test. */
function onlyFor(
  organizationId: () => string,
  handlers: Record<string, AnyJobHandler>,
): Record<string, AnyJobHandler> {
  const mine = (job: ClaimedJob) => job.organizationId === organizationId();
  return Object.fromEntries(
    Object.entries(handlers).map(([kind, handler]): [string, AnyJobHandler] => {
      if (typeof handler === "function")
        return [
          kind,
          async (context) => {
            if (mine(context.job)) await handler(context);
          },
        ];
      const staged: StagedJobHandler<{ prepared: unknown } | null> = {
        keepOnLostLease: handler.keepOnLostLease,
        async prepare(context) {
          return mine(context.job)
            ? { prepared: await handler.prepare(context) }
            : null;
        },
        async commit({ tx, job, prepared }) {
          if (prepared)
            await handler.commit({ tx, job, prepared: prepared.prepared });
        },
      };
      return [kind, staged];
    }),
  );
}

function deadOnlyFor(
  organizationId: () => string,
  handlers: Record<string, DeadJobHandler>,
): Record<string, DeadJobHandler> {
  return Object.fromEntries(
    Object.entries(handlers).map(([kind, handler]) => [
      kind,
      async (context: Parameters<DeadJobHandler>[0]) => {
        if (context.job.organizationId === organizationId())
          await handler(context);
      },
    ]),
  );
}

/**
 * Rejoue une tâche hors worker, comme il l'exécuterait : en une transaction, ou en deux
 * temps (préparation hors transaction, puis écriture).
 */
export async function replayJob(
  db: Database,
  handler: AnyJobHandler | undefined,
  job: ClaimedJob,
) {
  if (!handler) throw new Error("exécutant manquant");
  const tenant = { organizationId: job.organizationId };
  if (typeof handler === "function")
    return withTenant(db, tenant, (tx) => handler({ tx, job }));
  const prepared = await handler.prepare({
    job,
    read: (run) => withTenant(db, tenant, run),
  });
  await withTenant(db, tenant, (tx) => handler.commit({ tx, job, prepared }));
}

/**
 * Worker de test de la conversation : messages de Numa, envois WhatsApp et alertes, plus
 * d'autres exécutants au besoin, tous limités au cabinet du fichier de test.
 */
export function conversationWorker(deps: {
  db: Database;
  workerId: string;
  organizationId: () => string;
  /** WhatsApp simulé (`recordingWhatsApp`) ou réel contre l'imitation de Meta. */
  whatsapp: { provider: WhatsAppProvider };
  ai: AiGateway;
  extra?: Record<string, AnyJobHandler>;
  extraDead?: Record<string, DeadJobHandler>;
}) {
  const sends = sendHandlers({ whatsapp: deps.whatsapp.provider });
  const alerts = alertHandlers({ whatsapp: deps.whatsapp.provider });
  const conversation = conversationHandlers({
    whatsapp: deps.whatsapp.provider,
    ai: deps.ai,
  });
  const handlers = {
    ...conversation,
    ...sends.handlers,
    ...alerts.handlers,
    ...deps.extra,
  };
  return {
    handlers,
    conversation,
    worker: createWorker({
      db: deps.db,
      workerId: deps.workerId,
      handlers: onlyFor(deps.organizationId, handlers),
      deadHandlers: deadOnlyFor(deps.organizationId, {
        ...sends.dead,
        ...alerts.dead,
        ...deps.extraDead,
      }),
    }),
  };
}
