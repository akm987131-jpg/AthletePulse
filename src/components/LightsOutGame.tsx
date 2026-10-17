"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";

export type GameState =
  | "idle"
  | "countdown"
  | "waiting"
  | "go"
  | "false-start"
  | "round-result"
  | "session-complete";

export interface SessionHistoryItem {
  _id: string;
  reactionTimes: number[];
  averageTime: number;
  bestTime: number;
  falseStartCount: number;
  completedRounds: number;
  inputMethod: string;
  status: string;
  createdAt: string;
}

interface LightsOutGameProps {
  athleteName?: string;
  onSessionComplete?: () => void;
}

export default function LightsOutGame({
  athleteName = "Athlete",
  onSessionComplete,
}: LightsOutGameProps) {
  // Game state machine
  const [gameState, setGameState] = useState<GameState>("idle");
  const [currentRound, setCurrentRound] = useState<number>(1);
  const [litRedCount, setLitRedCount] = useState<number>(0);
  const [roundReactionTimes, setRoundReactionTimes] = useState<number[]>([]);
  const [lastReactionTime, setLastReactionTime] = useState<number | null>(null);
  const [falseStartCount, setFalseStartCount] = useState<number>(0);
  const [totalAttempts, setTotalAttempts] = useState<number>(0);
  const [lastInputMethod, setLastInputMethod] = useState<"mouse" | "touch" | "keyboard">("mouse");
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  // Stats & History
  const [history, setHistory] = useState<SessionHistoryItem[]>([]);
  const [stats, setStats] = useState<{
    allTimeBest: number | null;
    overallAverage: number | null;
    totalSessions: number;
  }>({
    allTimeBest: null,
    overallAverage: null,
    totalSessions: 0,
  });

  // Safe timing & session management refs
  const sessionTokenRef = useRef<number>(0);
  const timersRef = useRef<NodeJS.Timeout[]>([]);
  const greenTimestampRef = useRef<number>(0);
  const inputHandledRef = useRef<boolean>(false);

  const TOTAL_ROUNDS = 5;
  const MAX_ATTEMPTS = 12; // Prevents endless false-start loops

  // Clear all active timers safely
  const clearAllTimers = useCallback(() => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
  }, []);

  // Fetch athlete's past reaction history and stats
  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/reaction-sessions?limit=10");
      const json = await res.json();
      if (json.success && json.data) {
        setHistory(json.data.sessions || []);
        if (json.data.stats) {
          setStats(json.data.stats);
        }
      }
    } catch (err) {
      console.warn("Could not load reaction history:", err);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
    return () => {
      clearAllTimers();
    };
  }, [fetchHistory, clearAllTimers]);

  // Handle browser tab visibility changes safely
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Invalidate active countdown/waiting to prevent desynced background triggers
        sessionTokenRef.current++;
        clearAllTimers();
        if (gameState === "countdown" || gameState === "waiting") {
          setGameState("idle");
          setLitRedCount(0);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [gameState, clearAllTimers]);

  // Start a fresh 5-round game session
  const startNewSession = () => {
    sessionTokenRef.current++;
    clearAllTimers();
    setRoundReactionTimes([]);
    setLastReactionTime(null);
    setFalseStartCount(0);
    setTotalAttempts(0);
    setCurrentRound(1);
    setSaveSuccess(false);
    startRoundSequence(1);
  };

  // Start an individual round countdown
  const startRoundSequence = (roundNumber: number) => {
    const currentToken = ++sessionTokenRef.current;
    clearAllTimers();
    inputHandledRef.current = false;
    setLitRedCount(0);
    setGameState("countdown");
    setCurrentRound(roundNumber);
    setTotalAttempts((prev) => prev + 1);

    // Sequence the 5 red lights (every 500ms)
    for (let i = 1; i <= 5; i++) {
      const timer = setTimeout(() => {
        if (sessionTokenRef.current !== currentToken) return;
        setLitRedCount(i);

        // When all 5 lights are lit, transition to randomized waiting delay
        if (i === 5) {
          const waitingTimer = setTimeout(() => {
            if (sessionTokenRef.current !== currentToken) return;
            setGameState("waiting");

            // Randomized delay between 1.5s (1500ms) and 3.5s (3500ms)
            const randomDelay = Math.floor(Math.random() * 2000) + 1500;

            const goTimer = setTimeout(() => {
              if (sessionTokenRef.current !== currentToken) return;
              // Transition to GO: Lights extinguish or turn GREEN!
              setLitRedCount(0);
              greenTimestampRef.current = performance.now();
              inputHandledRef.current = false;
              setGameState("go");
            }, randomDelay);

            timersRef.current.push(goTimer);
          }, 500);

          timersRef.current.push(waitingTimer);
        }
      }, i * 500);

      timersRef.current.push(timer);
    }
  };

  // Record athlete interaction (click, tap, or keydown)
  const handleActivation = (method: "mouse" | "touch" | "keyboard") => {
    const activationTime = performance.now();
    setLastInputMethod(method);

    // Prevent duplicate triggers
    if (inputHandledRef.current) return;

    // Case 1: Early click during countdown or waiting -> FALSE START!
    if (gameState === "countdown" || gameState === "waiting") {
      inputHandledRef.current = true;
      sessionTokenRef.current++;
      clearAllTimers();
      setFalseStartCount((prev) => prev + 1);
      setGameState("false-start");
      return;
    }

    // Case 2: Valid reaction during GO state
    if (gameState === "go") {
      // Guard against race conditions where activation occurred before start timestamp was stamped
      if (greenTimestampRef.current <= 0 || activationTime < greenTimestampRef.current) {
        return;
      }

      inputHandledRef.current = true;
      const reactionMs = Math.round(activationTime - greenTimestampRef.current);
      setLastReactionTime(reactionMs);

      const nextTimes = [...roundReactionTimes, reactionMs];
      setRoundReactionTimes(nextTimes);

      if (nextTimes.length >= TOTAL_ROUNDS) {
        // Completed all 5 rounds!
        setGameState("session-complete");
        saveSessionToDatabase(nextTimes, falseStartCount, method);
      } else {
        setGameState("round-result");
      }
    }
  };

  // Keyboard support (Spacebar or Enter)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.key === " " || e.key === "Enter") {
        // Prevent default spacebar page scrolling
        e.preventDefault();
        if (
          gameState === "countdown" ||
          gameState === "waiting" ||
          gameState === "go"
        ) {
          handleActivation("keyboard");
        } else if (gameState === "round-result") {
          startRoundSequence(currentRound + 1);
        } else if (gameState === "false-start") {
          retryCurrentRound();
        } else if (gameState === "idle") {
          startNewSession();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  });

  // Retry round after a false start
  const retryCurrentRound = () => {
    if (totalAttempts >= MAX_ATTEMPTS) {
      alert("Maximum attempts reached for this session due to repeated false starts. Please start a fresh session.");
      setGameState("idle");
      return;
    }
    startRoundSequence(currentRound);
  };

  // Save completed session to the database
  const saveSessionToDatabase = async (
    times: number[],
    falseStarts: number,
    method: "mouse" | "touch" | "keyboard"
  ) => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/v1/reaction-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reactionTimes: times,
          falseStartCount: falseStarts,
          completedRounds: times.length,
          inputMethod: method,
          status: "completed",
        }),
      });
      const json = await res.json();
      if (json.success) {
        setSaveSuccess(true);
        await fetchHistory();
        if (onSessionComplete) onSessionComplete();
      }
    } catch (err) {
      console.error("Failed to save reaction test session:", err);
    } finally {
      setIsSaving(false);
    }
  };

  // Reaction rating tier calculation
  const getReactionTier = (ms: number) => {
    if (ms < 200) return { label: "⚡ F1 CHAMPION LEVEL", color: "text-cyan-400 bg-cyan-950/80 border-cyan-400" };
    if (ms < 240) return { label: "🚀 ELITE PRO REFLEX", color: "text-emerald-400 bg-emerald-950/80 border-emerald-400" };
    if (ms < 290) return { label: "🎯 STRONG ATHLETIC", color: "text-blue-400 bg-blue-950/80 border-blue-400" };
    if (ms < 350) return { label: "⏳ AVERAGE RESPONSE", color: "text-amber-400 bg-amber-950/80 border-amber-400" };
    return { label: "💤 SLUGGISH / TIRED", color: "text-rose-400 bg-rose-950/80 border-rose-400" };
  };

  const sessionAverage =
    roundReactionTimes.length > 0
      ? Math.round(
          roundReactionTimes.reduce((sum, t) => sum + t, 0) /
            roundReactionTimes.length
        )
      : null;

  const sessionBest =
    roundReactionTimes.length > 0 ? Math.min(...roundReactionTimes) : null;

  return (
    <div className="space-y-6">
      {/* RETRO ARCADE CONTAINER */}
      <div className="relative rounded-3xl bg-[#090d1a] border-2 border-cyan-500/40 p-5 md:p-8 text-white shadow-[0_0_35px_rgba(0,240,255,0.18)] overflow-hidden">
        {/* Retro Grid Background Overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#00f0ff08_1px,transparent_1px),linear-gradient(to_bottom,#00f0ff08_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

        {/* Top Header Bar */}
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b border-cyan-500/20 pb-4 mb-6">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-xl bg-cyan-500/10 border border-cyan-400/50 flex items-center justify-center text-cyan-400 text-xl font-black shadow-[0_0_15px_rgba(0,240,255,0.4)]">
              🏎️
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-xl md:text-2xl font-black tracking-wider text-cyan-300 font-mono">
                  LIGHTS OUT!
                </h2>
                <span className="bg-magenta-500/20 text-[#ff007f] border border-[#ff007f]/50 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full uppercase tracking-widest shadow-[0_0_10px_rgba(255,0,127,0.3)]">
                  F1 REACTION TEST
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                5-Round Neuromuscular Reaction Benchmark • Formula 1 Gantry Sequence
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3 font-mono text-xs">
            <div className="bg-slate-900/90 border border-slate-700/80 px-3 py-1.5 rounded-xl">
              <span className="text-slate-400 block text-[10px]">ALL-TIME BEST</span>
              <span className="text-cyan-400 font-bold">
                {stats.allTimeBest ? `${stats.allTimeBest} ms` : "---"}
              </span>
            </div>
            <div className="bg-slate-900/90 border border-slate-700/80 px-3 py-1.5 rounded-xl">
              <span className="text-slate-400 block text-[10px]">ROUND</span>
              <span className="text-[#ff007f] font-bold">
                {roundReactionTimes.length} / {TOTAL_ROUNDS}
              </span>
            </div>
          </div>
        </div>

        {/* F1 FIVE-LIGHT STARTING GANTRY */}
        <div className="relative z-10 my-6 bg-slate-950/90 border-2 border-slate-800 rounded-2xl p-5 shadow-inner">
          <div className="text-center mb-3">
            <span className="text-[11px] font-mono font-bold text-slate-500 uppercase tracking-widest">
              FIA STARTING GANTRY SYSTEM
            </span>
          </div>

          <div className="flex justify-center items-center gap-2 md:gap-4">
            {[1, 2, 3, 4, 5].map((podIndex) => {
              const isRedLit =
                (gameState === "countdown" || gameState === "waiting") &&
                litRedCount >= podIndex;
              const isGreenLit = gameState === "go";

              return (
                <div
                  key={podIndex}
                  className="w-14 sm:w-20 md:w-24 bg-gradient-to-b from-neutral-900 to-black p-2.5 rounded-2xl border-2 border-neutral-700/80 flex flex-col items-center space-y-3 shadow-2xl"
                >
                  {/* Top Gantry Mount Pins */}
                  <div className="flex space-x-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-600"></span>
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-600"></span>
                  </div>

                  {/* Main Red Lamp */}
                  <div
                    className={`w-10 h-10 sm:w-14 sm:h-14 rounded-full transition-all duration-75 flex items-center justify-center border-2 ${
                      isRedLit
                        ? "bg-rose-600 border-rose-300 shadow-[0_0_30px_#ff0033] scale-105"
                        : "bg-rose-950/40 border-neutral-800 opacity-30"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 sm:w-6 sm:h-6 rounded-full ${
                        isRedLit
                          ? "bg-rose-200 shadow-[0_0_12px_#ffffff]"
                          : "bg-transparent"
                      }`}
                    />
                  </div>

                  {/* Main Green Launch Lamp */}
                  <div
                    className={`w-10 h-10 sm:w-14 sm:h-14 rounded-full transition-all duration-75 flex items-center justify-center border-2 ${
                      isGreenLit
                        ? "bg-emerald-500 border-emerald-200 shadow-[0_0_35px_#00ff66] scale-110 animate-pulse"
                        : "bg-emerald-950/30 border-neutral-800 opacity-20"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 sm:w-6 sm:h-6 rounded-full ${
                        isGreenLit
                          ? "bg-emerald-100 shadow-[0_0_15px_#ffffff]"
                          : "bg-transparent"
                      }`}
                    />
                  </div>

                  {/* Pod Number Label */}
                  <span className="font-mono text-[9px] text-neutral-500 font-bold">
                    P{podIndex}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* INTERACTIVE LAUNCH / REACTION PAD */}
        <div className="relative z-10 mt-6">
          {/* IDLE STATE */}
          {gameState === "idle" && (
            <div className="bg-slate-900/80 border border-cyan-500/30 rounded-2xl p-6 text-center space-y-4">
              <div className="max-w-md mx-auto space-y-2">
                <h3 className="text-lg font-bold text-cyan-300 font-mono">
                  READY TO RACE, {athleteName.toUpperCase()}?
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  1. Click <b>"START RACE"</b> or press <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-600 text-cyan-400 font-mono text-[10px]">SPACE</kbd>.<br />
                  2. Watch the 5 red lights illuminate one by one.<br />
                  3. When the lights go green, <b>TAP / CLICK / PRESS SPACE</b> as fast as humanly possible!<br />
                  4. Jump early = <b>FALSE START penalty</b>.
                </p>
              </div>

              <button
                onClick={startNewSession}
                className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black font-mono text-sm px-8 py-4 rounded-xl shadow-[0_0_25px_rgba(0,240,255,0.5)] transition-all transform hover:scale-105 active:scale-95 cursor-pointer uppercase tracking-wider"
              >
                🏁 Start Race (Round 1 of 5)
              </button>
            </div>
          )}

          {/* COUNTDOWN & WAITING STATES (ACTIVE TIMING PAD) */}
          {(gameState === "countdown" || gameState === "waiting") && (
            <div
              onClick={() => handleActivation("mouse")}
              onTouchStart={() => handleActivation("touch")}
              className="bg-rose-950/20 border-2 border-rose-500/50 hover:border-rose-400 rounded-2xl p-10 text-center cursor-pointer select-none transition-all hover:bg-rose-950/30 shadow-[0_0_30px_rgba(255,0,50,0.15)] group"
            >
              <div className="animate-pulse space-y-2">
                <div className="text-3xl">🔴</div>
                <h3 className="text-xl font-black font-mono text-rose-400 tracking-wider">
                  {gameState === "countdown" ? "STAND BY... LIGHTS ARMING" : "HOLD... HOLD... DO NOT JUMP!"}
                </h3>
                <p className="text-xs text-rose-300 font-mono">
                  Tap / click now will cause a <b>FALSE START</b>. Wait for GREEN!
                </p>
              </div>
            </div>
          )}

          {/* GO STATE (REACTION WINDOW) */}
          {gameState === "go" && (
            <div
              onClick={() => handleActivation("mouse")}
              onTouchStart={() => handleActivation("touch")}
              className="bg-emerald-950/80 border-4 border-emerald-400 rounded-2xl p-12 text-center cursor-pointer select-none shadow-[0_0_50px_#00ff66] animate-pulse active:scale-98 transition-all"
            >
              <div className="space-y-3">
                <div className="text-5xl animate-bounce">🟢</div>
                <h3 className="text-3xl md:text-5xl font-black font-mono text-emerald-300 tracking-widest drop-shadow-[0_0_20px_#00ff66]">
                  LIGHTS OUT! GO! GO! GO!
                </h3>
                <p className="text-sm font-black font-mono text-emerald-200 uppercase tracking-widest">
                  TAP SCREEN OR HIT SPACEBAR NOW!
                </p>
              </div>
            </div>
          )}

          {/* FALSE START STATE */}
          {gameState === "false-start" && (
            <div className="bg-rose-950/90 border-2 border-rose-500 rounded-2xl p-6 text-center space-y-4 shadow-[0_0_30px_rgba(255,0,50,0.4)]">
              <div className="space-y-1">
                <span className="text-3xl">⚠️</span>
                <h3 className="text-xl font-black font-mono text-rose-400 tracking-wider uppercase">
                  FALSE START! JUMPED THE LIGHTS!
                </h3>
                <p className="text-xs text-rose-200">
                  You triggered before the green launch signal. Round {currentRound} invalidated.
                </p>
                <div className="inline-block mt-2 bg-rose-900/60 border border-rose-500/60 px-3 py-1 rounded-full text-[11px] font-mono text-rose-300">
                  Total False Starts This Session: {falseStartCount}
                </div>
              </div>

              <div>
                <button
                  onClick={retryCurrentRound}
                  className="bg-rose-600 hover:bg-rose-500 text-white font-bold font-mono text-xs px-6 py-3 rounded-xl shadow-lg transition-transform hover:scale-105 uppercase"
                >
                  🔄 Retry Round {currentRound} (Press Space)
                </button>
              </div>
            </div>
          )}

          {/* ROUND RESULT STATE */}
          {gameState === "round-result" && lastReactionTime !== null && (
            <div className="bg-slate-900/90 border border-cyan-500/50 rounded-2xl p-6 text-center space-y-4 shadow-[0_0_25px_rgba(0,240,255,0.2)]">
              <div className="space-y-2">
                <span className="text-xs font-mono text-cyan-400 uppercase tracking-widest">
                  Round {currentRound} Recorded
                </span>
                <div className="text-4xl md:text-6xl font-black font-mono text-cyan-300 tracking-tight">
                  {lastReactionTime} <span className="text-2xl text-cyan-500">ms</span>
                </div>
                <div>
                  <span
                    className={`inline-block text-xs font-mono font-bold px-3 py-1 rounded-full border ${
                      getReactionTier(lastReactionTime).color
                    }`}
                  >
                    {getReactionTier(lastReactionTime).label}
                  </span>
                </div>
              </div>

              {/* Rounds Tracker Pills */}
              <div className="flex justify-center items-center gap-2 py-2">
                {[1, 2, 3, 4, 5].map((idx) => {
                  const time = roundReactionTimes[idx - 1];
                  return (
                    <div
                      key={idx}
                      className={`px-3 py-1.5 rounded-lg border font-mono text-xs ${
                        time
                          ? "bg-cyan-950/60 border-cyan-500 text-cyan-300"
                          : idx === currentRound + 1
                          ? "bg-slate-800 border-slate-600 text-slate-300 animate-pulse"
                          : "bg-slate-950/60 border-slate-800 text-slate-600"
                      }`}
                    >
                      R{idx}: {time ? `${time}ms` : "---"}
                    </div>
                  );
                })}
              </div>

              <div>
                <button
                  onClick={() => startRoundSequence(currentRound + 1)}
                  className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black font-mono text-xs px-6 py-3 rounded-xl shadow-[0_0_20px_rgba(0,240,255,0.4)] transition-transform hover:scale-105 uppercase"
                >
                  Next Round {currentRound + 1} of 5 → (Press Space)
                </button>
              </div>
            </div>
          )}

          {/* SESSION COMPLETE STATE */}
          {gameState === "session-complete" && (
            <div className="bg-gradient-to-b from-slate-900 to-black border-2 border-cyan-400 rounded-2xl p-6 md:p-8 text-center space-y-6 shadow-[0_0_40px_rgba(0,240,255,0.3)]">
              <div className="space-y-1">
                <span className="text-4xl">🏆</span>
                <h3 className="text-2xl font-black font-mono text-cyan-300 tracking-wider uppercase">
                  CHEQUERED FLAG! 5 ROUNDS COMPLETE
                </h3>
                <p className="text-xs text-slate-400">
                  Neuromuscular reaction benchmark session finalized.
                </p>
              </div>

              {/* Session Metrics Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-slate-900/90 border border-cyan-500/30 p-4 rounded-xl">
                  <span className="text-[10px] font-mono text-slate-400 block uppercase">
                    Session Best
                  </span>
                  <span className="text-3xl font-black font-mono text-cyan-300">
                    {sessionBest} <span className="text-sm text-cyan-500">ms</span>
                  </span>
                </div>

                <div className="bg-slate-900/90 border border-cyan-500/30 p-4 rounded-xl">
                  <span className="text-[10px] font-mono text-slate-400 block uppercase">
                    Session Average
                  </span>
                  <span className="text-3xl font-black font-mono text-[#ff007f]">
                    {sessionAverage} <span className="text-sm text-[#ff007f]/70">ms</span>
                  </span>
                </div>

                <div className="bg-slate-900/90 border border-cyan-500/30 p-4 rounded-xl">
                  <span className="text-[10px] font-mono text-slate-400 block uppercase">
                    False Starts
                  </span>
                  <span
                    className={`text-3xl font-black font-mono ${
                      falseStartCount === 0 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {falseStartCount}
                  </span>
                </div>
              </div>

              {/* Round by Round Breakdown */}
              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                <span className="text-[10px] font-mono text-slate-500 block uppercase mb-2">
                  Round Times Breakdown
                </span>
                <div className="flex flex-wrap justify-center gap-2">
                  {roundReactionTimes.map((time, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono text-cyan-300"
                    >
                      R{idx + 1}: <b>{time}ms</b>
                    </span>
                  ))}
                </div>
              </div>

              {/* Database Save Status */}
              <div className="text-xs font-mono">
                {isSaving ? (
                  <span className="text-cyan-400 animate-pulse">
                    ⏳ Synchronizing benchmark to database...
                  </span>
                ) : saveSuccess ? (
                  <span className="text-emerald-400 font-bold">
                    ✓ Saved to your athlete profile benchmarks!
                  </span>
                ) : (
                  <span className="text-slate-400">
                    Session captured (Input: {lastInputMethod})
                  </span>
                )}
              </div>

              <div>
                <button
                  onClick={startNewSession}
                  className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black font-mono text-xs px-8 py-3.5 rounded-xl shadow-[0_0_20px_rgba(0,240,255,0.5)] transition-transform hover:scale-105 uppercase"
                >
                  🎮 Race Again (New Session)
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Medical & Driving Safety Disclaimer */}
        <div className="mt-6 pt-4 border-t border-slate-800/80 text-[10px] font-mono text-slate-500 text-center">
          ℹ️ <b>Athletic Benchmark Only:</b> This reaction time challenge is a sports wellness drill. It is not a clinical neurological assessment and does not constitute evidence of driving fitness or operating safety.
        </div>
      </div>

      {/* SESSION HISTORY & PROGRESS SECTION */}
      <div className="dash-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h3 className="font-extrabold text-sm text-slate-900">
              Personal Reaction History & Benchmarks
            </h3>
            <p className="text-xs text-slate-400">
              Track your neuromuscular speed and focus over training cycles.
            </p>
          </div>
          <span className="text-xs font-bold text-slate-500 font-mono">
            Total Sessions: {stats.totalSessions}
          </span>
        </div>

        {/* Lifetime Stats Bar */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
            <span className="text-[10px] font-bold text-slate-400 uppercase block">
              Personal Best (All-Time)
            </span>
            <span className="text-xl font-black text-cyan-600 font-mono">
              {stats.allTimeBest ? `${stats.allTimeBest} ms` : "---"}
            </span>
          </div>

          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
            <span className="text-[10px] font-bold text-slate-400 uppercase block">
              Average Across Sessions
            </span>
            <span className="text-xl font-black text-slate-800 font-mono">
              {stats.overallAverage ? `${stats.overallAverage} ms` : "---"}
            </span>
          </div>

          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 col-span-2 md:col-span-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase block">
              Consistency Rating
            </span>
            <span className="text-xl font-black text-emerald-600 font-mono">
              {stats.allTimeBest && stats.overallAverage
                ? `${Math.max(0, 100 - Math.round(((stats.overallAverage - stats.allTimeBest) / stats.overallAverage) * 100))}%`
                : "---"}
            </span>
          </div>
        </div>

        {/* Recent Session History Table */}
        {history.length === 0 ? (
          <p className="text-xs text-slate-400 py-6 text-center">
            No completed sessions recorded yet. Click "Start Race" above to log your first 5-round benchmark!
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] text-slate-400 uppercase tracking-wider font-mono">
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Best Round</th>
                  <th className="py-2.5 px-3">Session Avg</th>
                  <th className="py-2.5 px-3">False Starts</th>
                  <th className="py-2.5 px-3">Input</th>
                  <th className="py-2.5 px-3">Rounds</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {history.map((item) => (
                  <tr key={item._id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-2.5 px-3 text-slate-600">
                      {new Date(item.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-cyan-600">
                      {item.bestTime} ms
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-800">
                      {item.averageTime} ms
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          item.falseStartCount === 0
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-rose-100 text-rose-700"
                        }`}
                      >
                        {item.falseStartCount}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 capitalize text-slate-500">
                      {item.inputMethod}
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                      {item.reactionTimes?.join(", ")} ms
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
