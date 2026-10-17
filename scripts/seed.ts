import mongoose from "mongoose";
import { connectToDatabase, disconnectDatabase } from "../src/lib/db";
import { User } from "../src/models/User";
import { DailyLog } from "../src/models/DailyLog";
import { CoachFeedback } from "../src/models/CoachFeedback";
import { hashPassword } from "../src/lib/auth";

export async function seedDatabase() {
  console.log("==========================================");
  console.log("   ATHLETEPULSE DATABASE SEED SCRIPT      ");
  console.log("==========================================");

  if (mongoose.connection.readyState !== 1) {
    await connectToDatabase();
  }

  // Clear existing collections for a clean reproducible state
  console.log("[Seed] Clearing existing demo collections...");
  await Promise.all([
    User.deleteMany({}),
    DailyLog.deleteMany({}),
    CoachFeedback.deleteMany({}),
  ]);

  const defaultPasswordHash = await hashPassword("password123");

  // 1. Create Coaches
  console.log("[Seed] Creating demo coaches...");
  const coachMarcus = await User.create({
    name: "Coach Marcus Vance",
    email: "coach@athletepulse.test",
    passwordHash: defaultPasswordHash,
    role: "coach",
    sport: "Distance Running & Endurance",
  });

  const coachStranger = await User.create({
    name: "Coach Lisa Ray",
    email: "stranger.coach@athletepulse.test",
    passwordHash: defaultPasswordHash,
    role: "coach",
    sport: "Triathlon Coaching",
  });

  // 2. Create Athletes
  console.log("[Seed] Creating demo athletes...");
  const athleteElena = await User.create({
    name: "Elena Rostova",
    email: "elena.swimmer@athletepulse.test",
    passwordHash: defaultPasswordHash,
    role: "athlete",
    sport: "Competitive Swimming",
    coachId: coachMarcus._id,
  });

  const athleteMarcus = await User.create({
    name: "Marcus Miller",
    email: "marcus.runner@athletepulse.test",
    passwordHash: defaultPasswordHash,
    role: "athlete",
    sport: "Marathon Running",
    coachId: coachMarcus._id,
  });

  const athleteSolo = await User.create({
    name: "David Chen",
    email: "solo.athlete@athletepulse.test",
    passwordHash: defaultPasswordHash,
    role: "athlete",
    sport: "CrossFit",
    coachId: undefined, // Solo athlete not assigned to Coach Marcus
  });

  console.log(`[Seed] Created 2 coaches and 3 athletes.`);

  // 3. Create Daily Logs with realistic symptoms and triage classifications
  console.log("[Seed] Creating realistic daily workout and discomfort logs...");

  // Elena Log 1: Urgent knee pop
  const elenaLog1 = await DailyLog.create({
    athleteId: athleteElena._id,
    workoutDescription: "Morning sprint intervals in 50m Olympic pool (10x100m push pace).",
    discomfortText:
      "Felt a sudden sharp pop in my right knee during the flip turn at the wall. Immediate swelling, cannot bend it fully, pain rated 8/10.",
    activity: "Olympic pool sprint flip turns",
    affectedBodyPart: "knee",
    bodySide: "right",
    symptomType: "sharp_pain",
    onset: "acute",
    reportedSeverity: 8,
    extractionConfidence: 0.95,
    extractionStatus: "success",
    reviewPriority: "urgent",
    reviewStatus: "pending",
    triageFlags: [
      'Flagged term: "pop" (Reported acute mechanical sensation)',
      'Flagged term: "sharp pain" (Described quality of discomfort)',
      'Flagged term: "swelling" (Reported inflammatory / effusion symptom)',
      "Reported severity: 8/10 (Severe athlete-rated discomfort)",
    ],
    emergencyGuidance: undefined,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3), // 3 hours ago
  });

  // Elena Log 2: Shoulder dull ache (already reviewed with feedback)
  const elenaLog2 = await DailyLog.create({
    athleteId: athleteElena._id,
    workoutDescription: "Endurance swim session: 3,500m steady aerobic threshold.",
    discomfortText: "Moderate dull ache and stiffness in front of left shoulder, 4/10 discomfort after stroke 2500m.",
    activity: "3,500m aerobic threshold freestyle",
    affectedBodyPart: "shoulder",
    bodySide: "left",
    symptomType: "dull_ache",
    onset: "post_workout",
    reportedSeverity: 4,
    extractionConfidence: 0.88,
    extractionStatus: "success",
    reviewPriority: "medium",
    reviewStatus: "addressed",
    triageFlags: [
      'Flagged term: "dull ache" (Described quality of discomfort)',
      'Flagged term: "stiffness" (Reported movement restriction)',
    ],
    reviewedBy: coachMarcus._id,
    reviewedAt: new Date(Date.now() - 1000 * 60 * 60 * 20),
    reviewNotes: "Modified overhead load and added corrective cuff rotations.",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
  });

  // Elena Log 3: Clean log (no discomfort)
  await DailyLog.create({
    athleteId: athleteElena._id,
    workoutDescription: "Core strengthening and resistance band hip abductor circuits.",
    discomfortText: "",
    activity: "Core & hip mobility circuits",
    affectedBodyPart: "unspecified",
    bodySide: "unspecified",
    symptomType: "none",
    onset: "unknown",
    reportedSeverity: 0,
    extractionConfidence: 1.0,
    extractionStatus: "not_requested",
    reviewPriority: "low",
    reviewStatus: "reviewed",
    triageFlags: [],
    reviewedBy: coachMarcus._id,
    reviewedAt: new Date(Date.now() - 1000 * 60 * 60 * 40),
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48), // 2 days ago
  });

  // Marcus Miller Log 1: Achilles tightness
  const marcusLog1 = await DailyLog.create({
    athleteId: athleteMarcus._id,
    workoutDescription: "16km continuous tempo run including 4x800m rolling hill surges.",
    discomfortText: "Right achilles tightness and throbbing pain following the hill surges, rated 6/10.",
    activity: "16km rolling hill tempo run",
    affectedBodyPart: "achilles",
    bodySide: "right",
    symptomType: "throbbing",
    onset: "gradual",
    reportedSeverity: 6,
    extractionConfidence: 0.92,
    extractionStatus: "success",
    reviewPriority: "high",
    reviewStatus: "pending",
    triageFlags: [
      'Flagged term: "throbbing" (Reported vascular / inflammatory sensation)',
      'Flagged term: "tightness" (Reported muscle/tendon tension)',
      "Reported severity: 6/10 (Moderate-to-high athlete-rated discomfort)",
    ],
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5), // 5 hours ago
  });

  // David Chen (Solo athlete) Log 1
  await DailyLog.create({
    athleteId: athleteSolo._id,
    workoutDescription: "Deadlift 5x5 @ 180kg followed by 3 rounds of row and kettlebell swings.",
    discomfortText: "Lower back tightness and dull ache rated 5/10.",
    activity: "Heavy barbell deadlifts and kettlebells",
    affectedBodyPart: "back",
    bodySide: "center",
    symptomType: "tightness",
    onset: "post_workout",
    reportedSeverity: 5,
    extractionConfidence: 0.85,
    extractionStatus: "success",
    reviewPriority: "medium",
    reviewStatus: "pending",
    triageFlags: ['Flagged term: "tightness" (Reported muscle/tendon tension)'],
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 8),
  });

  // 4. Create Coach Feedback
  console.log("[Seed] Creating coach feedback records...");
  // Feedback 1: Acknowledged by Elena
  await CoachFeedback.create({
    athleteId: athleteElena._id,
    coachId: coachMarcus._id,
    logId: elenaLog2._id,
    message:
      "Good awareness reporting the shoulder stiffness early, Elena. Let us ensure this does not progress into subacromial irritation.",
    activityModification:
      "Reduce freestyle pull volume by 50% over the next 48 hours. Substitute with kick sets using a snorkel (arms at side) and perform 3 sets of 15 light external rotations.",
    acknowledgementStatus: "acknowledged",
    acknowledgedAt: new Date(Date.now() - 1000 * 60 * 60 * 18),
  });

  // Feedback 2: Pending acknowledgement by Marcus Miller
  await CoachFeedback.create({
    athleteId: athleteMarcus._id,
    coachId: coachMarcus._id,
    logId: marcusLog1._id,
    message:
      "Marcus, stop all uphill running immediately. Achilles tendons need prompt load reduction to prevent tendinopathy.",
    activityModification:
      "Switch tomorrow's track workout to a 45-minute easy stationary bike session (cadence 85-90 RPM). Apply ice for 15 minutes post-ride and avoid eccentric calf drops.",
    acknowledgementStatus: "pending",
  });

  console.log("==========================================");
  console.log("   DEMO CREDENTIALS SEEDED SUCCESSFULLY  ");
  console.log("==========================================");
  console.log("1. Assigned Coach:");
  console.log("   Email: coach@athletepulse.test");
  console.log("   Password: password123");
  console.log("2. Athlete 1 (Assigned to Marcus Vance):");
  console.log("   Email: elena.swimmer@athletepulse.test");
  console.log("   Password: password123");
  console.log("3. Athlete 2 (Assigned to Marcus Vance):");
  console.log("   Email: marcus.runner@athletepulse.test");
  console.log("   Password: password123");
  console.log("4. Unassigned Coach (Cross-user isolation test):");
  console.log("   Email: stranger.coach@athletepulse.test");
  console.log("   Password: password123");
  console.log("5. Solo Athlete (Not on Coach Vance's roster):");
  console.log("   Email: solo.athlete@athletepulse.test");
  console.log("   Password: password123");
  console.log("==========================================");
}

// Execute directly if run as a CLI script
if (require.main === module || process.argv[1]?.includes("seed")) {
  seedDatabase()
    .then(async () => {
      console.log("[Seed] Completed successfully.");
      await disconnectDatabase();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error("[Seed] Error during seeding:", err);
      await disconnectDatabase();
      process.exit(1);
    });
}
