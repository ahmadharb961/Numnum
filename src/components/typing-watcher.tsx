"use client";

import { useEffect } from "react";

const NOT_TYPED = new Set(["checkbox", "radio", "range", "file", "color", "button", "submit", "reset", "image", "hidden"]);

function isTextField(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  return el instanceof HTMLInputElement && !NOT_TYPED.has(el.type);
}

/**
 * On phones the keyboard pushes bars pinned to the bottom of the screen (the bottom menu, the
 * dish "Add" bar) up on top of the form. While a text field is focused on a touch device,
 * <html data-typing> is set and those bars (.hide-when-typing) hide until the keyboard closes.
 */
export function TypingWatcher() {
  useEffect(() => {
    if (navigator.maxTouchPoints === 0) return; // mouse and keyboard: no on-screen keyboard
    const root = document.documentElement;
    const onIn = (e: FocusEvent) => {
      if (isTextField(e.target)) root.dataset.typing = "";
    };
    const onOut = (e: FocusEvent) => {
      if (!isTextField(e.relatedTarget)) delete root.dataset.typing; // moving to another field keeps it
    };
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    return () => {
      document.removeEventListener("focusin", onIn);
      document.removeEventListener("focusout", onOut);
      delete root.dataset.typing;
    };
  }, []);
  return null;
}
