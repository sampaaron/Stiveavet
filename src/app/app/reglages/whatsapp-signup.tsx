"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
} from "react";

import { useAppText } from "@/i18n/app/client";
import { Button } from "@/ui/button";
import { TextField } from "@/ui/text-field";

import { ActionMessage } from "../action-message";
import { initialActionState } from "../action-state";

import { connectWhatsAppAction } from "./actions";

/**
 * Bouton d'inscription intégrée de Meta (ADR 0024). Le SDK de Meta n'est chargé que sur
 * cette page, et seulement quand WhatsApp est réel (la CSP ne l'autorise que là). Meta renvoie
 * un code à usage unique et, par message de fenêtre, les identifiants du compte et du numéro ;
 * tout part aussitôt au serveur, qui fait le reste. Rien n'est gardé dans le navigateur.
 */

const SDK_URL = "https://connect.facebook.net/en_US/sdk.js";
const META_ORIGINS = new Set([
  "https://www.facebook.com",
  "https://web.facebook.com",
]);

type LoginResponse = { authResponse?: { code?: string } | null };
type FacebookSdk = {
  init(options: {
    appId: string;
    autoLogAppEvents: boolean;
    xfbml: boolean;
    version: string;
  }): void;
  login(
    callback: (response: LoginResponse) => void,
    options: {
      config_id: string;
      response_type: "code";
      override_default_response_type: true;
      extras: { setup: Record<string, never>; sessionInfoVersion: "3" };
    },
  ): void;
};

declare global {
  interface Window {
    FB?: FacebookSdk;
    fbAsyncInit?: () => void;
  }
}

type SignupIds = { wabaId: string; phoneNumberId: string };

/** Message de fin envoyé par la fenêtre de Meta ; tout autre message est ignoré. */
function signupIds(data: unknown): SignupIds | null {
  if (typeof data !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(data);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "type" in parsed &&
      parsed.type === "WA_EMBEDDED_SIGNUP" &&
      "data" in parsed &&
      typeof parsed.data === "object" &&
      parsed.data !== null &&
      "waba_id" in parsed.data &&
      "phone_number_id" in parsed.data &&
      typeof parsed.data.waba_id === "string" &&
      typeof parsed.data.phone_number_id === "string"
    )
      return {
        wabaId: parsed.data.waba_id,
        phoneNumberId: parsed.data.phone_number_id,
      };
  } catch {
    // Pas un message de Meta.
  }
  return null;
}

export function WhatsAppSignup({
  appId,
  configId,
}: {
  appId: string;
  configId: string;
}) {
  const t = useAppText();
  const text = t.settings.integrations.whatsapp.live;
  const [state, action, pending] = useActionState(
    connectWhatsAppAction,
    initialActionState,
  );
  const [pin, setPin] = useState("");
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState<
    "idle" | "waiting" | "cancelled" | "unavailable"
  >("idle");
  const ids = useRef<SignupIds | null>(null);
  const code = useRef<string | null>(null);
  // Lu par le rappel de Meta, qui garde la valeur de son premier rendu.
  const pinRef = useRef("");

  function submitWhenComplete() {
    if (!ids.current || !code.current) return;
    const form = new FormData();
    form.set("code", code.current);
    form.set("wabaId", ids.current.wabaId);
    form.set("phoneNumberId", ids.current.phoneNumberId);
    form.set("pin", pinRef.current);
    code.current = null;
    ids.current = null;
    setStep("idle");
    startTransition(() => action(form));
  }

  useEffect(() => {
    window.fbAsyncInit = () => {
      window.FB?.init({
        appId,
        autoLogAppEvents: false,
        xfbml: false,
        version: "v25.0",
      });
      setReady(true);
    };
    if (window.FB) window.fbAsyncInit();
    else if (!document.querySelector(`script[src="${SDK_URL}"]`)) {
      const script = document.createElement("script");
      script.src = SDK_URL;
      script.async = true;
      script.crossOrigin = "anonymous";
      script.onerror = () => setStep("unavailable");
      document.body.append(script);
    }
    const onMessage = (event: MessageEvent) => {
      if (!META_ORIGINS.has(event.origin)) return;
      const found = signupIds(event.data);
      if (!found) return;
      ids.current = found;
      submitWhenComplete();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // L'action et les références sont stables : l'écoute est posée une seule fois.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId]);

  function start() {
    const sdk = window.FB;
    if (!sdk) {
      setStep("unavailable");
      return;
    }
    setStep("waiting");
    sdk.login(
      (response) => {
        const received = response.authResponse?.code;
        if (!received) {
          setStep("cancelled");
          return;
        }
        code.current = received;
        submitWhenComplete();
      },
      {
        config_id: configId,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {}, sessionInfoVersion: "3" },
      },
    );
  }

  const pinValid = /^[0-9]{6}$/.test(pin);
  const notice = pending
    ? text.finishing
    : step === "waiting"
      ? text.waiting
      : step === "cancelled"
        ? text.cancelled
        : step === "unavailable"
          ? text.unavailable
          : null;

  return (
    <div className="grid gap-3">
      <p className="text-sm text-ink-muted">{text.description}</p>
      <TextField
        label={text.pin}
        name="pin"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={6}
        value={pin}
        onChange={(event) => {
          const digits = event.target.value.replace(/\D/g, "");
          pinRef.current = digits;
          setPin(digits);
        }}
        hint={text.pinHint}
        className="max-w-xs"
      />
      {notice ? (
        <p role="status" className="text-sm text-ink-muted">
          {notice}
        </p>
      ) : null}
      <ActionMessage state={state} />
      <div>
        <Button
          type="button"
          onClick={start}
          disabled={!ready || !pinValid || pending}
          aria-busy={pending}
        >
          {text.submit}
        </Button>
      </div>
    </div>
  );
}
