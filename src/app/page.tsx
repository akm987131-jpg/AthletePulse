"use client";

import React, { useState, useEffect } from "react";
import LightsOutGame from "@/components/LightsOutGame";

// Types
interface UserProfile {
  _id: string;
  name: string;
  email: string;
  role: "athlete" | "coach";
  sport?: string;
  coachId?: string;
}

interface DailyLogItem {
  _id: string;
  athleteId: string;
  workoutDescription: string;
  discomfortText: string;
  activity?: string;
  affectedBodyPart?: string;
  bodySide?: string;
  symptomType?: string;
  onset?: string;
  reportedSeverity: number;
  extractionConfidence?: number;
  extractionStatus?: string;
  reviewPriority: "low" | "medium" | "high" | "urgent";
  reviewStatus: "pending" | "reviewed" | "flagged";
  triageFlags?: string[];
  emergencyGuidance?: string;
  createdAt: string;
  athleteName?: string;
  athleteSport?: string;
}

interface CoachFeedbackItem {
  _id: string;
  logId?: any;
  coachId?: any;
  athleteId?: any;
  message?: string;
  comments?: string;
  activityModification?: string;
  recommendedAction?: string;
  reviewStatus?: "pending" | "reviewed" | "flagged";
  acknowledgementStatus?: "pending" | "acknowledged";
  acknowledgedByAthlete?: boolean;
  acknowledgedAt?: string;
  createdAt: string;
}

type NavTab = "dashboard" | "logs" | "feedback" | "arcade" | "performance" | "analytics" | "api" | "login";

