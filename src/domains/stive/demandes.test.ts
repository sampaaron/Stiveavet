import { describe, expect, it } from "vitest";

import { isoWeekday, recognize } from "./demandes";
import type { RecognitionContext } from "./demandes";

// Jour de Paris fixe : 2026-10-19 est un lundi.
const MONDAY = Date.UTC(2026, 9, 19) / 86_400_000;

const context: RecognitionContext = {
  followups: [
    { id: "f-moka", animalName: "Moka", status: "active" },
    { id: "f-oscar", animalName: "Oscar", status: "paused" },
    { id: "f-max-old", animalName: "Max", status: "ended" },
    { id: "f-max", animalName: "Max", status: "active" },
    { id: "f-rex-1", animalName: "Rex", status: "active" },
    { id: "f-rex-2", animalName: "Rex", status: "paused" },
  ],
  vets: [
    { membershipId: "m-claire", name: "Dr Claire Fontaine" },
    { membershipId: "m-hugo", name: "Dr Hugo Marchal" },
  ],
  isVet: true,
  today: MONDAY,
};

const ask = (question: string, extra: Partial<RecognitionContext> = {}) =>
  recognize(question, { ...context, ...extra });

describe("reconnaissance des demandes (Stive simulé)", () => {
  it("lundi est bien le jour ISO 1", () => {
    expect(isoWeekday(MONDAY)).toBe(1);
    expect(isoWeekday(MONDAY + 6)).toBe(7);
  });

  it("point du jour, en français comme en anglais", () => {
    expect(ask("Mon point du jour")).toEqual({ kind: "briefing" });
    expect(ask("Qu'est-ce qui est prioritaire aujourd'hui ?")).toEqual({
      kind: "briefing",
    });
    expect(ask("What's my day like?")).toEqual({ kind: "briefing" });
  });

  it("résumé d'un dossier nommé, ou d'un nom d'animal seul", () => {
    const moka = {
      kind: "summary",
      target: { kind: "one", followupId: "f-moka" },
    };
    expect(ask("Résumé du dossier de Moka")).toEqual(moka);
    expect(ask("Où en est moka ?")).toEqual(moka);
    expect(ask("Moka")).toEqual(moka);
    expect(ask("Summarize Moka's file")).toEqual(moka);
  });

  it("« résumé » ne se confond jamais avec la reprise d'un suivi", () => {
    expect(ask("Résumé d'Oscar")).toEqual({
      kind: "summary",
      target: { kind: "one", followupId: "f-oscar" },
    });
    expect(ask("Resume the follow-up of Oscar")).toEqual({
      kind: "status",
      target: { kind: "one", followupId: "f-oscar" },
      change: "resume",
    });
  });

  it("entre deux suivis du même nom, celui en cours ; sinon la personne choisit", () => {
    expect(ask("Résumé de Max")).toEqual({
      kind: "summary",
      target: { kind: "one", followupId: "f-max" },
    });
    expect(ask("Résumé de Rex")).toEqual({
      kind: "summary",
      target: { kind: "many", followupIds: ["f-rex-1", "f-rex-2"] },
    });
  });

  it("sans animal nommé, le dossier d'où vient la demande, sinon aucun", () => {
    expect(ask("Fais-moi un résumé", { followupId: "f-oscar" })).toEqual({
      kind: "summary",
      target: { kind: "one", followupId: "f-oscar" },
    });
    expect(ask("Fais-moi un résumé")).toEqual({
      kind: "summary",
      target: { kind: "none" },
    });
    // Un identifiant de dossier inconnu de la personne ne sert pas de cible.
    expect(ask("Fais-moi un résumé", { followupId: "f-autre" })).toEqual({
      kind: "summary",
      target: { kind: "none" },
    });
  });

  it("créneaux libres : période et vétérinaire", () => {
    expect(ask("Mes créneaux libres demain")).toEqual({
      kind: "slots",
      period: { label: "tomorrow", from: MONDAY + 1, to: MONDAY + 2 },
      vet: { kind: "self" },
    });
    expect(ask("Créneaux de Dr Marchal jeudi")).toEqual({
      kind: "slots",
      period: { label: "day", from: MONDAY + 3, to: MONDAY + 4 },
      vet: { kind: "vet", membershipId: "m-hugo" },
    });
    expect(
      ask("Disponibilités de toute l'équipe la semaine prochaine"),
    ).toEqual({
      kind: "slots",
      period: { label: "next_week", from: MONDAY + 7, to: MONDAY + 14 },
      vet: { kind: "all" },
    });
    expect(ask("Free slots", { isVet: false })).toEqual({
      kind: "slots",
      period: { label: "next_days", from: MONDAY, to: MONDAY + 7 },
      vet: { kind: "all" },
    });
    // Le jour même compte quand on le nomme.
    expect(ask("créneaux lundi")).toMatchObject({
      period: { from: MONDAY, to: MONDAY + 1 },
    });
  });

  it("rendez-vous demandés par les propriétaires", () => {
    expect(ask("Rendez-vous à confirmer")).toEqual({ kind: "appointments" });
    expect(ask("Quels rendez-vous ont été demandés ?")).toEqual({
      kind: "appointments",
    });
    expect(ask("Pending appointment requests")).toEqual({
      kind: "appointments",
    });
    // Un créneau pour un rendez-vous reste une question de créneaux.
    expect(ask("Créneaux libres pour un rendez-vous demain")).toMatchObject({
      kind: "slots",
    });
  });

  it("brouillon de message, avec le bon modèle", () => {
    expect(ask("Rédige un message pour Moka")).toEqual({
      kind: "draft",
      target: { kind: "one", followupId: "f-moka" },
      template: "news",
    });
    expect(
      ask("Brouillon pour demander une photo", { followupId: "f-moka" }),
    ).toEqual({
      kind: "draft",
      target: { kind: "one", followupId: "f-moka" },
      template: "photo",
    });
    expect(
      ask("Écris aux propriétaires d'Oscar de rappeler le cabinet"),
    ).toEqual({
      kind: "draft",
      target: { kind: "one", followupId: "f-oscar" },
      template: "call",
    });
  });

  it("pause, reprise et arrêt d'un suivi nommé", () => {
    expect(ask("Mets Moka en pause")).toEqual({
      kind: "status",
      target: { kind: "one", followupId: "f-moka" },
      change: "pause",
    });
    expect(ask("Reprends le suivi d'Oscar")).toEqual({
      kind: "status",
      target: { kind: "one", followupId: "f-oscar" },
      change: "resume",
    });
    expect(ask("Arrête le suivi de Moka")).toEqual({
      kind: "status",
      target: { kind: "one", followupId: "f-moka" },
      change: "stop",
    });
    expect(ask("Mettre en pause")).toEqual({
      kind: "status",
      target: { kind: "none" },
      change: "pause",
    });
  });

  it("le reste : réponse honnête plutôt qu'une invention", () => {
    expect(ask("Quelle dose d'anti-inflammatoire pour un chat ?")).toEqual({
      kind: "unknown",
    });
    expect(ask("Raconte-moi une blague")).toEqual({ kind: "unknown" });
  });
});
