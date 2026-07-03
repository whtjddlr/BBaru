import { useEffect, useState } from "react";

const INSTALL_PROMPT_DISMISSED_KEY = "bbaru:install-prompt-dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export function useInstallPrompt() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => readDismissed());

  useEffect(() => {
    if (dismissed || isIosDevice() || typeof window === "undefined") {
      return undefined;
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, [dismissed]);

  const dismiss = () => {
    setDismissed(true);
    setPromptEvent(null);
    writeDismissed();
  };

  const promptInstall = async () => {
    if (!promptEvent) {
      return;
    }

    await promptEvent.prompt();
    await promptEvent.userChoice.catch(() => undefined);
    dismiss();
  };

  return {
    canPrompt: Boolean(promptEvent) && !dismissed,
    dismiss,
    promptInstall,
  };
}

function readDismissed(): boolean {
  if (!canUseStorage()) {
    return false;
  }

  return window.localStorage.getItem(INSTALL_PROMPT_DISMISSED_KEY) === "true";
}

function writeDismissed() {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(INSTALL_PROMPT_DISMISSED_KEY, "true");
}

function canUseStorage(): boolean {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function isIosDevice(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }

  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}
