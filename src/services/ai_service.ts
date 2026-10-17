import { z } from "zod";
import { env } from "@/lib/env";
import {
  BodySide,
  SymptomType,
  OnsetType,
  ReviewPriority,
  ExtractionStatus,
} from "@/models/DailyLog";

// Schema for validating AI or rule-based extracted output
export const aiExtractionOutputSchema = z.object({
  affectedBodyPart: z.string().trim().toLowerCase().default("unspecified"),
  bodySide: z
    .enum(["left", "right", "bilateral", "center", "unspecified"])
    .default("unspecified"),
  symptomType: z
    .enum([
      "sharp_pain",
      "dull_ache",
      "tightness",
      "stiffness",
      "swelling",
      "throbbing",
      "soreness",
      "weakness",
      "numbness_tingling",
      "other",
      "none",
    ])
    .default("none"),
  onset: z
    .enum(["acute", "gradual", "insidious", "post_workout", "unknown"])
    .default("unknown"),
  reportedSeverity: z.number().min(0).max(10).default(0),
  activity: z.string().trim().default("general"),
  confidence: z.number().min(0).max(1).default(0.5),
  uncertaintyNotes: z.string().optional(),
});

export type AiExtractionResult = z.infer<typeof aiExtractionOutputSchema>;

export interface TriageResult {
  reviewPriority: ReviewPriority;
  triageFlags: string[];
  emergencyGuidance: string | null;
}

export interface ProcessedLogData {
  extracted: AiExtractionResult;
  triage: TriageResult;
  extractionStatus: ExtractionStatus;
}

/**
 * Common anatomical body parts for deterministic mapping
 */
const BODY_PARTS = [
  "lower back",
  "upper back",
  "back",
  "hamstring",
  "quadriceps",
  "quad",
  "thigh",
  "knee",
  "ankle",
  "calf",
  "shin",
  "achilles",
  "heel",
  "foot",
  "shoulder",
  "arm",
  "bicep",
  "tricep",
  "forearm",
  "elbow",
  "wrist",
  "hand",
  "hip",
  "groin",
  "neck",
  "chest",
];

/**
 * Deterministic fallback extractor for reliable, zero-downtime parsing
 */
