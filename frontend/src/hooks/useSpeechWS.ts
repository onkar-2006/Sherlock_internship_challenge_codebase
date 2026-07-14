import { useState, useEffect, useRef } from 'react';

interface UseSpeechWSProps {
  role: 'interviewer' | 'candidate' | 'observer' | 'participant';
  displayName: string;
  onMessage: (data: any) => void;
  isJoined?: boolean;
}

export function useSpeechWS({ role, displayName, onMessage, isJoined = true }: UseSpeechWSProps) {
  const [status, setStatus] = useState<'disconnected' | 'connected' | 'recording'>('disconnected');
  const [interimText, setInterimText] = useState<string>('');

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);
  
  // Track status in a ref to avoid stale closure scopes in event listeners
  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // Persistent tab UUID that survives refreshes within the same tab (unique per tab session)
  const [participantId] = useState<string>(() => {
    let id = sessionStorage.getItem('sherlock_p_id');
    if (!id) {
      id = 'usr_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);
      sessionStorage.setItem('sherlock_p_id', id);
    }
    return id;
  });

  const disconnectWS = () => {
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch (err) {
        console.error("Error closing websocket:", err);
      }
      wsRef.current = null;
    }
  };

  // Setup WebSocket connection - triggers only when role, participantId, or join status updates
  useEffect(() => {
    if (!isJoined) {
      setStatus('disconnected');
      return;
    }

    disconnectWS();
    setStatus('disconnected');

    const wsUrl = `ws://127.0.0.1:8000/ws/transcribe?role=${role}&name=${encodeURIComponent(displayName)}&participant_id=${participantId}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      onMessage(data);
    };

    ws.onclose = () => {
      setStatus('disconnected');
      stopRecording();
    };

    ws.onerror = (err) => {
      console.error(`WebSocket error for ${role}:`, err);
    };

    return () => {
      disconnectWS();
    };
  }, [role, participantId, isJoined]);

  const sendMessage = (message: any) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
      } catch (e) {
        console.error("Error sending websocket message:", e);
      }
    }
  };

  const setupVolumeMeter = (stream: MediaStream) => {
    try {
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const checkVolume = () => {
        if (streamRef.current) {
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i];
          }
          const average = sum / bufferLength;
          const normalized = Math.min(Math.round((average / 128) * 100), 100);
          
          // Direct DOM update to avoid React re-renders at 60fps
          const bar = document.getElementById(`volume-bar-fill-${participantId}`);
          if (bar) {
            bar.style.width = `${normalized}%`;
          }
          requestAnimationFrame(checkVolume);
        }
      };

      checkVolume();
    } catch (e) {
      console.error("Failed to setup volume meter:", e);
    }
  };

  const startRecording = async () => {
    try {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        alert("Web Speech API is not supported in this browser. Please use Chrome, Edge, or Safari.");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setStatus('recording');
      setupVolumeMeter(stream);

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        const ws = wsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) {
          if (interimTranscript) {
            ws.send(JSON.stringify({ type: 'interim', text: interimTranscript }));
          }
          if (finalTranscript) {
            ws.send(JSON.stringify({ type: 'final', text: finalTranscript }));
          }
        }
      };

      recognition.onerror = (event: any) => {
        console.error("Speech recognition error:", event.error);
      };

      recognition.onend = () => {
        if (statusRef.current === 'recording') {
          try {
            recognition.start();
          } catch (e) {
            console.error("Error restarting recognition:", e);
          }
        }
      };

      recognition.start();
      recognitionRef.current = recognition;

    } catch (err) {
      console.error('Failed to access microphone:', err);
      alert('Microphone access is required for real-time transcription.');
    }
  };

  const stopRecording = () => {
    setStatus('connected');
    setInterimText('');
    
    // Clear volume bar DOM style immediately
    const bar = document.getElementById(`volume-bar-fill-${participantId}`);
    if (bar) {
      bar.style.width = '0%';
    }
    
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      try {
        recognitionRef.current.stop();
      } catch (e) {}
      recognitionRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (audioCtxRef.current) {
      try {
        audioCtxRef.current.close();
      } catch (e) {}
      audioCtxRef.current = null;
    }
  };

  return {
    participantId,
    status,
    interimText,
    setInterimText,
    startRecording,
    stopRecording,
    sendMessage
  };
}
