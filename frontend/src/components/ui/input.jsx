import * as React from "react"

import { cn } from "@/lib/utils"
import { VoiceMicButton, voiceSupported, splitLayoutClasses, NO_VOICE_TYPES } from "@/components/VoiceMicButton"

const BASE = "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"

// Text-like inputs get a microphone button (voice-to-text); typing still works in the same field
const Input = React.forwardRef(({ className, type, noVoice = false, ...props }, ref) => {
  const innerRef = React.useRef(null)
  const setRefs = (el) => {
    innerRef.current = el
    if (typeof ref === "function") ref(el)
    else if (ref) ref.current = el
  }
  const voice = voiceSupported && !noVoice && !NO_VOICE_TYPES.has(type || "text") && !props.readOnly && !props.disabled
  if (!voice) {
    return <input type={type} className={cn(BASE, className)} ref={ref} {...props} />
  }
  const { wrapper, field } = splitLayoutClasses(className)
  return (
    <div className={cn("relative w-full", wrapper)}>
      <input type={type} className={cn(BASE, field, "pr-8")} ref={setRefs} {...props} />
      <VoiceMicButton targetRef={innerRef} className="right-1 top-1/2 -translate-y-1/2" />
    </div>
  );
})
Input.displayName = "Input"

export { Input }