export function extractWithRules(
  workoutDescription: string,
  discomfortText: string,
  selfReportedSeverity: number = 0
): AiExtractionResult {
  const combinedText = `${workoutDescription} ${discomfortText}`.toLowerCase();

  // 1. Detect body side
  let bodySide: BodySide = "unspecified";
  if (combinedText.includes("bilateral") || combinedText.includes("both")) {
    bodySide = "bilateral";
  } else if (combinedText.includes("left")) {
    bodySide = "left";
  } else if (combinedText.includes("right")) {
    bodySide = "right";
  } else if (combinedText.includes("center") || combinedText.includes("middle")) {
    bodySide = "center";
  }

  // 2. Detect affected body part
  let affectedBodyPart = "unspecified";
  for (const part of BODY_PARTS) {
    if (combinedText.includes(part)) {
      if (part === "quad") affectedBodyPart = "quadriceps";
      else if (part === "bicep" || part === "tricep" || part === "forearm") affectedBodyPart = "arm";
      else affectedBodyPart = part;
      break;
    }
  }

  // 3. Detect symptom type
  let symptomType: SymptomType = "none";
  if (
    combinedText.includes("sharp") ||
    combinedText.includes("stabbing") ||
    combinedText.includes("stinging") ||
    combinedText.includes("pinch") ||
    combinedText.includes("burning") ||
    combinedText.includes("electric")
  ) {
    symptomType = "sharp_pain";
  } else if (combinedText.includes("numb") || combinedText.includes("tingling") || combinedText.includes("pins and needles")) {
    symptomType = "numbness_tingling";
  } else if (combinedText.includes("swell") || combinedText.includes("puffy") || combinedText.includes("fluid")) {
    symptomType = "swelling";
  } else if (combinedText.includes("throbb")) {
    symptomType = "throbbing";
  } else if (combinedText.includes("weak")) {
    symptomType = "weakness";
  } else if (combinedText.includes("tight") || combinedText.includes("spasm") || combinedText.includes("cramp")) {
    symptomType = "tightness";
  } else if (combinedText.includes("stiff")) {
    symptomType = "stiffness";
  } else if (combinedText.includes("dull") || combinedText.includes("ache") || combinedText.includes("tweak")) {
    symptomType = "dull_ache";
  } else if (combinedText.includes("sore")) {
    symptomType = "soreness";
  } else if (discomfortText.trim().length > 0) {
    symptomType = "other";
  }

  // 4. Detect onset
  let onset: OnsetType = "unknown";
  if (
    combinedText.includes("sudden") ||
    combinedText.includes("instant") ||
    combinedText.includes("acute") ||
    combinedText.includes("pop") ||
    combinedText.includes("snap")
  ) {
    onset = "acute";
  } else if (
    combinedText.includes("after workout") ||
    combinedText.includes("post-run") ||
    combinedText.includes("cooled down")
  ) {
    onset = "post_workout";
  } else if (
    combinedText.includes("gradual") ||
    combinedText.includes("slowly") ||
    combinedText.includes("over the past") ||
    combinedText.includes("past few days")
  ) {
    onset = "gradual";
  }

  // 5. Detect reported severity (from explicit input or regex like "7/10")
  let reportedSeverity = selfReportedSeverity;
  const matchSeverity = combinedText.match(/(\d{1,2})\s*\/\s*10/);
  if (matchSeverity && matchSeverity[1]) {
    const parsed = parseInt(matchSeverity[1], 10);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 10) {
      reportedSeverity = parsed;
    }
  }

  // 6. Detect activity snippet
  let activity = "general workout";
  if (workoutDescription.length > 0) {
    activity = workoutDescription.slice(0, 80).trim();
  }

  return {
    affectedBodyPart,
    bodySide,
    symptomType,
    onset,
    reportedSeverity: Math.min(10, Math.max(0, reportedSeverity)),
    activity,
    confidence: discomfortText.trim().length > 0 ? 0.75 : 0.4,
    uncertaintyNotes: "Extracted via deterministic clinical rule-based engine",
  };
}

/**
 * Transparent safety and triage evaluation.
 * Explains exactly which user-reported terms triggered flags.
 * Distinguishes reported severity from review priority.
 * Detects emergency red flags.
 */
