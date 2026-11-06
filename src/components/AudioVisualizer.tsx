import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  audioElement: HTMLAudioElement | null;
  isPlaying: boolean;
  currentTime?: number;
  duration?: number;
  strokeColor?: string;
  className?: string;
  variant?: 'line' | 'bars' | 'dual';
  sensitivity?: number;
}

// Global shared AudioContext singleton to avoid browser limit of max 6 contexts
let sharedAudioCtx: AudioContext | null = null;
const audioSourceMap = new WeakMap<HTMLAudioElement, { source: MediaElementAudioSourceNode; analyser: AnalyserNode }>();

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({
  audioElement,
  isPlaying,
  currentTime = 0,
  duration = 180,
  strokeColor = 'rgba(255, 255, 255, 0.95)',
  className = '',
  variant = 'line',
  sensitivity = 1.0,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const phaseRef = useRef<number>(0);
  const beatPulseRef = useRef<number>(0);
  // Persistent smoothed points array for silky-smooth physics (no jagged jitter)
  const smoothedPointsRef = useRef<Float32Array>(new Float32Array(120));

  // Initialize or connect Web Audio API Analyser
  useEffect(() => {
    if (!audioElement) return;

    try {
      if (!sharedAudioCtx) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          sharedAudioCtx = new AudioCtx();
        }
      }

      if (sharedAudioCtx) {
        if (sharedAudioCtx.state === 'suspended' && isPlaying) {
          sharedAudioCtx.resume().catch(() => {});
        }

        let entry = audioSourceMap.get(audioElement);
        if (!entry) {
          try {
            if (!audioElement.crossOrigin && !audioElement.src.startsWith('http')) {
              audioElement.crossOrigin = 'anonymous';
            }
            const source = sharedAudioCtx.createMediaElementSource(audioElement);
            const analyser = sharedAudioCtx.createAnalyser();
            analyser.fftSize = 512;
            analyser.smoothingTimeConstant = 0.88; // Higher smoothing for velvety fluid response
            source.connect(analyser);
            analyser.connect(sharedAudioCtx.destination);
            entry = { source, analyser };
            audioSourceMap.set(audioElement, entry);
          } catch (e) {
            // Handled via synthesized smooth harmonics
          }
        }

        if (entry?.analyser) {
          analyserRef.current = entry.analyser;
        }
      }
    } catch (e) {
      // Fallback to synthesized smooth harmonics
    }
  }, [audioElement, isPlaying]);

  // Main 60FPS Smooth Canvas Animation Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let isRunning = true;
    const timeDomainData = new Uint8Array(256);
    const freqData = new Uint8Array(256);
    const pointsCount = 100;

    const render = () => {
      if (!isRunning) return;

      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      let hasRealAudioData = false;
      let rawAudioEnergy = 0;

      if (analyserRef.current && isPlaying) {
        try {
          analyserRef.current.getByteTimeDomainData(timeDomainData);
          analyserRef.current.getByteFrequencyData(freqData);

          let deviationSum = 0;
          for (let i = 0; i < timeDomainData.length; i += 4) {
            deviationSum += Math.abs(timeDomainData[i] - 128);
          }
          if (deviationSum > 45) {
            hasRealAudioData = true;
          }

          let bassSum = 0;
          for (let i = 0; i < 16; i++) {
            bassSum += freqData[i];
          }
          rawAudioEnergy = bassSum / (16 * 255);
        } catch {
          hasRealAudioData = false;
        }
      }

      // Smooth phase progression & gentle beat interpolation
      if (isPlaying) {
        phaseRef.current += 0.028; // Calmer, smoother wave speed
        const targetPulse = hasRealAudioData ? rawAudioEnergy : 0.35 + 0.25 * Math.sin(phaseRef.current * 1.5);
        beatPulseRef.current += (targetPulse - beatPulseRef.current) * 0.12;
      } else {
        phaseRef.current += 0.008;
        beatPulseRef.current *= 0.94;
      }

      const centerY = height / 2;
      const pulse = beatPulseRef.current * sensitivity;
      const stepX = width / (pointsCount - 1);
      const smoothed = smoothedPointsRef.current;

      // Calculate target Y positions for each sample point
      for (let i = 0; i < pointsCount; i++) {
        const normX = i / (pointsCount - 1);
        let targetYOffset = 0;

        if (hasRealAudioData) {
          const dataIdx = Math.floor((i / pointsCount) * timeDomainData.length);
          const rawVal = (timeDomainData[dataIdx] - 128) / 128;
          targetYOffset = rawVal * (height * 0.40) * sensitivity;
        } else {
          // Velvety organic multi-sine harmonics with graceful Gaussian crests
          if (isPlaying) {
            const p = phaseRef.current;
            // Broad smooth fundamental
            const s1 = Math.sin(normX * Math.PI * 3.8 + p * 1.2);
            // Gentle melodic ripple
            const s2 = Math.cos(normX * Math.PI * 6.5 - p * 1.8) * 0.45;
            // Smooth bell curves with wider variance (no sharp jagged spikes)
            const peak1 = Math.exp(-Math.pow((normX - 0.24 - Math.sin(p * 0.3) * 0.06) * 5.5, 2)) * Math.sin(p * 2.8) * 1.7;
            const peak2 = Math.exp(-Math.pow((normX - 0.76 + Math.cos(p * 0.4) * 0.06) * 5.0, 2)) * Math.cos(p * 2.5) * 1.9;
            const peak3 = Math.exp(-Math.pow((normX - 0.5) * 8.0, 2)) * Math.sin(p * 3.2) * 1.1;

            const combined = (s1 + s2 + peak1 + peak2 + peak3) * (0.35 + pulse * 0.85);
            // Smooth boundary envelope to zero at screen edges
            const edgeDamping = Math.sin(normX * Math.PI);
            targetYOffset = combined * (height * 0.36) * edgeDamping;
          } else {
            // Gentle resting wave
            const sRest = Math.sin(normX * Math.PI * 2.5 + phaseRef.current);
            targetYOffset = sRest * 7 * Math.sin(normX * Math.PI);
          }
        }

        // Low-pass exponential smoothing (prevents abrupt jerky jumps, silky fluid flow)
        smoothed[i] += (targetYOffset - smoothed[i]) * 0.11;
      }

      // 1. Primary Bright Glowing Neon Silver Wave
      ctx.beginPath();
      ctx.lineWidth = 4.0; // Brighter & bolder line
      ctx.strokeStyle = strokeColor;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Radiant glow effect
      ctx.shadowColor = 'rgba(255, 255, 255, 1.0)';
      ctx.shadowBlur = isPlaying ? 32 : 12;

      // Draw with smooth quadratic bezier curves
      ctx.moveTo(0, centerY + smoothed[0]);
      for (let i = 1; i < pointsCount - 1; i++) {
        const xc = (i * stepX + (i + 1) * stepX) / 2;
        const yc = (centerY + smoothed[i] + centerY + smoothed[i + 1]) / 2;
        ctx.quadraticCurveTo(i * stepX, centerY + smoothed[i], xc, yc);
      }
      ctx.lineTo((pointsCount - 1) * stepX, centerY + smoothed[pointsCount - 1]);
      ctx.stroke();

      // 2. Secondary soft liquid sheen wave for fluid depth
      ctx.beginPath();
      ctx.lineWidth = 2.0;
      ctx.strokeStyle = strokeColor.replace(/0\.\d+/, '0.45');
      ctx.shadowBlur = 0;

      const echoPhase = phaseRef.current + 0.6;
      ctx.moveTo(0, centerY);
      for (let i = 1; i < pointsCount - 1; i++) {
        const normX = i / (pointsCount - 1);
        const sEcho = Math.sin(normX * Math.PI * 4 + echoPhase) * Math.cos(normX * Math.PI * 2 - echoPhase * 0.8);
        const yOffset = sEcho * (height * 0.20) * (isPlaying ? 0.3 + pulse * 0.5 : 0.05) * Math.sin(normX * Math.PI);
        const currY = centerY + yOffset;
        const nextY = centerY + Math.sin((normX + 0.01) * Math.PI * 4 + echoPhase) * (height * 0.20) * Math.sin(normX * Math.PI);
        
        const xc = (i * stepX + (i + 1) * stepX) / 2;
        const yc = (currY + nextY) / 2;
        ctx.quadraticCurveTo(i * stepX, currY, xc, yc);
      }
      ctx.stroke();

      ctx.restore();
      animFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      isRunning = false;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [isPlaying, strokeColor, sensitivity]);

  return (
    <canvas
      ref={canvasRef}
      className={`w-full h-full pointer-events-none ${className}`}
      style={{ display: 'block' }}
    />
  );
};
