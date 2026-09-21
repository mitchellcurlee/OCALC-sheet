import * as React from "react"

import { cn } from "@/lib/utils"
import { VoiceMicButton, voiceSupported, splitLayoutClasses } from "@/components/VoiceMicButton"

const BASE = "flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"

// Every textarea gets a microphone button (voice-to-text); typing still works in the same field
const Textarea = React.forwardRef(({ className, noVoice = false, ...props }, ref) => {
  const innerRef = React.useRef(null)
  const setRefs = (el) => {
    innerRef.current = el
    if (typeof ref === "function") ref(el)
    else if (ref) ref.current = el
  }
  const voice = voiceSupported && !noVoice && !props.readOnly && !props.disabled
  if (!voice) {
    return <textarea className={cn(BASE, className)} ref={ref} {...props} />
  }
  const { wrapper, field } = splitLayoutClasses(className)
  return (
    <div className={cn("relative w-full", wrapper)}>
      <textarea className={cn(BASE, field, "pr-9")} ref={setRefs} {...props} />
      <VoiceMicButton targetRef={innerRef} multiline className="right-1.5 top-1.5" />
    </div>
  );
})
Textarea.displayName = "Textarea"

export { Textarea }
