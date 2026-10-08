import { describe, expect, it } from "vitest";

import {
  buildSimulatedVoiceNote,
  readSimulatedVoiceText,
} from "@/adapters/ai-gateway/simulated-voice";
import {
  simulatedAgendaReading,
  simulatedPhotoObservations,
  simulatedTranscription,
} from "@/adapters/ai-gateway/fake";
import { checkNumaReply } from "@/domains/conversations/guard";
import { parisWallMinutes } from "@/domains/reglages/content";

import { durationLabel, sniffAudio, sniffImage, wavDurationMs } from "./media";

const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0,
]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0]);
const SVG = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg"/>',
);

describe("type des fichiers, lu dans le contenu", () => {
  it("accepte JPEG, PNG et WebP ; refuse SVG, HTML et le reste", () => {
    expect(sniffImage(PNG)).toBe("image/png");
    expect(sniffImage(JPEG)).toBe("image/jpeg");
    expect(sniffImage(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))).toBe(
      "image/webp",
    );
    expect(sniffImage(SVG)).toBeNull();
    expect(sniffImage(new TextEncoder().encode("<html>"))).toBeNull();
    expect(sniffImage(new Uint8Array())).toBeNull();
  });

  it("reconnaît les sons OGG, WAV et MP3", () => {
    expect(sniffAudio(new TextEncoder().encode("OggS\0"))).toBe("audio/ogg");
    expect(sniffAudio(new TextEncoder().encode("ID3\u0004"))).toBe(
      "audio/mpeg",
    );
    expect(sniffAudio(buildSimulatedVoiceNote("Bonjour"))).toBe("audio/wav");
    expect(sniffAudio(PNG)).toBeNull();
  });
});

describe("message vocal simulé", () => {
  it("un vrai WAV, dont la transcription simulée relit le texte prononcé", () => {
    const text = "Elle a bien mangé ce matin, la cicatrice est propre";
    const audio = buildSimulatedVoiceNote(text);
    expect(wavDurationMs(audio)).toBe(4000);
    expect(durationLabel(wavDurationMs(audio))).toBe("0:04");
    expect(readSimulatedVoiceText(audio)).toBe(text);
    expect(
      simulatedTranscription({
        audio,
        contentType: "audio/wav",
        languageHint: "fr",
      }),
    ).toEqual({ text, language: "fr" });
  });

  it("aucune transcription inventée pour un autre fichier", () => {
    const { text } = simulatedTranscription({
      audio: new TextEncoder().encode("OggS\0\0\0"),
      contentType: "audio/ogg",
      languageHint: "fr",
    });
    expect(text).toContain("écoutez le message");
    expect(durationLabel(null)).toBe("durée inconnue");
  });

  it("refuse un texte vide ou trop long", () => {
    expect(() => buildSimulatedVoiceNote("  ")).toThrow();
    expect(() => buildSimulatedVoiceNote("a".repeat(5000))).toThrow();
  });
});

describe("analyse photo et lecture d'agenda simulées", () => {
  it("les observations simulées passent les garde-fous (aucun avis médical)", () => {
    for (const language of ["fr", "en"] as const)
      for (const observation of simulatedPhotoObservations({
        image: PNG,
        contentType: "image/png",
        language,
        animalName: "Pistache",
      }).observations)
        expect(checkNumaReply(observation)).toEqual({ ok: true });
  });

  it("créneaux libres : deux jours ouvrés à venir, 30 minutes chacun", () => {
    // Vendredi 9 octobre 2026, 15 h à Paris : lundi 12 et mardi 13.
    const now = new Date("2026-10-09T13:00:00Z");
    const { slots } = simulatedAgendaReading({
      image: PNG,
      contentType: "image/png",
      now,
    });
    expect(slots).toHaveLength(8);
    for (const slot of slots) {
      expect(slot.startsAt.getTime()).toBeGreaterThan(now.getTime());
      expect(slot.endsAt.getTime() - slot.startsAt.getTime()).toBe(1_800_000);
      const weekday = new Date(
        parisWallMinutes(slot.startsAt) * 60_000,
      ).getUTCDay();
      expect([1, 2]).toContain(weekday);
    }
    expect(slots[0]?.startsAt.toISOString()).toBe("2026-10-12T07:30:00.000Z");
  });
});