export function computeTriageAndSafety(
  discomfortText: string,
  workoutDescription: string,
  extracted: AiExtractionResult
): TriageResult {
  const combined = `${workoutDescription} ${discomfortText}`.toLowerCase();
  const triageFlags: string[] = [];
  let reviewPriority: ReviewPriority = "low";
  let emergencyGuidance: string | null = null;

  // Emergency Red Flags
  const emergencyKeywords = [
    { term: "cannot bear weight", desc: "Unable to bear weight on limb" },
    { term: "can't bear weight", desc: "Unable to bear weight on limb" },
    { term: "unable to walk", desc: "Loss of ambulatory ability" },
    { term: "deformity", desc: "Visible deformity or structural displacement" },
    { term: "dislocated", desc: "Suspected joint dislocation" },
    { term: "loss of consciousness", desc: "Loss of consciousness / head injury" },
    { term: "blackout", desc: "Syncope / blackout" },
    { term: "chest pain", desc: "Reported chest pain / cardiovascular symptom" },
    { term: "shortness of breath", desc: "Acute shortness of breath" },
  ];

  for (const item of emergencyKeywords) {
    if (combined.includes(item.term)) {
      triageFlags.push(`[EMERGENCY WARNING] User reported: "${item.term}" (${item.desc})`);
      reviewPriority = "urgent";
      emergencyGuidance =
        "URGENT CARE NOTICE: Your log mentions severe or acute signs (such as inability to bear weight or acute trauma). Do NOT wait for coach review. Please seek immediate professional medical attention at an urgent care or emergency facility.";
    }
  }

  // Conservative concerning symptom patterns for coach review priority
  const acuteMechanicalKeywords = ["pop", "popped", "snapped", "tear", "tearing", "giving way", "buckled", "locked"];
  for (const word of acuteMechanicalKeywords) {
    // Check whole word or token
    const regex = new RegExp(`\\b${word}\\b`, "i");
    if (regex.test(combined)) {
      triageFlags.push(`Flagged term: "${word}" (Reported acute mechanical sensation)`);
      if (reviewPriority !== "urgent") {
        reviewPriority = "urgent";
      }
    }
  }

  // Neurological signs
  const neuroKeywords = ["numbness", "tingling", "pins and needles", "shooting pain", "radiating pain"];
  for (const term of neuroKeywords) {
    if (combined.includes(term)) {
      triageFlags.push(`Flagged term: "${term}" (Reported neurological / radicular symptom)`);
      if (reviewPriority === "low") {
        reviewPriority = "high";
      }
    }
  }

  // Sharp pain notice: A sharp pain description alone must not automatically establish clinical severity,
  // but indicates a prioritized coach review if active.
  if (extracted.symptomType === "sharp_pain" || combined.includes("sharp pain")) {
    triageFlags.push('Flagged term: "sharp pain" (Described quality of discomfort)');
    if (reviewPriority === "low") {
      reviewPriority = "medium";
    }
  }

  // Swelling notice
  if (extracted.symptomType === "swelling" || combined.includes("swelling") || combined.includes("swollen")) {
    triageFlags.push('Flagged term: "swelling" (Reported inflammatory / effusion symptom)');
    if (reviewPriority === "low") {
      reviewPriority = "medium";
    }
  }

  // Severity-based priority adjustments
  if (extracted.reportedSeverity >= 8) {
    triageFlags.push(`Reported severity: ${extracted.reportedSeverity}/10 (Severe athlete-rated discomfort)`);
    if (reviewPriority !== "urgent") {
      reviewPriority = "urgent";
    }
  } else if (extracted.reportedSeverity >= 6) {
    triageFlags.push(`Reported severity: ${extracted.reportedSeverity}/10 (Moderate-to-high athlete-rated discomfort)`);
    if (reviewPriority === "low") {
      reviewPriority = "high";
    }
  } else if (extracted.reportedSeverity >= 4) {
    if (reviewPriority === "low") {
      reviewPriority = "medium";
    }
  }

  // Automated athletic care guidance based on anatomical area
  if (!emergencyGuidance && discomfortText.trim().length > 0) {
    const bp = (extracted.affectedBodyPart || "").toLowerCase();
    if (bp.includes("hamstring") || bp.includes("quad") || bp.includes("thigh")) {
      emergencyGuidance = "Initial Care Guidance: Cease ballistic sprints. Apply RICE protocol (Rest, Ice 15-20 min, Compression). Avoid deep aggressive stretching. Coach notified to review volume.";
    } else if (bp.includes("arm") || bp.includes("shoulder") || bp.includes("bicep") || bp.includes("elbow") || bp.includes("wrist") || bp.includes("hand")) {
      emergencyGuidance = "Initial Care Guidance: Limit forceful throwing, heavy dribbling/loading, or overhead reach. Apply cold pack for 15 minutes. Coach notified to adjust practice drill.";
    } else if (bp.includes("knee")) {
      emergencyGuidance = "Initial Care Guidance: Elevate limb and apply cold therapy. Avoid deep loaded knee flexion until reviewed by coaching staff.";
    } else if (bp.includes("back")) {
      emergencyGuidance = "Initial Care Guidance: Decompress spine, avoid heavy axial loading or rotational torque. Perform gentle pain-free mobility.";
    } else if (bp.includes("ankle") || bp.includes("calf") || bp.includes("achilles") || bp.includes("foot") || bp.includes("shin")) {
      emergencyGuidance = "Initial Care Guidance: Minimize high impact running. Wrap with supportive compression and ice for 15-20 minutes.";
    } else {
      emergencyGuidance = "Initial Care Guidance: Rest the affected area and avoid aggravating drills. Report submitted to your coach for review.";
    }
  }

  return {
    reviewPriority,
    triageFlags,
    emergencyGuidance,
  };
}

/**
 * Call configured AI provider (Groq or OpenAI-compatible) with timeout and validation.
 * Never sets athlete identity or clinical diagnoses.
 */
