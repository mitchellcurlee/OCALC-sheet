import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { toast } from "sonner";

const Recognition = typeof window !== "undefined" ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
export const voiceSupported = !!Recognition;

let active = null; // only one recognizer listens at a time

// Insert text at the caret of a controlled input/textarea and let React see it as a normal change
const insertAtCaret = (el, text) => {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? start;
  const before = el.value.slice(0, start);
  const after = el.value.slice(end);
  const sep = before && !/\s$/.test(before) ? " " : "";
  const next = `${before}${sep}${text}${after}`;
  const proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, next);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  const pos = before.length + sep.length + text.length;
  try { el.setSelectionRange(pos, pos); } catch (e) { /* not all input types support selection */ }
};

// Tap to dictate into the field referenced by targetRef; tap again (or pause) to stop
export const VoiceMicButton = ({ targetRef, className = "", multiline = false }) => {
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);

  useEffect(() => () => { try { recRef.current?.stop(); } catch (e) { /* ignore */ } }, []);

  if (!voiceSupported) return null;

  const stop = () => {
    try { recRef.current?.stop(); } catch (e) { /* ignore */ }
    recRef.current = null;
    if (active && active.owner === stop) active = null;
    setListening(false);
  };

  const start = () => {
    if (active) active.stop();
    const rec = new Recognition();
    rec.lang = navigator.language || "en-US";
    rec.continuous = multiline;
    rec.interimResults = false;
    rec.onresult = (ev) => {
      const el = targetRef.current;
      if (!el) return;
      let text = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        if (ev.results[i].isFinal) text += ev.results[i][0].transcript;
      }
      text = text.trim();
      if (text) insertAtCaret(el, text);
    };
    rec.onerror = (ev) => {
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") toast.error("Microphone access is blocked — allow it in your browser settings to dictate");
      else if (ev.error !== "aborted" && ev.error !== "no-speech") toast.error(`Voice input error: ${ev.error}`);
      stop();
    };
    rec.onend = () => { if (recRef.current === rec) stop(); };
    recRef.current = rec;
    active = { stop, owner: stop };
    try {
      rec.start();
      setListening(true);
      targetRef.current?.focus();
    } catch (e) {
      stop();
    }
  };

  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={listening ? "Stop dictation" : "Dictate into this field"}
      title={listening ? "Listening… tap to stop" : "Tap to dictate"}
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); listening ? stop() : start(); }}
      className={`absolute z-10 flex h-6 w-6 items-center justify-center rounded-full transition-colors ${listening ? "bg-red-600 text-white animate-pulse shadow" : "text-zinc-400 hover:text-red-600 hover:bg-red-50"} ${className}`}
      data-testid="voice-mic-btn"
      data-listening={listening ? "true" : "false"}
    >
      {listening ? <Square className="h-3 w-3 fill-current" /> : <Mic className="h-3.5 w-3.5" />}
    </button>
  );
};

// Tailwind classes that size/position the field belong on the wrapper, everything else stays on the field
const LAYOUT_RE = /^(?:[a-z-]+:)*(?:w-|min-w-|max-w-|flex(?:-|$)|grow|shrink|basis-|col-span-|row-span-|self-|justify-self-|order-|ml-|mr-|mx-|mt-|mb-|my-|m-|hidden$|block$|inline)/;
export const splitLayoutClasses = (className = "") => {
  const wrapper = [];
  const field = [];
  String(className).split(/\s+/).filter(Boolean).forEach((c) => (LAYOUT_RE.test(c) ? wrapper : field).push(c));
  return { wrapper: wrapper.join(" "), field: field.join(" ") };
};

export const NO_VOICE_TYPES = new Set(["number", "date", "time", "datetime-local", "month", "week", "password", "file", "checkbox", "radio", "range", "color", "hidden", "email", "url", "submit", "button", "reset", "image"]);