export default function AthletePulseApp() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<NavTab>("dashboard");
  const [notice, setNotice] = useState<string | null>(null);

  // Core Data
  const [myLogs, setMyLogs] = useState<DailyLogItem[]>([]);
  const [feedbacks, setFeedbacks] = useState<CoachFeedbackItem[]>([]);
  const [coachQueue, setCoachQueue] = useState<DailyLogItem[]>([]);
  const [assignedAthletes, setAssignedAthletes] = useState<any[]>([]);
  const [coachPerformanceSessions, setCoachPerformanceSessions] = useState<any[]>([]);
  const [selectedPerfAthleteFilter, setSelectedPerfAthleteFilter] = useState<string>("all");
  const [coachCounts, setCoachCounts] = useState({
    totalAssignedAthletes: 0,
    pendingReviewsCount: 0,
    flaggedLogsCount: 0,
  });

  // Modal & Form State for Daily Log
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    workoutDescription: "",
    discomfortText: "",
    activity: "swimming",
    affectedBodyPart: "shoulder",
    bodySide: "right",
    symptomType: "sharp pain",
    onset: "acute",
    reportedSeverity: 6,
  });

  // Login Tab State
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [customEmail, setCustomEmail] = useState("");
  const [customPassword, setCustomPassword] = useState("");
  const [regName, setRegName] = useState("");
  const [regRole, setRegRole] = useState<"athlete" | "coach">("athlete");
  const [regSport, setRegSport] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);

  // Inline Feedback for Coach
  const [feedbackInputs, setFeedbackInputs] = useState<
    Record<string, { comments: string; action: "rest" | "modify" | "physio" | "continue" }>
  >({});
  const [submittingLogId, setSubmittingLogId] = useState<string | null>(null);

  const showNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 4000);
  };

  // Initial Auth Check
  useEffect(() => {
    async function init() {
      try {
        const res = await fetch("/api/v1/auth/me");
        const json = await res.json();
        if (json.success && json.data?.user) {
          setUser(json.data.user);
          await loadData(json.data.user);
        } else {
          // Auto-login as Elena Rostova by default for seamless hackathon testing
          await quickLogin("elena.swimmer@athletepulse.test", false);
        }
      } catch (e) {
        console.error("Auth init error:", e);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  const loadData = async (u: UserProfile) => {
    try {
      if (u.role === "athlete") {
        const [lRes, fRes] = await Promise.all([
          fetch("/api/v1/logs/mine?limit=50"),
          fetch("/api/v1/feedback/mine"),
        ]);
        const lData = await lRes.json();
        const fData = await fRes.json();
        if (lData.success) setMyLogs(lData.data || []);
        if (fData.success) setFeedbacks(fData.data || []);
      } else {
        const [cRes, aRes, pRes] = await Promise.all([
          fetch("/api/v1/coach/dashboard?limit=50"),
          fetch("/api/v1/coach/athletes"),
          fetch("/api/v1/coach/reaction-sessions?limit=50"),
        ]);
        const cData = await cRes.json();
        const aData = await aRes.json();
        const pData = await pRes.json();
        if (cData.success) {
          setCoachQueue(cData.data.logsQueue || []);
          setCoachCounts(cData.data.counts || { totalAssignedAthletes: 0, pendingReviewsCount: 0, flaggedLogsCount: 0 });
        }
        if (aData.success) {
          setAssignedAthletes(aData.data || []);
        }
        if (pData.success) {
          setCoachPerformanceSessions(pData.data?.sessions || []);
        }
      }
    } catch (err) {
      console.error("Error loading user data:", err);
    }
  };

  const quickLogin = async (email: string, redirectToDash: boolean = true) => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: "password123" }),
      });
      const data = await res.json();
      if (data.success && data.data?.user) {
        setUser(data.data.user);
        await loadData(data.data.user);
        showNotice(`Active Persona: ${data.data.user.name} (${data.data.user.role.toUpperCase()})`);
        if (redirectToDash) {
          setActiveTab("dashboard");
        }
      } else {
        showNotice(`Login failed: ${data.error || "Unknown"}`);
      }
    } catch (err: any) {
      showNotice(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCustomLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customEmail || !customPassword) {
      setAuthError("Please provide both email and password.");
      return;
    }
    setAuthError(null);
    setIsSubmittingAuth(true);
    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: customEmail, password: customPassword }),
      });
      const data = await res.json();
      if (data.success && data.data?.user) {
        setUser(data.data.user);
        await loadData(data.data.user);
        showNotice(`Logged in as ${data.data.user.name}!`);
        setActiveTab("dashboard");
      } else {
        setAuthError(data.error?.message || data.error || "Invalid email or password.");
      }
    } catch (err: any) {
      setAuthError("Network error: " + err.message);
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  const handleCustomRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName || !customEmail || !customPassword) {
      setAuthError("Please fill in all required fields.");
      return;
    }
    setAuthError(null);
    setIsSubmittingAuth(true);
    try {
      const res = await fetch("/api/v1/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: regName,
          email: customEmail,
          password: customPassword,
          role: regRole,
          sport: regSport || undefined,
        }),
      });
      const data = await res.json();
      if (data.success && data.data?.user) {
        setUser(data.data.user);
        await loadData(data.data.user);
        showNotice(`Account created! Logged in as ${data.data.user.name}`);
        setActiveTab("dashboard");
      } else {
        setAuthError(data.error?.message || data.error || "Registration failed.");
      }
    } catch (err: any) {
      setAuthError("Network error: " + err.message);
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/v1/auth/logout", { method: "POST" });
    setUser(null);
    setMyLogs([]);
    setCoachQueue([]);
    setFeedbacks([]);
    showNotice("Signed out successfully.");
    setActiveTab("login");
  };

  const handleCreateLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.workoutDescription || !formData.discomfortText) {
      alert("Please provide both workout and discomfort details.");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/v1/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const json = await res.json();
      if (json.success) {
        showNotice("Discomfort report recorded! Hotspot updated & forwarded to Coach Marcus for triage.");
        setIsModalOpen(false);
        if (user) await loadData(user);
        setFormData({
          workoutDescription: "",
          discomfortText: "",
          activity: "swimming",
          affectedBodyPart: "shoulder",
          bodySide: "right",
          symptomType: "sharp pain",
          onset: "acute",
          reportedSeverity: 6,
        });
      } else {
        const errorMsg =
          typeof json.error === "object"
            ? json.error?.message || JSON.stringify(json.error)
            : json.error || "Failed to create log";
        alert(errorMsg);
      }
    } catch (err: any) {
      alert("Network error: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const applyPreset = (type: "knee" | "shoulder" | "fatigue") => {
    if (type === "knee") {
      setFormData({
        workoutDescription: "Plyometric box jumps & 5x5 heavy back squats at 120kg",
        discomfortText: "Sudden sharp popping sensation in right knee during landing. Acute throbbing pain, unable to bear weight properly.",
        activity: "strength training",
        affectedBodyPart: "knee",
        bodySide: "right",
        symptomType: "sharp pain",
        onset: "acute",
        reportedSeverity: 8,
      });
    } else if (type === "shoulder") {
      setFormData({
        workoutDescription: "3,500m butterfly & sprint drills in 50m Olympic pool",
        discomfortText: "Deep aching stiffness in right shoulder joint. Noticeable burning when elevating the arm overhead.",
        activity: "swimming",
        affectedBodyPart: "shoulder",
        bodySide: "right",
        symptomType: "dull ache",
        onset: "gradual",
        reportedSeverity: 5,
      });
    } else {
      setFormData({
        workoutDescription: "14km aerobic endurance run on gravel trail",
        discomfortText: "Mild bilateral calf tightness and general hamstring fatigue after 10km. No localized pain.",
        activity: "running",
        affectedBodyPart: "calf",
        bodySide: "bilateral",
        symptomType: "tightness",
        onset: "post-exercise",
        reportedSeverity: 2,
      });
    }
  };

  const handleAcknowledge = async (id: string) => {
    try {
      const res = await fetch(`/api/v1/feedback/${id}/acknowledge`, { method: "POST" });
      const json = await res.json();
      if (json.success) {
        showNotice("Coach feedback acknowledged.");
        if (user) await loadData(user);
      }
    } catch (e: any) {
      alert("Error: " + e.message);
    }
  };

  const handleCoachFeedback = async (logId: string) => {
    const input = feedbackInputs[logId] || { comments: "", action: "rest" };
    if (!input.comments.trim()) {
      alert("Please enter feedback advice for the athlete.");
      return;
    }
    setSubmittingLogId(logId);
    try {
      const res = await fetch(`/api/v1/coach/logs/${logId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: input.comments,
          comments: input.comments,
          activityModification: `Action: ${input.action.toUpperCase()}`,
          recommendedAction: input.action,
          status: "reviewed",
        }),
      });
      const json = await res.json();
      if (json.success) {
        showNotice("Direct coach feedback sent & log marked as reviewed!");
        if (user) await loadData(user);
      } else {
        const errorMsg =
          typeof json.error === "object"
            ? json.error?.message || JSON.stringify(json.error)
            : json.error || "Failed to submit feedback";
        alert(errorMsg);
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setSubmittingLogId(null);
    }
  };

  const priorityBadge = (p: string) => {
    switch (p) {
      case "urgent":
        return "bg-rose-100 text-rose-700 border border-rose-300 font-bold";
      case "high":
        return "bg-amber-100 text-amber-800 border border-amber-300 font-semibold";
      case "medium":
        return "bg-blue-100 text-blue-700 border border-blue-200";
      default:
        return "bg-slate-100 text-slate-600 border border-slate-200";
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  // Derive hotspot map from athlete logs with full anatomical mapping
  const activeLogs = user?.role === "athlete" ? myLogs : coachQueue;
  const latestLog = activeLogs[0];
  const hotspots: Record<string, number> = {};
  activeLogs.slice(0, 10).forEach((l) => {
    const bp = (l.affectedBodyPart || "").toLowerCase();
    const txt = ((l.discomfortText || "") + " " + (l.workoutDescription || "")).toLowerCase();

    const check = (key: string, aliases: string[]) => {
      if (aliases.some((a) => bp.includes(a) || txt.includes(a))) {
        hotspots[key] = Math.max(hotspots[key] || 0, l.reportedSeverity || 4);
      }
    };

    check("shoulder", ["shoulder", "deltoid", "rotator"]);
    check("arm", ["arm", "bicep", "tricep", "forearm"]);
    check("elbow", ["elbow"]);
    check("wrist", ["wrist", "hand"]);
    check("chest", ["chest", "pec", "rib"]);
    check("back", ["back", "spine", "lumbar"]);
    check("hip", ["hip", "pelvis", "groin"]);
    check("hamstring", ["hamstring"]);
    check("quad", ["quad", "thigh", "quadriceps"]);
    check("knee", ["knee", "patella"]);
    check("calf", ["calf", "shin"]);
    check("ankle", ["ankle", "achilles", "heel", "foot"]);
    check("neck", ["neck", "cervical"]);
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-4">
        <div className="h-10 w-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <h2 className="text-xl font-bold">AthletePulse</h2>
        <p className="text-xs text-slate-400 mt-1">Connecting sports wellness database...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f6f8] text-[#191f28] flex flex-col font-sans">
      {/* Toast Alert */}
      {notice && (
        <div className="fixed top-4 right-4 z-50 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-xl flex items-center space-x-3 border border-slate-700 animate-bounce">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400"></span>
          <span className="text-sm font-semibold">{notice}</span>
        </div>
      )}

      {/* Clean Top Header (No Cluttered Personas at the Start) */}
      <header className="bg-white border-b border-[#eaedf1] px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-30 shadow-xs">
        <div className="flex items-center space-x-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center text-white font-black text-lg shadow-sm">
            ⚡
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-extrabold text-lg text-slate-900 tracking-tight">AthletePulse</span>
              <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-200 uppercase">
                Sports Wellness
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">Persistent Discomfort & Injury Awareness Logbook</p>
          </div>
        </div>

        {/* Clean Header Right: User Status & Account Controls */}
        <div className="flex items-center space-x-3">
          {user ? (
            <div className="flex items-center space-x-3">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-bold text-slate-800 leading-tight">{user.name}</p>
                <p className="text-[10px] text-slate-400 capitalize">{user.role} {user.sport ? `• ${user.sport}` : ""}</p>
              </div>
              <button
                onClick={() => setActiveTab("login")}
                className="text-xs text-slate-700 hover:text-slate-900 font-bold bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg border border-slate-200 transition-all flex items-center space-x-1"
                title="Switch persona or sign in as another user"
              >
                <span>👤</span>
                <span>Switch Account</span>
              </button>
              <button
                onClick={handleLogout}
                className="text-xs text-rose-500 hover:text-rose-700 font-bold bg-rose-50 hover:bg-rose-100 px-2.5 py-1.5 rounded-lg transition-all"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <button
              onClick={() => setActiveTab("login")}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-xs transition-all flex items-center space-x-1"
            >
              <span>🔐</span>
              <span>Sign In / Demo Personas →</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Grid: Left Nav + Dynamic Center Content + Right Dark Anatomical Panel */}
      <div className="flex-1 flex flex-col lg:flex-row max-w-[1720px] w-full mx-auto p-4 sm:p-6 gap-6">

        {/* Left Sidebar Navigation */}
        <aside className="w-full lg:w-60 shrink-0 flex lg:flex-col justify-between gap-3 bg-white p-3 rounded-2xl border border-[#edf0f4] shadow-xs">
          <div className="flex lg:flex-col gap-1.5 w-full">
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                activeTab === "dashboard" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <span>📊</span>
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => setActiveTab("logs")}
              className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                activeTab === "logs" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <div className="flex items-center space-x-3">
                <span>📝</span>
                <span>{user?.role === "coach" ? "Triage Queue" : "Workout Logs"}</span>
              </div>
              {user?.role === "coach" && coachCounts.pendingReviewsCount > 0 && (
                <span className="bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                  {coachCounts.pendingReviewsCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab("feedback")}
              className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                activeTab === "feedback" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <div className="flex items-center space-x-3">
                <span>💬</span>
                <span>{user?.role === "coach" ? "Athlete Roster" : "Coach Directives"}</span>
              </div>
              {user?.role === "athlete" && feedbacks.filter((f) => !f.acknowledgedByAthlete).length > 0 && (
                <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                  {feedbacks.filter((f) => !f.acknowledgedByAthlete).length}
                </span>
              )}
            </button>

            {/* ARCADE MODE TAB FOR ATHLETES */}
            {user?.role === "athlete" && (
              <button
                onClick={() => setActiveTab("arcade")}
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all border ${
                  activeTab === "arcade"
                    ? "bg-[#090d1a] text-cyan-300 border-cyan-500/50 shadow-[0_0_15px_rgba(0,240,255,0.25)]"
                    : "text-slate-700 bg-cyan-50/50 border-cyan-200/60 hover:bg-cyan-100/50"
                }`}
              >
                <div className="flex items-center space-x-3">
                  <span>🏎️</span>
                  <span className="font-bold">Arcade Mode</span>
                </div>
                <span className="text-[9px] bg-gradient-to-r from-cyan-500 to-[#ff007f] text-white px-1.5 py-0.5 rounded font-black tracking-wider uppercase">
                  F1 Game
                </span>
              </button>
            )}

            {/* PERFORMANCE TESTS TAB FOR COACHES */}
            {user?.role === "coach" && (
              <button
                onClick={() => setActiveTab("performance")}
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  activeTab === "performance" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <div className="flex items-center space-x-3">
                  <span>⚡</span>
                  <span>Performance Tests</span>
                </div>
                {coachPerformanceSessions.length > 0 && (
                  <span className="bg-cyan-600 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full font-mono">
                    {coachPerformanceSessions.length}
                  </span>
                )}
              </button>
            )}

            <button
              onClick={() => setActiveTab("analytics")}
              className={`flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                activeTab === "analytics" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <span>📈</span>
              <span>Symptom Trends</span>
            </button>

            <button
              onClick={() => setActiveTab("api")}
              className={`flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                activeTab === "api" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <span>🔌</span>
              <span>API Reference</span>
            </button>

            {/* Individual Tab For Login / Accounts */}
            <button
              onClick={() => setActiveTab("login")}
              className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all border ${
                activeTab === "login"
                  ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                  : "text-slate-700 bg-emerald-50/60 border-emerald-200/80 hover:bg-emerald-100/60"
              }`}
            >
              <div className="flex items-center space-x-3">
                <span>🔐</span>
                <span>Login & Accounts</span>
              </div>
              <span className="text-[10px] bg-emerald-600 text-white px-1.5 py-0.5 rounded font-bold">
                Auth
              </span>
            </button>
          </div>

          <div className="hidden lg:block pt-4 border-t border-slate-100">
            {user?.role === "athlete" ? (
              <button
                onClick={() => setIsModalOpen(true)}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs shadow-xs transition-all flex items-center justify-center space-x-2"
              >
                <span>+</span>
                <span>Log Discomfort</span>
              </button>
            ) : (
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-center">
                <span className="text-[10px] text-slate-400 block font-bold uppercase">Role Mode</span>
                <span className="text-xs font-bold text-slate-700">Coach Oversight</span>
              </div>
            )}
          </div>
        </aside>

        {/* Central Content Area */}
        <main className="flex-1 min-w-0 flex flex-col gap-6">

          {/* TAB: DEDICATED LOGIN & DEMO PERSONA EXAMPLES */}
          {activeTab === "login" && (
            <div className="space-y-6">
              <div>
                <div className="flex items-center space-x-2">
                  <h2 className="text-2xl font-black text-slate-900">Account Access & Demo Personas</h2>
                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                    Authentication Hub
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Sign in with custom credentials, register a new user, or select one of the pre-configured role-isolated demo examples below.
                </p>
              </div>

              {/* Current Active Account Status Banner */}
              {user && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center space-x-3">
                    <span className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse"></span>
                    <div>
                      <p className="text-xs font-bold text-emerald-900">
                        Currently Signed In: <span className="font-extrabold">{user.name}</span> ({user.email})
                      </p>
                      <p className="text-[11px] text-emerald-700 capitalize">
                        Role: {user.role} {user.sport ? `• Sport: ${user.sport}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setActiveTab("dashboard")}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg shadow-xs"
                    >
                      Go to Dashboard →
                    </button>
                    <button
                      onClick={handleLogout}
                      className="bg-white hover:bg-rose-50 text-rose-600 font-bold text-xs px-3 py-1.5 rounded-lg border border-rose-200"
                    >
                      Sign Out
                    </button>
                  </div>
                </div>
              )}

              {/* 2-Column Layout: Custom Auth Form + Demo Examples */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* Left 5 Cols: Custom Form (Login / Register) */}
                <div className="lg:col-span-5 dash-card p-6 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex space-x-2">
                      <button
                        type="button"
                        onClick={() => { setAuthMode("login"); setAuthError(null); }}
                        className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${
                          authMode === "login"
                            ? "bg-slate-900 text-white shadow-xs"
                            : "text-slate-500 hover:bg-slate-100"
                        }`}
                      >
                        Sign In
                      </button>
                      <button
                        type="button"
                        onClick={() => { setAuthMode("register"); setAuthError(null); }}
                        className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${
                          authMode === "register"
                            ? "bg-slate-900 text-white shadow-xs"
                            : "text-slate-500 hover:bg-slate-100"
                        }`}
                      >
                        Create Account
                      </button>
                    </div>
                    <span className="text-[10px] text-slate-400 font-medium">Bcrypt + JWT</span>
                  </div>

                  {authError && (
                    <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-3 rounded-xl font-medium">
                      ⚠️ {authError}
                    </div>
                  )}

                  {authMode === "login" ? (
                    <form onSubmit={handleCustomLogin} className="space-y-3.5">
                      <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">Email Address</label>
                        <input
                          type="email"
                          required
                          placeholder="e.g. elena.swimmer@athletepulse.test"
                          value={customEmail}
                          onChange={(e) => setCustomEmail(e.target.value)}
                          className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:outline-emerald-500 bg-white"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">Password</label>
                        <input
                          type="password"
                          required
                          placeholder="••••••••"
                          value={customPassword}
                          onChange={(e) => setCustomPassword(e.target.value)}
                          className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:outline-emerald-500 bg-white"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={isSubmittingAuth}
                        className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 rounded-xl text-xs shadow-md transition-all disabled:opacity-50"
                      >
                        {isSubmittingAuth ? "Authenticating..." : "Sign In with Credentials"}
                      </button>
                    </form>
                  ) : (
                    <form onSubmit={handleCustomRegister} className="space-y-3">
                      <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">Full Name</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Sarah Jenkins"
                          value={regName}
                          onChange={(e) => setRegName(e.target.value)}
                          className="w-full text-xs p-2 rounded-xl border border-slate-300 focus:outline-emerald-500 bg-white"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">Email Address</label>
                        <input
                          type="email"
                          required
                          placeholder="e.g. sarah.j@athletepulse.test"
                          value={customEmail}
                          onChange={(e) => setCustomEmail(e.target.value)}
                          className="w-full text-xs p-2 rounded-xl border border-slate-300 focus:outline-emerald-500 bg-white"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">Password (min 8 chars)</label>
                        <input
                          type="password"
                          required
                          minLength={8}
                          placeholder="••••••••"
                          value={customPassword}
                          onChange={(e) => setCustomPassword(e.target.value)}
                          className="w-full text-xs p-2 rounded-xl border border-slate-300 focus:outline-emerald-500 bg-white"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs font-bold text-slate-700 block mb-1">Role</label>
                          <select
                            value={regRole}
                            onChange={(e: any) => setRegRole(e.target.value)}
                            className="w-full text-xs p-2 rounded-xl border border-slate-300 bg-white"
                          >
                            <option value="athlete">Athlete</option>
                            <option value="coach">Coach</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-bold text-slate-700 block mb-1">Sport / Discipline</label>
                          <input
                            type="text"
                            placeholder="e.g. Rowing"
                            value={regSport}
                            onChange={(e) => setRegSport(e.target.value)}
                            className="w-full text-xs p-2 rounded-xl border border-slate-300 bg-white"
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={isSubmittingAuth}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl text-xs shadow-md transition-all disabled:opacity-50"
                      >
                        {isSubmittingAuth ? "Creating Account..." : "Create Account & Sign In"}
                      </button>
                    </form>
                  )}
                </div>

                {/* Right 7 Cols: Pre-Configured Demo Persona Examples */}
                <div className="lg:col-span-7 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-extrabold text-slate-900">⚡ Pre-Configured Demo Personas</h3>
                      <p className="text-xs text-slate-400">Click any persona example to log in instantly and review their records:</p>
                    </div>
                    <span className="text-[10px] bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded-md">
                      password123
                    </span>
                  </div>

                  {/* Persona 1: Elena Rostova */}
                  <div className="dash-card p-4 space-y-2 hover:border-emerald-300 transition-all border-l-4 border-emerald-500">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="text-lg">🏊</span>
                        <div>
                          <h4 className="font-extrabold text-slate-900 text-xs">Elena Rostova</h4>
                          <p className="text-[11px] text-slate-500">Competitive Swimming • Assigned to Coach Marcus</p>
                        </div>
                      </div>
                      <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                        Athlete
                      </span>
                    </div>
                    <p className="text-xs text-slate-600">
                      Has active high-volume swim logs with acute right shoulder discomfort and feedback history from Coach Vance.
                    </p>
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <code className="text-[11px] text-slate-400 font-mono">elena.swimmer@athletepulse.test</code>
                      <button
                        onClick={() => quickLogin("elena.swimmer@athletepulse.test")}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 py-1.5 rounded-lg shadow-xs"
                      >
                        Log In as Elena →
                      </button>
                    </div>
                  </div>

                  {/* Persona 2: Coach Marcus Vance */}
                  <div className="dash-card p-4 space-y-2 hover:border-slate-400 transition-all border-l-4 border-slate-800">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="text-lg">📋</span>
                        <div>
                          <h4 className="font-extrabold text-slate-900 text-xs">Coach Marcus Vance</h4>
                          <p className="text-[11px] text-slate-500">Head Coach • Endurance & Distance Running</p>
                        </div>
                      </div>
                      <span className="bg-slate-900 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                        Head Coach
                      </span>
                    </div>
                    <p className="text-xs text-slate-600">
                      Full triage access to assigned athletes (Elena & Marcus). Can review flagged logs and issue directives.
                    </p>
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <code className="text-[11px] text-slate-400 font-mono">coach@athletepulse.test</code>
                      <button
                        onClick={() => quickLogin("coach@athletepulse.test")}
                        className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-3 py-1.5 rounded-lg shadow-xs"
                      >
                        Log In as Coach Marcus →
                      </button>
                    </div>
                  </div>

                  {/* Persona 3: Marcus Miller */}
                  <div className="dash-card p-4 space-y-2 hover:border-blue-300 transition-all border-l-4 border-blue-500">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="text-lg">🏃</span>
                        <div>
                          <h4 className="font-extrabold text-slate-900 text-xs">Marcus Miller</h4>
                          <p className="text-[11px] text-slate-500">Marathon Running • Assigned to Coach Marcus</p>
                        </div>
                      </div>
                      <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                        Athlete
                      </span>
                    </div>
                    <p className="text-xs text-slate-600">
                      High-mileage marathon training logs with reported Achilles tendon soreness and calf tightness.
                    </p>
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <code className="text-[11px] text-slate-400 font-mono">marcus.runner@athletepulse.test</code>
                      <button
                        onClick={() => quickLogin("marcus.runner@athletepulse.test")}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-3 py-1.5 rounded-lg shadow-xs"
                      >
                        Log In as Marcus Miller →
                      </button>
                    </div>
                  </div>

                  {/* Persona 4: Coach Lisa Ray */}
                  <div className="dash-card p-4 space-y-2 hover:border-amber-300 transition-all border-l-4 border-amber-500">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="text-lg">🛡️</span>
                        <div>
                          <h4 className="font-extrabold text-slate-900 text-xs">Coach Lisa Ray</h4>
                          <p className="text-[11px] text-slate-500">Triathlon Coaching • Security Isolation Demo</p>
                        </div>
                      </div>
                      <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                        Security Demo
                      </span>
                    </div>
                    <p className="text-xs text-slate-600">
                      Coach with zero assigned athletes. Proves strict cross-user security isolation (cannot access Elena's logs).
                    </p>
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <code className="text-[11px] text-slate-400 font-mono">stranger.coach@athletepulse.test</code>
                      <button
                        onClick={() => quickLogin("stranger.coach@athletepulse.test")}
                        className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-3 py-1.5 rounded-lg shadow-xs"
                      >
                        Log In as Coach Lisa →
                      </button>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* TAB 1: DASHBOARD */}
          {activeTab === "dashboard" && (
            <div className="space-y-6">
              {/* Welcome Header */}
              <div className="dash-card p-6 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center space-x-2">
                    <h2 className="text-2xl font-black">Welcome, {user?.name || "Athlete"}</h2>
                    <span className="bg-emerald-500/20 text-emerald-300 text-xs px-2.5 py-0.5 rounded-full border border-emerald-500/30 uppercase font-bold">
                      {user?.role}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1 max-w-xl">
                    {user?.role === "athlete"
                      ? "Structured sports wellness logbook. Keep track of workout loads and report physical discomfort in plain everyday language."
                      : "Centralized review queue for athlete reports. Detect early injury markers and prescribe immediate adjustments."}
                  </p>
                </div>
                {user?.role === "athlete" ? (
                  <button
                    onClick={() => setIsModalOpen(true)}
                    className="bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-black px-5 py-2.5 rounded-xl shadow-lg transition-transform hover:scale-105 shrink-0"
                  >
                    + Log Today's Session
                  </button>
                ) : (
                  <button
                    onClick={() => setActiveTab("logs")}
                    className="bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold px-4 py-2.5 rounded-xl shadow-md shrink-0 text-xs"
                  >
                    Open Triage Queue ({coachCounts.pendingReviewsCount})
                  </button>
                )}
              </div>

              {/* ATHLETE STATS */}
              {user?.role === "athlete" && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="dash-card p-4">
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Logs</p>
                      <h3 className="text-2xl font-black text-slate-900 mt-1">{myLogs.length}</h3>
                      <p className="text-[11px] text-slate-500 mt-0.5">Tracked workouts</p>
                    </div>

                    <div className="dash-card p-4">
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Active Flags</p>
                      <h3 className="text-2xl font-black text-rose-600 mt-1">
                        {myLogs.filter((l) => l.reviewPriority === "urgent" || l.reviewPriority === "high").length}
                      </h3>
                      <p className="text-[11px] text-rose-500 mt-0.5">High/Urgent flagged</p>
                    </div>

                    <div className="dash-card p-4">
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Coach Feedback</p>
                      <h3 className="text-2xl font-black text-slate-900 mt-1">{feedbacks.length}</h3>
                      <p className="text-[11px] text-emerald-600 font-semibold mt-0.5">
                        {feedbacks.filter((f) => f.acknowledgementStatus !== "acknowledged" && !f.acknowledgedByAthlete).length} awaiting read
                      </p>
                    </div>

                    <div className="dash-card p-4">
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Latest Severity</p>
                      <h3 className="text-2xl font-black text-amber-600 mt-1">
                        {latestLog ? `${latestLog.reportedSeverity}/10` : "0/10"}
                      </h3>
                      <p className="text-[11px] text-slate-500 mt-0.5 capitalize">
                        {latestLog?.affectedBodyPart || "None"}
                      </p>
                    </div>
                  </div>

                  {/* Urgent Alert Banner */}
                  {latestLog && latestLog.reviewPriority === "urgent" && (
                    <div className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-4 flex items-start space-x-3">
                      <span className="text-2xl">⚠️</span>
                      <div>
                        <div className="flex items-center space-x-2">
                          <h4 className="font-bold text-rose-900 text-sm">Urgent Medical Triage Flag</h4>
                          <span className="bg-rose-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-full uppercase">
                            Flagged for Coach Review
                          </span>
                        </div>
                        <p className="text-xs text-rose-800 mt-1">
                          Acute symptoms reported for {latestLog.bodySide} {latestLog.affectedBodyPart} (Severity {latestLog.reportedSeverity}/10).
                          {latestLog.emergencyGuidance || " Consult athletic trainer immediately."}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Mini-Game Arcade Banner */}
                  <div className="rounded-2xl p-4 bg-[#090d1a] border border-cyan-500/40 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-[0_0_20px_rgba(0,240,255,0.12)]">
                    <div className="flex items-center space-x-3.5">
                      <div className="h-11 w-11 rounded-xl bg-cyan-500/20 border border-cyan-400 flex items-center justify-center text-2xl shrink-0 shadow-[0_0_12px_rgba(0,240,255,0.4)]">
                        🏎️
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <h4 className="font-mono font-black text-cyan-300 text-sm">LIGHTS OUT! F1 REACTION DRILL</h4>
                          <span className="bg-[#ff007f]/20 text-[#ff007f] border border-[#ff007f]/40 text-[9px] font-mono font-bold px-2 py-0.2 rounded-full uppercase">
                            Arcade Mode
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 mt-0.5">
                          Test your neuromuscular reaction time against the Formula 1 five-light gantry sequence. 5-round benchmark.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setActiveTab("arcade")}
                      className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black font-mono text-xs px-4 py-2.5 rounded-xl shadow-[0_0_15px_rgba(0,240,255,0.4)] transition-all shrink-0 hover:scale-105"
                    >
                      Play Lights Out →
                    </button>
                  </div>

                  {/* Recent Logs List Preview */}
                  <div className="dash-card p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-extrabold text-sm text-slate-900">Recent Session Reports</h3>
                      <button
                        onClick={() => setActiveTab("logs")}
                        className="text-xs font-bold text-emerald-600 hover:text-emerald-700"
                      >
                        All Logs ({myLogs.length}) →
                      </button>
                    </div>

                    {myLogs.length === 0 ? (
                      <p className="text-xs text-slate-400 py-4 text-center">No logs recorded yet.</p>
                    ) : (
                      <div className="space-y-3">
                        {myLogs.slice(0, 3).map((log) => (
                          <div
                            key={log._id}
                            className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/60 flex flex-col md:flex-row md:items-center justify-between gap-2"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center space-x-2">
                                <span className="font-bold text-slate-900 text-xs capitalize">{log.activity}</span>
                                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${priorityBadge(log.reviewPriority)}`}>
                                  {log.reviewPriority}
                                </span>
                                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase bg-slate-200 text-slate-700">
                                  {log.reviewStatus}
                                </span>
                              </div>
                              <p className="text-xs text-slate-600 line-clamp-1">{log.workoutDescription}</p>
                              <p className="text-xs text-rose-600 font-medium">
                                📍 {log.bodySide} {log.affectedBodyPart} ({log.symptomType}) • Severity {log.reportedSeverity}/10
                              </p>
                            </div>
                            <span className="text-[11px] text-slate-400 shrink-0">{formatDate(log.createdAt)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* COACH OVERVIEW */}
              {user?.role === "coach" && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="dash-card p-5 border-l-4 border-rose-500">
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Urgent Flags</p>
                      <h3 className="text-3xl font-black text-rose-600 mt-1">{coachCounts.flaggedLogsCount}</h3>
                      <p className="text-xs text-slate-500 mt-1">High/Urgent priority incidents</p>
                    </div>

                    <div className="dash-card p-5 border-l-4 border-amber-500">
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Pending Reviews</p>
                      <h3 className="text-3xl font-black text-amber-600 mt-1">{coachCounts.pendingReviewsCount}</h3>
                      <p className="text-xs text-slate-500 mt-1">Awaiting coach directive</p>
                    </div>

                    <div className="dash-card p-5 border-l-4 border-emerald-500">
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Assigned Athletes</p>
                      <h3 className="text-3xl font-black text-emerald-600 mt-1">{coachCounts.totalAssignedAthletes}</h3>
                      <p className="text-xs text-slate-500 mt-1">Under active monitoring</p>
                    </div>
                  </div>

                  {/* Performance Test Banner for Coach */}
                  <div className="rounded-2xl p-4 bg-[#090d1a] border border-cyan-500/40 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-[0_0_20px_rgba(0,240,255,0.12)]">
                    <div className="flex items-center space-x-3.5">
                      <div className="h-11 w-11 rounded-xl bg-cyan-500/20 border border-cyan-400 flex items-center justify-center text-2xl shrink-0 shadow-[0_0_12px_rgba(0,240,255,0.4)]">
                        ⚡
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <h4 className="font-mono font-black text-cyan-300 text-sm">ATHLETE REACTION BENCHMARKS</h4>
                          <span className="bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 text-[9px] font-mono font-bold px-2 py-0.2 rounded-full uppercase">
                            {coachPerformanceSessions.length} Tests Logged
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 mt-0.5">
                          F1 Lights Out 5-round neuromuscular reaction stints for assigned squad members.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setActiveTab("performance")}
                      className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black font-mono text-xs px-4 py-2.5 rounded-xl shadow-[0_0_15px_rgba(0,240,255,0.4)] transition-all shrink-0 hover:scale-105"
                    >
                      Open Performance Tests →
                    </button>
                  </div>

                  <div className="dash-card p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="font-extrabold text-sm text-slate-900">Priority Triage Stream</h3>
                        <p className="text-xs text-slate-400">Reports sorted by clinical urgency and timestamp</p>
                      </div>
                      <button
                        onClick={() => setActiveTab("logs")}
                        className="text-xs font-bold text-emerald-600 hover:text-emerald-700"
                      >
                        Full Queue →
                      </button>
                    </div>

                    <div className="space-y-3">
                      {coachQueue.slice(0, 3).map((log) => (
                        <div key={log._id} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <span className="font-bold text-slate-900 text-xs">{log.athleteName || "Athlete"}</span>
                              <span className="text-[11px] text-slate-500 capitalize">({log.athleteSport || "Sport"})</span>
                              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${priorityBadge(log.reviewPriority)}`}>
                                {log.reviewPriority}
                              </span>
                            </div>
                            <span className="text-xs font-bold text-rose-600">Severity {log.reportedSeverity}/10</span>
                          </div>
                          <p className="text-xs text-slate-700 font-medium">"{log.discomfortText}"</p>
                          <div className="flex justify-between items-center pt-2 border-t border-slate-200 text-[11px]">
                            <span className="text-slate-500">Area: {log.bodySide} {log.affectedBodyPart} ({log.symptomType})</span>
                            <button
                              onClick={() => setActiveTab("logs")}
                              className="font-bold text-emerald-700 hover:underline"
                            >
                              Prescribe Advice →
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* TAB 2: LOGS & TRIAGE */}
          {activeTab === "logs" && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-black text-slate-900">
                    {user?.role === "coach" ? "Coach Triage & Feedback Queue" : "Discomfort & Training Logs"}
                  </h2>
                  <p className="text-xs text-slate-400">
                    {user?.role === "coach"
                      ? "Inspect raw reports and extracted symptoms. Provide direct advice to athletes."
                      : "Complete record of daily physical symptoms and training sessions."}
                  </p>
                </div>
                {user?.role === "athlete" && (
                  <button
                    onClick={() => setIsModalOpen(true)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-xs"
                  >
                    + New Log
                  </button>
                )}
              </div>

              {/* ATHLETE LOG CARDS */}
              {user?.role === "athlete" && (
                <div className="space-y-4">
                  {myLogs.length === 0 ? (
                    <div className="dash-card p-12 text-center text-slate-400">
                      <p className="text-sm">No workout logs recorded yet.</p>
                      <button
                        onClick={() => setIsModalOpen(true)}
                        className="mt-3 bg-emerald-600 text-white font-bold px-4 py-2 rounded-xl text-xs"
                      >
                        + Create Your First Log
                      </button>
                    </div>
                  ) : (
                    myLogs.map((log) => (
                      <div key={log._id} className="dash-card p-5 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                          <div className="flex items-center space-x-2">
                            <span className="font-extrabold text-slate-900 text-xs capitalize">{log.activity}</span>
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${priorityBadge(log.reviewPriority)}`}>
                              {log.reviewPriority} Priority
                            </span>
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase bg-slate-100 text-slate-700">
                              {log.reviewStatus}
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-400">{formatDate(log.createdAt)}</span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                            <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Workout Notes</span>
                            <p className="text-slate-700">{log.workoutDescription}</p>
                          </div>
                          <div className="bg-rose-50/50 p-3 rounded-xl border border-rose-100">
                            <span className="text-[10px] font-bold text-rose-500 uppercase block mb-1">Natural Discomfort Report</span>
                            <p className="text-slate-800 font-medium">"{log.discomfortText}"</p>
                          </div>
                        </div>

                        <div className="bg-slate-50 p-2.5 rounded-xl flex flex-wrap items-center gap-2 text-xs">
                          <span className="text-slate-400 font-bold uppercase text-[10px]">Extracted:</span>
                          <span className="bg-white px-2 py-0.5 rounded border border-slate-200 font-semibold text-slate-700">
                            🎯 {log.bodySide} {log.affectedBodyPart}
                          </span>
                          <span className="bg-white px-2 py-0.5 rounded border border-slate-200 font-semibold text-slate-700">
                            ⚡ {log.symptomType}
                          </span>
                          <span className="bg-white px-2 py-0.5 rounded border border-slate-200 font-semibold text-slate-700">
                            ⏱️ {log.onset} onset
                          </span>
                          <span className="bg-white px-2 py-0.5 rounded border border-slate-200 font-bold text-rose-600">
                            Severity: {log.reportedSeverity} / 10
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* COACH TRIAGE CARDS (WITH INLINE FEEDBACK FORM) */}
              {user?.role === "coach" && (
                <div className="space-y-5">
                  {coachQueue.length === 0 ? (
                    <div className="dash-card p-12 text-center text-slate-400">
                      <p className="text-sm">Triage queue empty. No logs waiting for review.</p>
                    </div>
                  ) : (
                    coachQueue.map((log) => {
                      const input = feedbackInputs[log._id] || { comments: "", action: "rest" };
                      return (
                        <div key={log._id} className="dash-card p-5 space-y-4">
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                            <div className="flex items-center space-x-2">
                              <span className="font-extrabold text-slate-900 text-sm">{log.athleteName || "Athlete"}</span>
                              <span className="bg-slate-100 text-slate-700 text-xs px-2 py-0.5 rounded-md font-semibold">
                                {log.athleteSport || "Sport"}
                              </span>
                              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${priorityBadge(log.reviewPriority)}`}>
                                {log.reviewPriority} Priority
                              </span>
                              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase bg-slate-100 text-slate-700">
                                {log.reviewStatus}
                              </span>
                            </div>
                            <span className="text-xs text-slate-400">{formatDate(log.createdAt)}</span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                              <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                                Athlete's Own Words
                              </span>
                              <p className="text-slate-800 font-medium">"{log.discomfortText}"</p>
                              <p className="text-slate-500 mt-2 text-[11px]">Training: {log.workoutDescription}</p>
                            </div>

                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-2">
                              <span className="text-[10px] font-bold text-slate-400 uppercase block">Extracted Markers</span>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div>
                                  <span className="text-[10px] text-slate-400 block">Area</span>
                                  <span className="font-bold text-slate-800 capitalize">{log.bodySide} {log.affectedBodyPart}</span>
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-400 block">Symptom</span>
                                  <span className="font-bold text-slate-800 capitalize">{log.symptomType}</span>
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-400 block">Severity</span>
                                  <span className="font-black text-rose-600">{log.reportedSeverity} / 10</span>
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-400 block">Onset</span>
                                  <span className="font-bold text-slate-800 capitalize">{log.onset || "Acute"}</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {log.emergencyGuidance && (
                            <div className="bg-rose-50 border border-rose-200 p-2.5 rounded-xl text-xs text-rose-800 font-semibold flex items-center space-x-2">
                              <span>⚠️</span>
                              <span>{log.emergencyGuidance}</span>
                            </div>
                          )}

                          {/* Inline Feedback Form */}
                          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2.5">
                            <span className="text-xs font-bold text-slate-700 block">
                              ✍️ Prescribe Coach Feedback & Recommendation
                            </span>

                            <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5">
                              <div className="md:col-span-3">
                                <textarea
                                  rows={2}
                                  placeholder="e.g. Stop high-impact sets. Ice affected area for 20 mins. Attend physiotherapy evaluation tomorrow morning."
                                  value={input.comments}
                                  onChange={(e) =>
                                    setFeedbackInputs({
                                      ...feedbackInputs,
                                      [log._id]: { ...input, comments: e.target.value },
                                    })
                                  }
                                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 bg-white focus:outline-emerald-500"
                                />
                              </div>

                              <div className="space-y-2">
                                <select
                                  value={input.action}
                                  onChange={(e: any) =>
                                    setFeedbackInputs({
                                      ...feedbackInputs,
                                      [log._id]: { ...input, action: e.target.value },
                                    })
                                  }
                                  className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white font-medium"
                                >
                                  <option value="rest">Action: Full Rest</option>
                                  <option value="modify">Action: Modify Volume</option>
                                  <option value="physio">Action: See Physio</option>
                                  <option value="continue">Action: Continue Routine</option>
                                </select>

                                <button
                                  onClick={() => handleCoachFeedback(log._id)}
                                  disabled={submittingLogId === log._id}
                                  className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-2 rounded-lg text-xs shadow-xs transition-all disabled:opacity-50"
                                >
                                  {submittingLogId === log._id ? "Submitting..." : "Send Feedback"}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: FEEDBACK / ATHLETE ROSTER */}
          {activeTab === "feedback" && (
            <div className="space-y-6">
              {user?.role === "athlete" ? (
                <>
                  <div>
                    <h2 className="text-xl font-black text-slate-900">Coach Directives & Feedback</h2>
                    <p className="text-xs text-slate-400">
                      Training directives, recovery adjustments, and physical therapy referrals.
                    </p>
                  </div>

                  {feedbacks.length === 0 ? (
                    <div className="dash-card p-12 text-center text-slate-400">
                      <p className="text-sm">No feedback received yet.</p>
                      <p className="text-xs mt-1">Your coach will post directives here after reviewing your logs.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {feedbacks.map((item) => (
                        <div key={item._id} className="dash-card p-5 space-y-3">
                          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                            <div className="flex items-center space-x-2">
                              <span className="font-black text-slate-900 text-xs">Coach Recommendation</span>
                              <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                                {item.activityModification || (item.recommendedAction ? `Action: ${item.recommendedAction}` : "Action: Review")}
                              </span>
                            </div>
                            <span className="text-xs text-slate-400">{formatDate(item.createdAt)}</span>
                          </div>

                          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                            <p className="text-xs text-slate-800 font-semibold leading-relaxed">
                              "{item.message || item.comments}"
                            </p>
                          </div>

                          <div className="flex items-center justify-between pt-1">
                            {item.acknowledgementStatus === "acknowledged" || item.acknowledgedByAthlete ? (
                              <span className="text-xs text-emerald-600 font-bold flex items-center space-x-1">
                                <span>✓</span>
                                <span>Acknowledged on {formatDate(item.acknowledgedAt || item.createdAt)}</span>
                              </span>
                            ) : (
                              <button
                                onClick={() => handleAcknowledge(item._id)}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-xs"
                              >
                                ✓ Acknowledge Directive
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                /* Coach Athlete Roster */
                <>
                  <div>
                    <h2 className="text-xl font-black text-slate-900">Assigned Athlete Roster</h2>
                    <p className="text-xs text-slate-400">Athletes assigned to Coach Marcus Vance</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {assignedAthletes.map((ath) => (
                      <div key={ath._id} className="dash-card p-5 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-extrabold text-slate-900 text-sm">{ath.name}</h3>
                            <p className="text-xs text-slate-400">{ath.email} • {ath.sport}</p>
                          </div>
                          <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold px-2.5 py-1 rounded-full">
                            Active
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-100">
                          <div className="bg-slate-50 p-2 rounded-lg">
                            <span className="text-[10px] text-slate-400 block font-bold">TOTAL REPORTS</span>
                            <span className="font-black text-slate-800 text-sm">{ath.totalLogs || 5}</span>
                          </div>
                          <div className="bg-slate-50 p-2 rounded-lg">
                            <span className="text-[10px] text-slate-400 block font-bold">RECENT AREA</span>
                            <span className="font-bold text-rose-600 text-xs capitalize truncate block">
                              {ath.recentDiscomfort || "Shoulder (Dull ache)"}
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={() => setActiveTab("logs")}
                          className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-2 rounded-xl text-xs transition-all"
                        >
                          View Reports & Prescribe Feedback →
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* TAB: ARCADE MODE (F1 LIGHTS OUT REACTION TEST) */}
          {activeTab === "arcade" && (
            <LightsOutGame
              athleteName={user?.name || "Athlete"}
              onSessionComplete={() => {
                if (user) loadData(user);
              }}
            />
          )}

          {/* TAB: COACH PERFORMANCE TESTS (REACTION BENCHMARKS) */}
          {activeTab === "performance" && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center space-x-2">
                    <h2 className="text-xl font-black text-slate-900">
                      Athlete Performance & Neuromuscular Tests
                    </h2>
                    <span className="bg-cyan-100 text-cyan-800 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full uppercase">
                      F1 Reaction Benchmark
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Formula 1 Lights Out reaction time results for your assigned athletes. Reaction times are isolated from clinical triage and injury severity ratings.
                  </p>
                </div>

                {/* Athlete Filter Dropdown */}
                <div className="flex items-center space-x-2 shrink-0">
                  <span className="text-xs text-slate-500 font-semibold">Filter:</span>
                  <select
                    value={selectedPerfAthleteFilter}
                    onChange={(e) => setSelectedPerfAthleteFilter(e.target.value)}
                    className="text-xs p-2 rounded-xl border border-slate-300 bg-white font-medium"
                  >
                    <option value="all">All Assigned Athletes ({assignedAthletes.length})</option>
                    {assignedAthletes.map((ath) => (
                      <option key={ath._id} value={ath._id}>
                        {ath.name} ({ath.sport || "Athlete"})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Medical Isolation Disclaimer Banner */}
              <div className="bg-cyan-50/70 border border-cyan-200 rounded-2xl p-4 flex items-start space-x-3 text-xs text-cyan-950">
                <span className="text-lg">🏎️</span>
                <div className="space-y-1">
                  <h4 className="font-bold text-cyan-900">
                    Performance Metric Isolation Notice
                  </h4>
                  <p className="text-cyan-800 leading-relaxed text-[11px]">
                    This reaction time challenge measures neuromuscular alertness and reaction latency under athletic loading. 
                    <b> It is strictly separated from medical triage flags and is NOT a clinical neurological diagnostic or driving fitness assessment.</b>
                  </p>
                </div>
              </div>

              {/* Performance Stats Overview */}
              {(() => {
                const filtered =
                  selectedPerfAthleteFilter === "all"
                    ? coachPerformanceSessions
                    : coachPerformanceSessions.filter(
                        (s) =>
                          (s.athleteId?._id || s.athleteId)?.toString() ===
                          selectedPerfAthleteFilter
                      );

                const bestReaction =
                  filtered.length > 0
                    ? filtered.reduce(
                        (min, s) => (s.bestTime < min.bestTime ? s : min),
                        filtered[0]
                      )
                    : null;

                const avgReaction =
                  filtered.length > 0
                    ? Math.round(
                        filtered.reduce((sum, s) => sum + s.averageTime, 0) /
                          filtered.length
                      )
                    : null;

                const totalFalseStarts = filtered.reduce(
                  (sum, s) => sum + (s.falseStartCount || 0),
                  0
                );

                return (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="dash-card p-4">
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                          Total Tests Logged
                        </p>
                        <h3 className="text-2xl font-black text-slate-900 mt-1 font-mono">
                          {filtered.length}
                        </h3>
                        <p className="text-[11px] text-slate-500 mt-0.5">5-round test stints</p>
                      </div>

                      <div className="dash-card p-4">
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                          Squad Fastest Reflex
                        </p>
                        <h3 className="text-2xl font-black text-cyan-600 mt-1 font-mono">
                          {bestReaction ? `${bestReaction.bestTime} ms` : "---"}
                        </h3>
                        <p className="text-[11px] text-cyan-700 mt-0.5 truncate">
                          {bestReaction?.athleteId?.name || "No records"}
                        </p>
                      </div>

                      <div className="dash-card p-4">
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                          Squad Average Time
                        </p>
                        <h3 className="text-2xl font-black text-slate-800 mt-1 font-mono">
                          {avgReaction ? `${avgReaction} ms` : "---"}
                        </h3>
                        <p className="text-[11px] text-slate-500 mt-0.5">Mean response time</p>
                      </div>

                      <div className="dash-card p-4">
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                          Total False Starts
                        </p>
                        <h3
                          className={`text-2xl font-black mt-1 font-mono ${
                            totalFalseStarts === 0 ? "text-emerald-600" : "text-amber-600"
                          }`}
                        >
                          {totalFalseStarts}
                        </h3>
                        <p className="text-[11px] text-slate-500 mt-0.5">Jumped start count</p>
                      </div>
                    </div>

                    {/* Table of Reaction Sessions */}
                    <div className="dash-card p-5 space-y-4">
                      <h3 className="font-extrabold text-sm text-slate-900">
                        Athlete Stint Logbook
                      </h3>

                      {filtered.length === 0 ? (
                        <div className="p-8 text-center text-slate-400 space-y-1">
                          <p className="text-sm font-semibold">No performance test sessions logged yet.</p>
                          <p className="text-xs">
                            Assigned athletes can launch "Arcade Mode" on their portal to complete an F1 reaction test stint.
                          </p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs text-left">
                            <thead>
                              <tr className="border-b border-slate-100 text-[10px] text-slate-400 uppercase tracking-wider font-mono">
                                <th className="py-2.5 px-3">Athlete</th>
                                <th className="py-2.5 px-3">Best Round</th>
                                <th className="py-2.5 px-3">Average</th>
                                <th className="py-2.5 px-3">False Starts</th>
                                <th className="py-2.5 px-3">Input Device</th>
                                <th className="py-2.5 px-3">Round Times</th>
                                <th className="py-2.5 px-3">Date</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-mono">
                              {filtered.map((item) => (
                                <tr key={item._id} className="hover:bg-slate-50/70 transition-colors">
                                  <td className="py-2.5 px-3">
                                    <div className="font-sans">
                                      <p className="font-bold text-slate-900">{item.athleteId?.name || "Athlete"}</p>
                                      <p className="text-[10px] text-slate-400">{item.athleteId?.sport || "Sport"}</p>
                                    </div>
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
                                  <td className="py-2.5 px-3 text-slate-500 font-sans">
                                    {new Date(item.createdAt).toLocaleDateString("en-US", {
                                      month: "short",
                                      day: "numeric",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {/* TAB 4: ANALYTICS & TRENDS */}
          {activeTab === "analytics" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-black text-slate-900">
                  {user?.role === "coach" ? "Team Discomfort & Symptom Aggregation" : "Personal Discomfort Trends"}
                </h2>
                <p className="text-xs text-slate-400">
                  Anatomical symptom distribution and severity analysis.
                </p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 text-xs text-blue-900 flex items-start space-x-2.5">
                <span className="text-base">ℹ️</span>
                <div>
                  <span className="font-bold">Medical Disclaimer:</span> This view aggregates patterns in athlete-reported symptoms. It does not replace clinical evaluation by sports physicians.
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="dash-card p-5 space-y-4">
                  <h3 className="font-extrabold text-sm text-slate-900">Frequently Affected Body Areas</h3>
                  <div className="space-y-3">
                    {[
                      { part: "Shoulder", count: 4, pct: 75, color: "bg-rose-500" },
                      { part: "Knee", count: 2, pct: 40, color: "bg-amber-500" },
                      { part: "Lower Back", count: 1, pct: 20, color: "bg-blue-500" },
                      { part: "Hamstring", count: 1, pct: 20, color: "bg-emerald-500" },
                    ].map((item) => (
                      <div key={item.part} className="space-y-1">
                        <div className="flex justify-between text-xs font-bold">
                          <span>{item.part}</span>
                          <span className="text-slate-500">{item.count} reports ({item.pct}%)</span>
                        </div>
                        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full ${item.color} rounded-full`} style={{ width: `${item.pct}%` }}></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="dash-card p-5 space-y-3">
                  <h3 className="font-extrabold text-sm text-slate-900">Symptom Severity Distribution</h3>
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between p-3 bg-rose-50 rounded-xl border border-rose-100">
                      <div>
                        <span className="text-xs font-bold text-rose-900 block">High / Urgent (7-10)</span>
                        <span className="text-[11px] text-rose-600">Acute trauma or high pain index</span>
                      </div>
                      <span className="text-xl font-black text-rose-700">2</span>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-amber-50 rounded-xl border border-amber-100">
                      <div>
                        <span className="text-xs font-bold text-amber-900 block">Moderate (4-6)</span>
                        <span className="text-[11px] text-amber-600">Sub-acute ache, requires monitoring</span>
                      </div>
                      <span className="text-xl font-black text-amber-700">3</span>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                      <div>
                        <span className="text-xs font-bold text-emerald-900 block">Mild Soreness (1-3)</span>
                        <span className="text-[11px] text-emerald-600">Normal training fatigue</span>
                      </div>
                      <span className="text-xl font-black text-emerald-700">4</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: API REFERENCE */}
          {activeTab === "api" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-black text-slate-900">Backend API Reference (/api/v1)</h2>
                <p className="text-xs text-slate-400">
                  Production-grade RESTful endpoints with Zod validation, JWT authentication, and MongoDB Atlas.
                </p>
              </div>

              <div className="space-y-3">
                {[
                  {
                    method: "POST",
                    endpoint: "/api/v1/auth/login",
                    desc: "Authenticates user via bcrypt, returns JWT token and sets secure httpOnly cookie.",
                    body: '{ "email": "elena.swimmer@athletepulse.test", "password": "password123" }',
                  },
                  {
                    method: "POST",
                    endpoint: "/api/v1/auth/register",
                    desc: "Registers a new athlete or coach account with hashed password and initial role assignment.",
                    body: '{ "name": "Elena Rostova", "email": "elena.swimmer@athletepulse.test", "password": "password123", "role": "athlete" }',
                  },
                  {
                    method: "GET",
                    endpoint: "/api/v1/logs/mine",
                    desc: "Fetches paginated training and discomfort logs strictly scoped to the authenticated athlete.",
                    body: "Headers: Authorization: Bearer <JWT> (or httpOnly cookie)",
                  },
                  {
                    method: "POST",
                    endpoint: "/api/v1/logs",
                    desc: "Creates a workout log, executes rule/AI symptom extraction, flags urgent incidents, and alerts coach.",
                    body: '{ "workoutDescription": "3000m swim", "discomfortText": "Right shoulder sharp pain", "reportedSeverity": 7 }',
                  },
                  {
                    method: "GET",
                    endpoint: "/api/v1/coach/dashboard",
                    desc: "Returns prioritized triage review queue, assigned athlete roster, and symptom aggregations.",
                    body: "Query params: timeframeDays=30",
                  },
                  {
                    method: "POST",
                    endpoint: "/api/v1/coach/logs/[logId]/feedback",
                    desc: "Submits coach directives (rest/modify/physio) and updates log review status.",
                    body: '{ "comments": "Take 48h rest and ice", "recommendedAction": "rest", "status": "reviewed" }',
                  },
                ].map((api) => (
                  <div key={api.endpoint} className="dash-card p-4 space-y-2">
                    <div className="flex items-center space-x-2">
                      <span
                        className={`text-[9px] font-black px-2 py-0.5 rounded-md text-white ${
                          api.method === "POST" ? "bg-blue-600" : "bg-emerald-600"
                        }`}
                      >
                        {api.method}
                      </span>
                      <code className="text-xs font-mono font-bold text-slate-900">{api.endpoint}</code>
                    </div>
                    <p className="text-xs text-slate-600">{api.desc}</p>
                    <div className="bg-slate-900 text-slate-200 p-2.5 rounded-lg text-[11px] font-mono overflow-x-auto">
                      <span className="text-slate-400 font-bold block mb-1">Payload / Headers:</span>
                      {api.body}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </main>

        {/* RIGHT DARK PANEL: REAL ANATOMICAL BODY HOTSPOT MAP & METRICS */}
        <aside className="w-full lg:w-80 shrink-0 dark-panel p-6 flex flex-col justify-between gap-6 shadow-xl">
          <div>
            <div className="flex items-center justify-between border-b border-slate-700/60 pb-3">
              <div>
                <span className="text-[10px] font-bold tracking-widest text-emerald-400 uppercase">
                  Biomechanical Status
                </span>
                <h3 className="font-extrabold text-white text-base mt-0.5">
                  {user?.role === "athlete" ? user.name : "Athlete Triage Focus"}
                </h3>
                <p className="text-xs text-slate-400">
                  {user?.role === "athlete" ? (user.sport || "Athlete") : (latestLog?.athleteName || "Elena Rostova")}
                </p>
              </div>
              <div className="h-10 w-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-emerald-400">
                {user?.role === "athlete" ? "🏊" : "📋"}
              </div>
            </div>

            {/* Interactive Anatomical SVG Map */}
            <div className="mt-5 flex flex-col items-center">
              <span className="text-[10px] font-semibold text-slate-400 mb-2 uppercase tracking-wider">
                Interactive Hotspot Map
              </span>

              <div className="relative w-44 h-72 flex items-center justify-center">
                <svg viewBox="0 0 240 400" className="w-full h-full drop-shadow-md">
                  {/* Head */}
                  <circle cx="120" cy="45" r="22" fill="#2d3340" />
                  {/* Neck */}
                  <rect x="114" y="66" width="12" height="15" rx="3" fill="#2d3340" />
                  {/* Torso */}
                  <path
                    d="M80 85 C80 85, 120 78, 160 85 C165 110, 155 170, 145 200 C135 210, 105 210, 95 200 C85 170, 75 110, 80 85 Z"
                    fill="#2d3340"
                  />
                  {/* Left Arm */}
                  <path d="M80 88 C70 120, 60 160, 52 195 C48 200, 56 205, 60 198 C68 165, 78 125, 86 98 Z" fill="#2d3340" />
                  {/* Right Arm */}
                  <path d="M160 88 C170 120, 180 160, 188 195 C192 200, 184 205, 180 198 C172 165, 162 125, 154 98 Z" fill="#2d3340" />
                  {/* Pelvis */}
                  <path d="M93 200 C105 212, 135 212, 147 200 C148 220, 140 230, 120 232 C100 230, 92 220, 93 200 Z" fill="#2d3340" />
                  {/* Left Leg */}
                  <path d="M96 225 C92 270, 88 320, 86 365 C85 375, 96 375, 98 365 C102 320, 108 270, 112 228 Z" fill="#2d3340" />
                  {/* Right Leg */}
                  <path d="M144 225 C148 270, 152 320, 154 365 C155 375, 144 375, 142 365 C138 320, 132 270, 128 228 Z" fill="#2d3340" />

                  {/* Interactive Anatomical Body Hotspots */}
                  {/* Neck */}
                  <circle
                    cx="120"
                    cy="60"
                    r={hotspots["neck"] ? "9" : "4"}
                    fill={hotspots["neck"] ? "#ef4444" : "#475569"}
                    className={hotspots["neck"] ? "animate-ring" : ""}
                  />

                  {/* Left Shoulder */}
                  <circle
                    cx="78"
                    cy="105"
                    r={hotspots["shoulder"] ? "10" : "4"}
                    fill={hotspots["shoulder"] ? "#ef4444" : "#475569"}
                    className={hotspots["shoulder"] ? "animate-ring" : ""}
                  />
                  {/* Right Shoulder */}
                  <circle
                    cx="162"
                    cy="105"
                    r={hotspots["shoulder"] ? "10" : "4"}
                    fill={hotspots["shoulder"] ? "#ef4444" : "#475569"}
                    className={hotspots["shoulder"] ? "animate-ring" : ""}
                  />

                  {/* Left Arm / Bicep */}
                  <circle
                    cx="62"
                    cy="140"
                    r={hotspots["arm"] ? "10" : "4"}
                    fill={hotspots["arm"] ? "#ef4444" : "#475569"}
                    className={hotspots["arm"] ? "animate-ring" : ""}
                  />
                  {/* Right Arm / Bicep */}
                  <circle
                    cx="178"
                    cy="140"
                    r={hotspots["arm"] ? "10" : "4"}
                    fill={hotspots["arm"] ? "#ef4444" : "#475569"}
                    className={hotspots["arm"] ? "animate-ring" : ""}
                  />

                  {/* Left Elbow */}
                  <circle
                    cx="54"
                    cy="165"
                    r={hotspots["elbow"] ? "9" : "4"}
                    fill={hotspots["elbow"] ? "#ef4444" : "#475569"}
                    className={hotspots["elbow"] ? "animate-ring" : ""}
                  />
                  {/* Right Elbow */}
                  <circle
                    cx="186"
                    cy="165"
                    r={hotspots["elbow"] ? "9" : "4"}
                    fill={hotspots["elbow"] ? "#ef4444" : "#475569"}
                    className={hotspots["elbow"] ? "animate-ring" : ""}
                  />

                  {/* Left Wrist / Hand */}
                  <circle
                    cx="46"
                    cy="198"
                    r={hotspots["wrist"] ? "9" : "4"}
                    fill={hotspots["wrist"] ? "#ef4444" : "#475569"}
                    className={hotspots["wrist"] ? "animate-ring" : ""}
                  />
                  {/* Right Wrist / Hand */}
                  <circle
                    cx="194"
                    cy="198"
                    r={hotspots["wrist"] ? "9" : "4"}
                    fill={hotspots["wrist"] ? "#ef4444" : "#475569"}
                    className={hotspots["wrist"] ? "animate-ring" : ""}
                  />

                  {/* Chest / Upper Back */}
                  <circle
                    cx="120"
                    cy="115"
                    r={hotspots["chest"] ? "10" : "4"}
                    fill={hotspots["chest"] ? "#ef4444" : "#475569"}
                    className={hotspots["chest"] ? "animate-ring" : ""}
                  />

                  {/* Lower Back / Core */}
                  <circle
                    cx="120"
                    cy="175"
                    r={hotspots["back"] ? "10" : "4"}
                    fill={hotspots["back"] ? "#ef4444" : "#475569"}
                    className={hotspots["back"] ? "animate-ring" : ""}
                  />

                  {/* Hip / Pelvis / Groin */}
                  <circle
                    cx="120"
                    cy="210"
                    r={hotspots["hip"] ? "9" : "4"}
                    fill={hotspots["hip"] ? "#ef4444" : "#475569"}
                    className={hotspots["hip"] ? "animate-ring" : ""}
                  />

                  {/* Left Quad / Thigh */}
                  <circle
                    cx="100"
                    cy="245"
                    r={hotspots["quad"] ? "10" : "4"}
                    fill={hotspots["quad"] ? "#ef4444" : "#475569"}
                    className={hotspots["quad"] ? "animate-ring" : ""}
                  />
                  {/* Right Quad / Thigh */}
                  <circle
                    cx="140"
                    cy="245"
                    r={hotspots["quad"] ? "10" : "4"}
                    fill={hotspots["quad"] ? "#ef4444" : "#475569"}
                    className={hotspots["quad"] ? "animate-ring" : ""}
                  />

                  {/* Left Hamstring */}
                  <circle
                    cx="100"
                    cy="268"
                    r={hotspots["hamstring"] ? "11" : "4"}
                    fill={hotspots["hamstring"] ? "#ef4444" : "#475569"}
                    className={hotspots["hamstring"] ? "animate-ring" : ""}
                  />
                  {/* Right Hamstring */}
                  <circle
                    cx="140"
                    cy="268"
                    r={hotspots["hamstring"] ? "11" : "4"}
                    fill={hotspots["hamstring"] ? "#ef4444" : "#475569"}
                    className={hotspots["hamstring"] ? "animate-ring" : ""}
                  />

                  {/* Left Knee */}
                  <circle
                    cx="98"
                    cy="295"
                    r={hotspots["knee"] ? "10" : "4"}
                    fill={hotspots["knee"] ? "#ef4444" : "#475569"}
                    className={hotspots["knee"] ? "animate-ring" : ""}
                  />
                  {/* Right Knee */}
                  <circle
                    cx="142"
                    cy="295"
                    r={hotspots["knee"] ? "10" : "4"}
                    fill={hotspots["knee"] ? "#ef4444" : "#475569"}
                    className={hotspots["knee"] ? "animate-ring" : ""}
                  />

                  {/* Left Calf / Shin */}
                  <circle
                    cx="94"
                    cy="335"
                    r={hotspots["calf"] ? "10" : "4"}
                    fill={hotspots["calf"] ? "#ef4444" : "#475569"}
                    className={hotspots["calf"] ? "animate-ring" : ""}
                  />
                  {/* Right Calf / Shin */}
                  <circle
                    cx="146"
                    cy="335"
                    r={hotspots["calf"] ? "10" : "4"}
                    fill={hotspots["calf"] ? "#ef4444" : "#475569"}
                    className={hotspots["calf"] ? "animate-ring" : ""}
                  />

                  {/* Left Ankle / Achilles / Foot */}
                  <circle
                    cx="90"
                    cy="370"
                    r={hotspots["ankle"] ? "10" : "4"}
                    fill={hotspots["ankle"] ? "#ef4444" : "#475569"}
                    className={hotspots["ankle"] ? "animate-ring" : ""}
                  />
                  {/* Right Ankle / Achilles / Foot */}
                  <circle
                    cx="150"
                    cy="370"
                    r={hotspots["ankle"] ? "10" : "4"}
                    fill={hotspots["ankle"] ? "#ef4444" : "#475569"}
                    className={hotspots["ankle"] ? "animate-ring" : ""}
                  />
                </svg>

                {latestLog && latestLog.affectedBodyPart && latestLog.affectedBodyPart !== "none" && (
                  <div className="absolute top-1 right-0 bg-rose-600 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow border border-rose-400 animate-pulse">
                    Active: {latestLog.bodySide} {latestLog.affectedBodyPart}
                  </div>
                )}
              </div>
            </div>

            {/* Condition Breakdown & Athlete Guidance Card */}
            <div className="mt-4 bg-[#282c35] p-4 rounded-2xl border border-slate-700/60 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300">Biomechanical Status</span>
                <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full uppercase ${priorityBadge(latestLog?.reviewPriority || "low")}`}>
                  {latestLog?.reviewPriority || "Normal"}
                </span>
              </div>

              <div>
                <p className="text-sm font-black text-white capitalize">
                  {latestLog?.bodySide} {latestLog?.affectedBodyPart || "No Discomfort"}
                </p>
                <p className="text-xs text-slate-400 capitalize">
                  {latestLog?.symptomType ? `${latestLog.symptomType} • ${latestLog.onset || "Acute"}` : "All systems clear"}
                </p>
              </div>

              {/* Severity Ruler */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] font-bold">
                  <span className="text-slate-400">Reported Severity</span>
                  <span className="text-rose-400 font-extrabold">{latestLog?.reportedSeverity || 0} / 10</span>
                </div>
                <div className="h-2 w-full bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-rose-600 rounded-full transition-all duration-500"
                    style={{ width: `${((latestLog?.reportedSeverity || 0) / 10) * 100}%` }}
                  ></div>
                </div>
              </div>

              {/* Immediate Athlete Guidance Box */}
              {latestLog && latestLog.emergencyGuidance && (
                <div className="bg-rose-950/60 border border-rose-500/40 p-3 rounded-xl space-y-1.5">
                  <div className="flex items-center space-x-1.5 text-rose-300 font-bold text-[10px] uppercase tracking-wider">
                    <span>🛡️</span>
                    <span>Immediate Injury Care Guidance</span>
                  </div>
                  <p className="text-[11px] text-slate-200 leading-relaxed">
                    {latestLog.emergencyGuidance}
                  </p>
                  <div className="pt-1.5 border-t border-rose-900/50 flex items-center justify-between text-[9px] text-slate-400">
                    <span>Forwarded to: Coach Marcus</span>
                    <span className="text-emerald-400 font-bold">In Triage Queue</span>
                  </div>
                </div>
              )}

              <div className="pt-2 border-t border-slate-700 flex justify-between text-[10px] text-slate-400">
                <span>AI Confidence:</span>
                <span className="text-emerald-400 font-bold">
                  {latestLog?.extractionConfidence ? `${Math.round(latestLog.extractionConfidence * 100)}%` : "98% (Hybrid AI)"}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Metrics Footer */}
          <div className="space-y-1.5 pt-3 border-t border-slate-700/60 text-xs">
            <div className="flex justify-between text-slate-400">
              <span>Readiness Index:</span>
              <span className="text-white font-bold">84%</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Weekly Logs:</span>
              <span className="text-white font-bold">{myLogs.length || 4} sessions</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Coach Clearance:</span>
              <span className="text-emerald-400 font-bold">Active Protocol</span>
            </div>
          </div>
        </aside>

      </div>

      {/* CREATE LOG / DISCOMFORT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900">Log Workout & Discomfort</h3>
                <p className="text-xs text-slate-400">Natural language report analyzed for clinical markers.</p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            {/* Quick Test Presets */}
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Quick 1-Click Test Presets:
              </span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => applyPreset("knee")}
                  className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold px-2.5 py-1 rounded-lg"
                >
                  ⚡ Knee Pop (Urgent)
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset("shoulder")}
                  className="bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 text-xs font-bold px-2.5 py-1 rounded-lg"
                >
                  🏊 Shoulder Ache (Medium)
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset("fatigue")}
                  className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold px-2.5 py-1 rounded-lg"
                >
                  🏃 Fatigue (Low)
                </button>
              </div>
            </div>

            <form onSubmit={handleCreateLog} className="space-y-3.5">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  1. Training Description
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="e.g. 4000m swim with high threshold butterfly sets"
                  value={formData.workoutDescription}
                  onChange={(e) => setFormData({ ...formData, workoutDescription: e.target.value })}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:outline-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-rose-600 block mb-1">
                  2. Discomfort / Pain Description (Plain Language)
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. Felt a sharp pinch in right shoulder when elevating arm overhead."
                  value={formData.discomfortText}
                  onChange={(e) => setFormData({ ...formData, discomfortText: e.target.value })}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:outline-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Activity</label>
                  <select
                    value={formData.activity}
                    onChange={(e) => setFormData({ ...formData, activity: e.target.value })}
                    className="w-full text-xs p-2 rounded-xl border border-slate-300 bg-white"
                  >
                    <option value="swimming">Swimming</option>
                    <option value="running">Running</option>
                    <option value="strength training">Strength Training</option>
                    <option value="cycling">Cycling</option>
                    <option value="conditioning">Conditioning</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Affected Area</label>
                  <select
                    value={formData.affectedBodyPart}
                    onChange={(e) => setFormData({ ...formData, affectedBodyPart: e.target.value })}
                    className="w-full text-xs p-2 rounded-xl border border-slate-300 bg-white"
                  >
                    <option value="shoulder">Shoulder</option>
                    <option value="arm">Arm / Bicep</option>
                    <option value="elbow">Elbow</option>
                    <option value="wrist">Wrist / Hand</option>
                    <option value="hamstring">Hamstring</option>
                    <option value="quad">Thigh / Quad</option>
                    <option value="knee">Knee</option>
                    <option value="calf">Calf / Shin</option>
                    <option value="ankle">Ankle / Achilles / Foot</option>
                    <option value="lower back">Lower Back</option>
                    <option value="hip">Hip / Groin</option>
                    <option value="neck">Neck</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Side</label>
                  <select
                    value={formData.bodySide}
                    onChange={(e) => setFormData({ ...formData, bodySide: e.target.value })}
                    className="w-full text-xs p-2 rounded-xl border border-slate-300 bg-white"
                  >
                    <option value="right">Right</option>
                    <option value="left">Left</option>
                    <option value="bilateral">Bilateral</option>
                    <option value="center">Center</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Onset</label>
                  <select
                    value={formData.onset}
                    onChange={(e) => setFormData({ ...formData, onset: e.target.value })}
                    className="w-full text-xs p-2 rounded-xl border border-slate-300 bg-white"
                  >
                    <option value="acute">Acute (Sudden)</option>
                    <option value="gradual">Gradual (Building up)</option>
                    <option value="post-exercise">Post-Exercise</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-bold text-slate-700">Pain Severity (1 to 10)</label>
                  <span className="text-xs font-extrabold text-rose-600">{formData.reportedSeverity} / 10</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={formData.reportedSeverity}
                  onChange={(e) => setFormData({ ...formData, reportedSeverity: parseInt(e.target.value, 10) })}
                  className="w-full accent-rose-600 cursor-pointer"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-md disabled:opacity-50"
                >
                  {isSubmitting ? "Submitting..." : "Submit Log & Alert Coach"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-3 text-center text-xs text-slate-400">
        AthletePulse Platform • Next.js App Router & Mongoose • Role-Based Athlete & Coach Isolation
      </footer>
    </div>
  );
}