export async function extractSymptomFields(
  workoutDescription: string,
  discomfortText: string,
  selfReportedSeverity: number = 0
): Promise<ProcessedLogData> {
  // If no discomfort is reported, return minimal safe defaults
  if (!discomfortText || discomfortText.trim().length === 0) {
    const extracted: AiExtractionResult = {
      affectedBodyPart: "unspecified",
      bodySide: "unspecified",
      symptomType: "none",
      onset: "unknown",
      reportedSeverity: selfReportedSeverity,
      activity: workoutDescription.slice(0, 80).trim() || "general workout",
      confidence: 1.0,
      uncertaintyNotes: "No discomfort reported",
    };
    return {
      extracted,
      triage: {
        reviewPriority: "low",
        triageFlags: [],
        emergencyGuidance: null,
      },
      extractionStatus: "not_requested",
    };
  }

  const provider = env.AI_PROVIDER?.toLowerCase();
  const apiKey =
    provider === "groq"
      ? env.GROQ_API_KEY
      : provider === "openai"
      ? env.OPENAI_API_KEY
      : null;

  // If no provider or API key is configured, immediately use deterministic rule extractor
  if (!provider || provider === "none" || !apiKey) {
    const extracted = extractWithRules(
      workoutDescription,
      discomfortText,
      selfReportedSeverity
    );
    const triage = computeTriageAndSafety(
      discomfortText,
      workoutDescription,
      extracted
    );
    return {
      extracted,
      triage,
      extractionStatus: "fallback",
    };
  }

  // Attempt external LLM extraction with 4-second timeout
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const endpoint =
      provider === "groq"
        ? "https://api.groq.com/openai/v1/chat/completions"
        : "https://api.openai.com/v1/chat/completions";

    const modelName =
      env.AI_MODEL ||
      (provider === "groq" ? "llama-3.3-70b-versatile" : "gpt-4o-mini");

    const systemPrompt = `You are a sports injury text-parser assistant for AthletePulse.
Your role is STRICTLY factual information extraction from an athlete's workout and discomfort report.
DO NOT provide a medical diagnosis.
DO NOT predict injury risk or invent details not stated by the athlete.
DO NOT recommend clinical rehabilitation or exercises.

Extract the following JSON fields:
- affectedBodyPart: anatomical string (e.g. "knee", "shoulder", "ankle", "hamstring", "unspecified")
- bodySide: one of ["left", "right", "bilateral", "center", "unspecified"]
- symptomType: one of ["sharp_pain", "dull_ache", "tightness", "stiffness", "swelling", "throbbing", "soreness", "weakness", "numbness_tingling", "other", "none"]
- onset: one of ["acute", "gradual", "insidious", "post_workout", "unknown"]
- reportedSeverity: number from 0 to 10 (use user-specified number if mentioned, else approximate based strictly on wording)
- activity: concise sport/movement name mentioned in the workout
- confidence: number between 0.0 and 1.0 reflecting confidence in factual extraction
- uncertaintyNotes: brief string noting any ambiguity in user's phrasing`;

    const userPrompt = `Workout description: "${workoutDescription}"
Discomfort text: "${discomfortText}"
Self-reported severity: ${selfReportedSeverity}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`LLM provider responded with status ${response.status}`);
    }

    const json = await response.json();
    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Empty response from AI provider");
    }

    const rawParsed = JSON.parse(content);
    const validated = aiExtractionOutputSchema.parse(rawParsed);

    const triage = computeTriageAndSafety(
      discomfortText,
      workoutDescription,
      validated
    );

    return {
      extracted: validated,
      triage,
      extractionStatus: "success",
    };
  } catch (err) {
    console.warn(
      "[AI Service] Provider call failed or timed out. Falling back to rule-based parser:",
      (err as Error).message
    );
    const extracted = extractWithRules(
      workoutDescription,
      discomfortText,
      selfReportedSeverity
    );
    const triage = computeTriageAndSafety(
      discomfortText,
      workoutDescription,
      extracted
    );
    return {
      extracted,
      triage,
      extractionStatus: "fallback",
    };
  }
}
