import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Download, X, Smartphone } from "lucide-react";

export const InstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);

  useEffect(() => {
    // Check if on iOS
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    setIsIOS(isIOSDevice);

    // Check if already installed
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (isStandalone) return;

    // Listen for the beforeinstallprompt event (Android/Chrome)
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Check if user dismissed before
      const dismissed = localStorage.getItem('pwa-install-dismissed');
      if (!dismissed) {
        setShowPrompt(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Show iOS instructions if not installed
    if (isIOSDevice) {
      const dismissed = localStorage.getItem('pwa-install-dismissed');
      if (!dismissed) {
        setTimeout(() => setShowPrompt(true), 2000);
      }
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSInstructions(true);
      return;
    }

    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setShowPrompt(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    setShowIOSInstructions(false);
    localStorage.setItem('pwa-install-dismissed', 'true');
  };

  if (!showPrompt) return null;

  return (
    <>
      {/* Install Banner */}
      <div className="fixed bottom-20 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 bg-zinc-50 border border-red-500/50 rounded-lg shadow-2xl z-50 p-4">
        <button 
          onClick={handleDismiss}
          className="absolute top-2 right-2 text-zinc-500 hover:text-zinc-900"
        >
          <X className="w-4 h-4" />
        </button>
        
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 bg-red-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <Smartphone className="w-6 h-6 text-zinc-900" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-zinc-900 text-sm">Install Pole Data App</h3>
            <p className="text-xs text-zinc-600 mt-1">
              {isIOS 
                ? "Add to your home screen for quick access" 
                : "Install the app for offline access and better experience"
              }
            </p>
            <Button 
              onClick={handleInstallClick}
              className="mt-3 w-full h-9 bg-red-600 hover:bg-red-700 text-white text-sm"
            >
              <Download className="w-4 h-4 mr-2" />
              {isIOS ? "How to Install" : "Install App"}
            </Button>
          </div>
        </div>
      </div>

      {/* iOS Instructions Modal */}
      {showIOSInstructions && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-50 border border-zinc-300 rounded-lg max-w-sm w-full p-5">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-zinc-900">Install on iPhone/iPad</h3>
              <button onClick={handleDismiss} className="text-zinc-500 hover:text-zinc-900">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4 text-sm text-zinc-700">
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 bg-red-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">1</span>
                <p>Tap the <strong className="text-zinc-900">Share</strong> button at the bottom of your browser (the square with an arrow)</p>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 bg-red-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">2</span>
                <p>Scroll down and tap <strong className="text-zinc-900">"Add to Home Screen"</strong></p>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 bg-red-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">3</span>
                <p>Tap <strong className="text-zinc-900">"Add"</strong> in the top right corner</p>
              </div>
            </div>
            
            <Button 
              onClick={handleDismiss}
              className="mt-5 w-full h-10 bg-zinc-200 hover:bg-zinc-600 text-zinc-900"
            >
              Got it!
            </Button>
          </div>
        </div>
      )}
    </>
  );
};

export default InstallPrompt;
