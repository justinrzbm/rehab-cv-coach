import React, { useEffect, useMemo, useRef, useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BookOpen, CheckCircle2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CircularTimer } from "@/components/progress/CircularTimer";
import { useTTS } from "@/components/tts/useTTS";
import { useSEO } from "@/hooks/useSEO";
import { supabase } from "@/integrations/supabase/client";
import { Hands, Results as HandResults } from "@mediapipe/hands";
import { Camera } from "@mediapipe/camera_utils";
import { Pose, Results as PoseResults } from "@mediapipe/pose";
import { FaceMesh, Results as FaceMeshResults } from "@mediapipe/face_mesh";
import * as cocoSsd from "@tensorflow-models/coco-ssd";
import * as tf from "@tensorflow/tfjs-core";
import "@tensorflow/tfjs-backend-webgl";
import "@tensorflow/tfjs-backend-cpu";

interface Task {
  name: string;
  instruction: string;
  duration?: number;
}

const congrats = ["Great job!", "Awesome!", "Well done!", "Fantastic!", "You did it! 🎉"];
const encouragement = ["Keep it up! 💪", "You're on fire! 🔥", "Nice and steady! 😊", "Great focus! 🌟"];

const ModuleRun: React.FC = () => {
  const { slug } = useParams();
  useSEO(`Module Run: ${slug}`, `Guided ${slug} module with camera and voice.`);
  const nav = useNavigate();
  const { speak } = useTTS(true);

  // Exact order requested
  const tasks: Task[] = useMemo(
    () =>
      slug === "feeding"
        ? [
            { name: "reach_bottle",   instruction: "Reach your hand toward the bottle." },
            { name: "grab_hold",      instruction: "Grasp the bottle and hold steady for a moment." },
            { name: "lift_to_mouth",  instruction: "Lift the bottle up toward your mouth." },
            { name: "hold_at_mouth",  instruction: "Hold at mouth level.", duration: 5 },
            { name: "dump_into_mouth",instruction: "Tilt the bottle as if pouring." },
            { name: "place_cup_down", instruction: "Place the cup back down smoothly." },
          ]
        : [],
    [slug]
  );

  const [idx, setIdx] = useState(0);
  const [showCongrats, setShowCongrats] = useState<string | null>(null);
  const [timerRunning, setTimerRunning] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [moduleAttemptId, setModuleAttemptId] = useState<string | null>(null);
  const [failMenu, setFailMenu] = useState(false);

  // Used to force re-run of effects on Retry without changing idx
  const [attempt, setAttempt] = useState(0);

  // MediaPipe refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handsRef = useRef<Hands | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  const poseRef = useRef<Pose | null>(null);
  const faceMeshRef = useRef<FaceMesh | null>(null);
  const bottleDetectorRef = useRef<cocoSsd.ObjectDetection | null>(null);
  
  // CV state
  const bottlePosRef = useRef<{x: number, y: number, w: number, h: number} | null>(null);
  const handResultsRef = useRef<HandResults | null>(null);
  const poseResultsRef = useRef<PoseResults | null>(null);
  const faceMeshResultsRef = useRef<FaceMeshResults | null>(null);
  
  // Task-specific tracking
  const reachStartTimeRef = useRef<number | null>(null);
  const reachInitialHandPosRef = useRef<{x: number, y: number} | null>(null);
  const gripStartTimeRef = useRef<number | null>(null);
  const mouthHoldStartRef = useRef<number | null>(null);
  const taskCompletedRef = useRef<boolean>(false);

  // Start module attempt (if logged in)
  useEffect(() => {
    (async () => {
      const { data: user } = await supabase.auth.getUser();
      setStartTime(Date.now());
      if (user.user) {
        const { data, error } = await supabase
          .from("module_attempts")
          .insert({ user_id: user.user.id, module_name: slug!, module_is_completed: false, subtasks_total: 5 })
          .select("id")
          .maybeSingle();
        if (!error && data) setModuleAttemptId(data.id);
      }
    })();
  }, [slug]);

  // --- Success helpers -------------------------------------------------------
  const doSuccess = async (message: string) => {
    setFailMenu(false);
    setTimerRunning(false);
    speak(message);
    setShowCongrats(message);
    
    // Show congrats for 2 seconds
    await new Promise(resolve => setTimeout(resolve, 2000));
    setShowCongrats(null);

    // Save task attempt (as pass)
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user && moduleAttemptId) {
        const t = tasks[idx];
        await supabase.from("module_task_attempts").insert({
          module_attempt_id: moduleAttemptId,
          task_name: t.name,
          is_pass: true,
          duration_seconds: t.duration ?? 7,
          metrics: {},
        });
      }
    } catch {}

    // Buffer time for CV to reset (1.5 seconds)
    await new Promise(resolve => setTimeout(resolve, 1500));

    if (idx + 1 < tasks.length) setIdx(idx + 1);
    else onCompleteModule(true);
  };

  const onSuccess = async () => {
    const msg = congrats[Math.floor(Math.random() * congrats.length)];
    await doSuccess(msg);
  };

  // Speak instruction + timers
  useEffect(() => {
    if (!tasks.length) return;
    const t = tasks[idx];
    
    // Reset task completion flag and tracking refs
    taskCompletedRef.current = false;
    reachStartTimeRef.current = null;
    reachInitialHandPosRef.current = null;
    gripStartTimeRef.current = null;
    mouthHoldStartRef.current = null;
    
    // Delay instruction by 1 second to let CV stabilize
    const instructionTimer = window.setTimeout(() => {
      speak(t.instruction);
      setTimerRunning(Boolean(t.duration));
    }, 1000);

    // If no duration timer, show fail menu after 30s (increased from 25s)
    let timerId: number | undefined;
    if (!t.duration) {
      timerId = window.setTimeout(() => setFailMenu(true), 30000);
    }

    return () => {
      window.clearTimeout(instructionTimer);
      if (timerId) window.clearTimeout(timerId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, tasks, attempt]);

  const onTimerComplete = () => onSuccess();

  const onFailChoice = async (choice: "retry" | "skip" | "finish") => {
    setFailMenu(false);
    if (choice === "retry") {
      // Re-run the same step: restart timers/speech
      setAttempt((a) => a + 1);
      return;
    }
    if (choice === "skip") {
      await saveTaskPass(false);
      if (idx + 1 < tasks.length) setIdx(idx + 1);
      else onCompleteModule(false);
      return;
    }
    if (choice === "finish") {
      await onCompleteModule(false);
      return;
    }
  };

  const saveTaskPass = async (pass: boolean) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const t = tasks[idx];
      if (user && moduleAttemptId) {
        await supabase.from("module_task_attempts").insert({
          module_attempt_id: moduleAttemptId,
          task_name: t.name,
          is_pass: pass,
          duration_seconds: t.duration ?? 20,
          metrics: {},
        });
      }
    } catch {}
  };

  const onCompleteModule = async (completed: boolean) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user && moduleAttemptId && startTime) {
        const duration = (Date.now() - startTime) / 1000;
        await supabase
          .from("module_attempts")
          .update({ module_is_completed: completed, duration_seconds: duration, subtasks_total: 5 })
          .eq("id", moduleAttemptId);
      }
    } catch {}
    nav("/modules");
  };

  // Encouragement every 6s
  useEffect(() => {
    const id = window.setInterval(
      () => speak(encouragement[Math.floor(Math.random() * encouragement.length)]),
      6000
    );
    return () => window.clearInterval(id);
  }, [speak]);

  // MediaPipe and TensorFlow setup (initialize once on mount)
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    // Initialize TensorFlow.js backend
    const initTF = async () => {
      try {
        await tf.ready();
        console.log("TensorFlow backend:", tf.getBackend());
      } catch (error) {
        console.error("TensorFlow initialization error:", error);
      }
    };
    initTF();

    // Initialize MediaPipe Hands
    const hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });
    handsRef.current = hands;
    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    hands.onResults((results) => {
      handResultsRef.current = results;
    });

    // Initialize MediaPipe Pose
    const pose = new Pose({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
    });
    poseRef.current = pose;
    pose.setOptions({
      modelComplexity: 0,
      smoothLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    pose.onResults((results) => {
      poseResultsRef.current = results;
    });

    // Initialize MediaPipe FaceMesh
    const faceMesh = new FaceMesh({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
    });
    faceMeshRef.current = faceMesh;
    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    faceMesh.onResults((results) => {
      faceMeshResultsRef.current = results;
    });

    // Load COCO-SSD for bottle detection
    cocoSsd.load().then((model) => {
      bottleDetectorRef.current = model;
    });

    // Start camera
    const camera = new Camera(videoElement, {
      onFrame: async () => {
        // Safety check: only send if solutions are still active
        if (handsRef.current) {
          await handsRef.current.send({ image: videoElement });
        }
        if (poseRef.current) {
          await poseRef.current.send({ image: videoElement });
        }
        if (faceMeshRef.current) {
          await faceMeshRef.current.send({ image: videoElement });
        }
      },
      width: 640,
      height: 480,
    });
    cameraRef.current = camera;
    camera.start();

    return () => {
      // Stop camera first to prevent sending frames to deleted solutions
      if (cameraRef.current) {
        cameraRef.current.stop();
        cameraRef.current = null;
      }
      // Then close solutions
      if (handsRef.current) {
        handsRef.current.close();
        handsRef.current = null;
      }
      if (poseRef.current) {
        poseRef.current.close();
        poseRef.current = null;
      }
      if (faceMeshRef.current) {
        faceMeshRef.current.close();
        faceMeshRef.current = null;
      }
    };
  }, []); // Only run once on mount

  // Rendering loop (updates with task changes)
  useEffect(() => {
    const canvasElement = canvasRef.current;
    const videoElement = videoRef.current;
    const ctx = canvasElement?.getContext("2d");

    if (!canvasElement || !ctx || !videoElement) {
      return;
    }

    let animationFrameId: number;

    // Helper functions
    const distance = (p1: {x: number, y: number}, p2: {x: number, y: number}) => {
      return Math.hypot(p1.x - p2.x, p1.y - p2.y);
    };

    const getMouthCenter = (faceLandmarks: any, width: number, height: number) => {
      if (!faceLandmarks || faceLandmarks.length === 0) return null;
      const landmarks = faceLandmarks[0].landmark;
      if (!landmarks || landmarks.length < 15) return null;
      // Indices 13 (upper lip) and 14 (lower lip)
      const upper = landmarks[13];
      const lower = landmarks[14];
      return {
        x: ((upper.x + lower.x) / 2) * width,
        y: ((upper.y + lower.y) / 2) * height
      };
    };

    const getEarDistance = (poseLandmarks: any, width: number, height: number) => {
      if (!poseLandmarks || !poseLandmarks.landmark) return null;
      const leftEar = poseLandmarks.landmark[7];  // LEFT_EAR
      const rightEar = poseLandmarks.landmark[8]; // RIGHT_EAR
      if (!leftEar || !rightEar || leftEar.visibility < 0.5 || rightEar.visibility < 0.5) return null;
      return distance(
        {x: leftEar.x * width, y: leftEar.y * height},
        {x: rightEar.x * width, y: rightEar.y * height}
      );
    };

    const getIndexFingerTip = (handLandmarks: any, width: number, height: number) => {
      if (!handLandmarks || handLandmarks.length === 0) return null;
      const tip = handLandmarks[0][8]; // INDEX_FINGER_TIP
      return {x: tip.x * width, y: tip.y * height};
    };

    const checkNearMouth = (bottlePos: {x: number, y: number}, mouthPos: {x: number, y: number}, earDist: number, threshold: number = 0.8) => {
      const dist = distance(bottlePos, mouthPos);
      return dist <= threshold * earDist;
    };

    const checkGripStability = (handLandmarks: any, bottleBox: any, width: number, height: number) => {
      if (!handLandmarks || handLandmarks.length === 0 || !bottleBox) return false;
      const landmarks = handLandmarks[0];
      
      // Check if thumb (4) and index (8) are near bottle center
      const thumb = {x: landmarks[4].x * width, y: landmarks[4].y * height};
      const index = {x: landmarks[8].x * width, y: landmarks[8].y * height};
      const bottleCenter = {x: bottleBox.x + bottleBox.w / 2, y: bottleBox.y + bottleBox.h / 2};
      
      const thumbDist = distance(thumb, bottleCenter);
      const indexDist = distance(index, bottleCenter);
      const gripRadius = Math.max(bottleBox.w, bottleBox.h) * 0.6;
      
      return thumbDist < gripRadius && indexDist < gripRadius;
    };

    // Main rendering loop
    const renderFrame = async () => {
      const currentTask = tasks[idx];
      if (!currentTask) return;

      ctx.save();
      ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
      
      // Draw video frame
      if (handResultsRef.current?.image) {
        ctx.drawImage(handResultsRef.current.image, 0, 0, canvasElement.width, canvasElement.height);
      }

      const w = canvasElement.width;
      const h = canvasElement.height;

      // Detect bottle
      if (bottleDetectorRef.current && videoElement.readyState === 4) {
        const predictions = await bottleDetectorRef.current.detect(videoElement);
        const bottle = predictions.find(p => p.class === "bottle" || p.class === "cup");
        if (bottle) {
          bottlePosRef.current = {
            x: bottle.bbox[0],
            y: bottle.bbox[1],
            w: bottle.bbox[2],
            h: bottle.bbox[3]
          };
          
          // Draw bottle box
          ctx.strokeStyle = "#00FF00";
          ctx.lineWidth = 3;
          ctx.strokeRect(bottle.bbox[0], bottle.bbox[1], bottle.bbox[2], bottle.bbox[3]);
          ctx.fillStyle = "#00FF00";
          ctx.font = "16px sans-serif";
          ctx.fillText(`Bottle ${Math.round(bottle.score * 100)}%`, bottle.bbox[0], bottle.bbox[1] - 5);
        } else {
          bottlePosRef.current = null;
        }
      }

      // Draw hand landmarks
      if (handResultsRef.current?.multiHandLandmarks) {
        for (const landmarks of handResultsRef.current.multiHandLandmarks) {
          // Draw connections
          const connections = [
            [0, 1], [1, 2], [2, 3], [3, 4],
            [0, 5], [5, 6], [6, 7], [7, 8],
            [0, 9], [9, 10], [10, 11], [11, 12],
            [0, 13], [13, 14], [14, 15], [15, 16],
            [0, 17], [17, 18], [18, 19], [19, 20],
            [5, 9], [9, 13], [13, 17]
          ];
          
          ctx.strokeStyle = "#FF00FF";
          ctx.lineWidth = 2;
          for (const [start, end] of connections) {
            ctx.beginPath();
            ctx.moveTo(landmarks[start].x * w, landmarks[start].y * h);
            ctx.lineTo(landmarks[end].x * w, landmarks[end].y * h);
            ctx.stroke();
          }
          
          // Draw landmarks
          for (const landmark of landmarks) {
            ctx.beginPath();
            ctx.arc(landmark.x * w, landmark.y * h, 4, 0, 2 * Math.PI);
            ctx.fillStyle = "#FF00FF";
            ctx.fill();
          }
        }
      }

      // Task-specific logic
      const bottle = bottlePosRef.current;
      const handLandmarks = handResultsRef.current?.multiHandLandmarks;
      const indexTip = getIndexFingerTip(handLandmarks, w, h);
      const mouthPos = getMouthCenter(faceMeshResultsRef.current?.multiFaceLandmarks, w, h);
      const earDist = getEarDistance(poseResultsRef.current?.poseLandmarks, w, h);

      // Draw mouth indicator
      if (mouthPos) {
        ctx.beginPath();
        ctx.arc(mouthPos.x, mouthPos.y, 8, 0, 2 * Math.PI);
        ctx.fillStyle = "#FFFF00";
        ctx.fill();
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Task: reach_bottle
      if (currentTask.name === "reach_bottle" && bottle && indexTip && !taskCompletedRef.current) {
        if (!reachStartTimeRef.current) {
          reachStartTimeRef.current = Date.now();
          reachInitialHandPosRef.current = indexTip;
        }
        
        const bottleCenter = {x: bottle.x + bottle.w / 2, y: bottle.y + bottle.h / 2};
        const dist = distance(indexTip, bottleCenter);
        const threshold = Math.max(bottle.w, bottle.h) * 0.8;
        
        // Draw reach line
        ctx.beginPath();
        ctx.moveTo(indexTip.x, indexTip.y);
        ctx.lineTo(bottleCenter.x, bottleCenter.y);
        ctx.strokeStyle = dist < threshold ? "#00FF00" : "#FF0000";
        ctx.lineWidth = 2;
        ctx.stroke();
        
        if (dist < threshold) {
          taskCompletedRef.current = true;
          setTimeout(() => onSuccess(), 500);
        }
      }

      // Task: grab_hold
      if (currentTask.name === "grab_hold" && bottle && handLandmarks && !taskCompletedRef.current) {
        const isGripping = checkGripStability(handLandmarks, bottle, w, h);
        if (isGripping) {
          if (!gripStartTimeRef.current) {
            gripStartTimeRef.current = Date.now();
          }
          const elapsed = (Date.now() - gripStartTimeRef.current) / 1000;
          if (elapsed >= 2) {
            taskCompletedRef.current = true;
            setTimeout(() => onSuccess(), 500);
          }
        } else {
          gripStartTimeRef.current = null;
        }
      }

      // Task: lift_to_mouth / hold_at_mouth
      if ((currentTask.name === "lift_to_mouth" || currentTask.name === "hold_at_mouth") && bottle && mouthPos && earDist && !taskCompletedRef.current) {
        const bottleCenter = {x: bottle.x + bottle.w / 2, y: bottle.y + bottle.h / 2};
        const nearMouth = checkNearMouth(bottleCenter, mouthPos, earDist);
        
        // Draw proximity circle
        ctx.beginPath();
        ctx.arc(mouthPos.x, mouthPos.y, earDist * 0.8, 0, 2 * Math.PI);
        ctx.strokeStyle = nearMouth ? "#00FF00" : "#FF0000";
        ctx.lineWidth = 2;
        ctx.stroke();
        
        if (nearMouth) {
          if (currentTask.name === "lift_to_mouth") {
            taskCompletedRef.current = true;
            setTimeout(() => onSuccess(), 500);
          } else if (currentTask.name === "hold_at_mouth") {
            if (!mouthHoldStartRef.current) {
              mouthHoldStartRef.current = Date.now();
            }
            // Timer will handle success
          }
        } else {
          mouthHoldStartRef.current = null;
        }
      }

      ctx.restore();
      animationFrameId = requestAnimationFrame(renderFrame);
    };

    // Start rendering
    renderFrame();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [idx, tasks]); // Re-render when task changes

  const t = tasks[idx];

  return (
    <main className="min-h-screen relative" style={{ background: "hsl(var(--accent-modules) / 0.06)" }}>

      <AppHeader
        mode="page"
        title="Modules"
        centerIcon={<BookOpen />}
        onBack={() => nav(`/modules/${slug}/info`)}
        onHelp={() => {}}
        accentVar="--accent-modules"
      />

      <div className="absolute inset-0 -z-10 bg-black/40" />

      {/* Live camera area */}
      <div className="container mx-auto p-4">
        <div className="relative w-full h-[60vh] bg-black/70 rounded-2xl overflow-hidden flex items-center justify-center">
          <video ref={videoRef} className="hidden" />
          <canvas ref={canvasRef} width={640} height={480} className="max-w-full max-h-full object-contain" />
          
          {/* Instruction overlay - absolutely positioned for visibility */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur px-6 py-3 rounded-full text-lg font-semibold shadow-lg border-2 border-black z-10">
            {t?.instruction}
          </div>
          
          {/* Task status indicator */}
          <div className="absolute bottom-4 left-4 bg-black/80 text-white px-4 py-2 rounded-lg text-sm">
            Task {idx + 1} of {tasks.length}: {t?.name}
          </div>
        </div>
      </div>

      {t?.duration ? <CircularTimer seconds={t.duration} running={timerRunning} onComplete={onTimerComplete} /> : null}

      {/* Failure menu */}
      {failMenu && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70">
          <div className="bg-card rounded-xl p-6 w-[90%] max-w-md space-y-3">
            <div className="text-xl font-bold">Need a hand?</div>
            <div className="text-muted-foreground">Choose an option:</div>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => onFailChoice("retry")}>Try Again</Button>
              <Button variant="secondary" onClick={() => onFailChoice("skip")}>I succeeded (skip)</Button>
              <Button onClick={() => onFailChoice("finish")}>Finish</Button>
            </div>
          </div>
        </div>
      )}

      {/* Congrats flash */}
      {showCongrats && (
        <div className="fixed inset-0 z-40 flex items-center justify-center" style={{ background: "hsl(var(--accent-progress))" }}>
          <div className="text-white text-4xl font-extrabold flex items-center gap-3">
            <CheckCircle2 size={44} /> {showCongrats}
          </div>
        </div>
      )}
    </main>
  );
};

export default ModuleRun;
