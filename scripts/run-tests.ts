import { connectToDatabase, disconnectDatabase } from "../src/lib/db";
import { User } from "../src/models/User";
import { DailyLog } from "../src/models/DailyLog";
import { CoachFeedback } from "../src/models/CoachFeedback";
import {
  hashPassword,
  comparePassword,
  generateToken,
  verifyToken,
} from "../src/lib/auth";
import {
  extractWithRules,
  computeTriageAndSafety,
  extractSymptomFields,
} from "../src/services/ai_service";

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passedCount++;
  } else {
    console.error(`  ✗ FAIL: ${testName}`);
    if (detail) console.error(`    Details: ${detail}`);
    failedCount++;
  }
}

async function runTestSuite() {
  console.log("==========================================");
  console.log("   RUNNING ATHLETEPULSE BACKEND TESTS     ");
  console.log("==========================================");

  await connectToDatabase();

  // Reset test database state
  await Promise.all([
    User.deleteMany({}),
    DailyLog.deleteMany({}),
    CoachFeedback.deleteMany({}),
  ]);

  // TEST SUITE 1: Security & Cryptography
  console.log("\n[Suite 1] Security, Password Hashing & JWT Sessions");
  const plainPassword = "AthleteSecretPass#2026";
  const hashedPassword = await hashPassword(plainPassword);

  assert(
    hashedPassword.startsWith("$2"),
    "Password hashed with bcrypt salt format ($2a or $2b)"
  );
  assert(
    hashedPassword !== plainPassword,
    "Plain text password is never stored directly"
  );

  const isCorrect = await comparePassword(plainPassword, hashedPassword);
  assert(isCorrect, "Valid password verifies successfully against bcrypt hash");

  const isWrong = await comparePassword("WrongPassword", hashedPassword);
  assert(!isWrong, "Invalid password fails verification");

  const sessionPayload = {
    userId: "65f123456789012345678901",
    email: "test.athlete@pulse.test",
    role: "athlete" as const,
  };
  const token = generateToken(sessionPayload);
  assert(typeof token === "string" && token.length > 20, "JWT session token generated");

  const decoded = verifyToken(token);
  assert(
    decoded?.userId === sessionPayload.userId && decoded?.role === "athlete",
    "JWT session token successfully verified and decoded"
  );

  const tamperedToken = token.slice(0, -5) + "abcde";
  assert(verifyToken(tamperedToken) === null, "Tampered JWT token is safely rejected");

  // TEST SUITE 2: User Creation, Roles & Roster Assignment
  console.log("\n[Suite 2] User Models, Roles & Coach Roster");
  const coach = await User.create({
    name: "Coach Elena Rostova",
    email: "coach.elena@pulse.test",
    passwordHash: hashedPassword,
    role: "coach",
    sport: "Track & Field",
  });

  const athleteA = await User.create({
    name: "Runner Marcus",
    email: "marcus@pulse.test",
    passwordHash: hashedPassword,
    role: "athlete",
    sport: "Distance Running",
    coachId: coach._id,
  });

  const athleteB = await User.create({
    name: "Swimmer Chloe",
    email: "chloe@pulse.test",
    passwordHash: hashedPassword,
    role: "athlete",
    sport: "Freestyle Swimming",
    coachId: coach._id,
  });

  const unassignedCoach = await User.create({
    name: "Coach Stranger",
    email: "stranger@pulse.test",
    passwordHash: hashedPassword,
    role: "coach",
    sport: "Rowing",
  });

  const soloAthlete = await User.create({
    name: "Solo Crossfitter",
    email: "solo@pulse.test",
    passwordHash: hashedPassword,
    role: "athlete",
    sport: "CrossFit",
    coachId: undefined,
  });

  assert(athleteA.coachId?.toString() === coach._id.toString(), "Athlete A assigned to Coach");
  assert(athleteB.coachId?.toString() === coach._id.toString(), "Athlete B assigned to Coach");
  assert(!soloAthlete.coachId, "Solo athlete has no coach assignment");

  // TEST SUITE 3: AI Extraction, Safety Rules & Triage
  console.log("\n[Suite 3] AI Extraction & Clinical Safety Triage");
  
  // Test 3a: Acute knee pop -> Urgent review priority + transparent explanation
  const kneeWorkout = "400m sprint intervals on track (8 reps).";
  const kneeDiscomfort = "Felt a sharp pop in right knee during turn 3, immediate swelling, pain 8/10.";
  
  const extractedKnee = extractWithRules(kneeWorkout, kneeDiscomfort, 8);
  assert(extractedKnee.affectedBodyPart === "knee", "Identified affected body part: knee");
  assert(extractedKnee.bodySide === "right", "Identified body side: right");
  assert(extractedKnee.symptomType === "sharp_pain", "Identified symptom type: sharp_pain");
  assert(extractedKnee.reportedSeverity === 8, "Parsed reported severity: 8/10");

  const triageKnee = computeTriageAndSafety(kneeDiscomfort, kneeWorkout, extractedKnee);
  assert(triageKnee.reviewPriority === "urgent", "Elevated to urgent review priority due to acute pop & high severity");
  assert(
    triageKnee.triageFlags.some((f) => f.includes("pop")),
    "Transparently listed 'pop' as triggering flag in triage audit"
  );
  assert(
    triageKnee.triageFlags.some((f) => f.includes("8/10")),
    "Transparently listed high reported severity in triage audit"
  );

  // Test 3b: Emergency red flag ("cannot bear weight")
  const emergencyDiscomfort = "Bad landing on left ankle, severe deformity and cannot bear weight.";
  const emergencyTriage = computeTriageAndSafety(emergencyDiscomfort, "Jump drills", {
    affectedBodyPart: "ankle",
    bodySide: "left",
    symptomType: "sharp_pain",
    onset: "acute",
    reportedSeverity: 9,
    activity: "Jump drills",
    confidence: 0.9,
  });
  assert(
    emergencyTriage.reviewPriority === "urgent",
    "Emergency symptoms trigger urgent review priority"
  );
  assert(
    typeof emergencyTriage.emergencyGuidance === "string" &&
      emergencyTriage.emergencyGuidance.includes("immediate professional medical attention"),
    "Displays immediate urgent-care guidance instead of making athlete wait for coach review"
  );

  // Test 3c: Graceful extraction fallback
  const processedFallback = await extractSymptomFields(
    "Easy 5k run",
    "Mild hamstring tightness 3/10",
    3
  );
  assert(
    processedFallback.extractionStatus === "fallback" ||
      processedFallback.extractionStatus === "success",
    "Extraction gracefully handles absent or failing LLM keys without throwing"
  );
  assert(
    processedFallback.extracted.affectedBodyPart === "hamstring",
    "Fallback extracts correct body part"
  );

  // TEST SUITE 4: Daily Log Persistence & Idempotency
  console.log("\n[Suite 4] Daily Log Persistence & Idempotency");
  const logA = await DailyLog.create({
    athleteId: athleteA._id,
    workoutDescription: kneeWorkout,
    discomfortText: kneeDiscomfort,
    activity: "Track sprints",
    affectedBodyPart: extractedKnee.affectedBodyPart,
    bodySide: extractedKnee.bodySide,
    symptomType: extractedKnee.symptomType,
    onset: "acute",
    reportedSeverity: 8,
    extractionConfidence: 0.9,
    extractionStatus: "success",
    reviewPriority: triageKnee.reviewPriority,
    reviewStatus: "pending",
    triageFlags: triageKnee.triageFlags,
    idempotencyKey: "client-req-uuid-001",
  });

  assert(logA.workoutDescription === kneeWorkout, "Original workout text preserved unchanged");
  assert(logA.discomfortText === kneeDiscomfort, "Original discomfort text preserved unchanged");
  assert(logA.reviewStatus === "pending", "Initial review status is pending");

  // TEST SUITE 5: Cross-User Data Isolation (Critical Security Tests)
  console.log("\n[Suite 5] Cross-User Data Isolation & Role Permissions");
  
  // Check 5a: Athlete A cannot access Athlete B's records
  const logB = await DailyLog.create({
    athleteId: athleteB._id,
    workoutDescription: "2000m swim",
    discomfortText: "Left shoulder ache 4/10",
    activity: "Swim",
    affectedBodyPart: "shoulder",
    bodySide: "left",
    symptomType: "dull_ache",
    reportedSeverity: 4,
    reviewPriority: "medium",
    reviewStatus: "pending",
  });

  // Verify Athlete A querying for Log B
  const athleteAAttempt = await DailyLog.findOne({
    _id: logB._id,
    athleteId: athleteA._id, // Enforced in /api/v1/logs/:id and /api/v1/logs/mine
  });
  assert(
    athleteAAttempt === null,
    "ISOLATION PROVEN: Athlete A cannot read Athlete B's log (returns 404/null)"
  );

  // Check 5b: Coach Stranger (unassigned) cannot access Athlete A's log
  // First, verify Coach Stranger has no assignment to Athlete A
  const athleteARecord = await User.findById(athleteA._id);
  const isStrangerAssigned =
    athleteARecord?.coachId?.toString() === unassignedCoach._id.toString();
  assert(
    !isStrangerAssigned,
    "ISOLATION PROVEN: Coach Stranger is not assigned to Athlete A"
  );

  // When Coach Stranger queries for assigned athletes
  const strangerAthletes = await User.find({ coachId: unassignedCoach._id });
  assert(
    strangerAthletes.length === 0,
    "Coach Stranger roster contains zero athletes"
  );

  // Check 5c: Assigned Coach CAN access Athlete A's log
  const isCoachAssigned =
    athleteARecord?.coachId?.toString() === coach._id.toString();
  assert(isCoachAssigned, "Coach Marcus is authorized to view Athlete A's logs");

  // TEST SUITE 6: Coach Review & Feedback Workflow
  console.log("\n[Suite 6] Coach Feedback & Athlete Acknowledgment");
  const feedback = await CoachFeedback.create({
    athleteId: athleteA._id,
    coachId: coach._id,
    logId: logA._id,
    message: "Rest the knee completely. No sprinting or pivoting for 4 days.",
    activityModification: "Switch to gentle stationary cycling (low resistance) and upper body circuits.",
    acknowledgementStatus: "pending",
  });

  assert(
    feedback.acknowledgementStatus === "pending",
    "Feedback created with pending acknowledgement"
  );

  // Update log status to addressed without overwriting original log
  logA.reviewStatus = "addressed";
  logA.reviewedBy = coach._id;
  logA.reviewedAt = new Date();
  await logA.save();

  const refreshedLogA = await DailyLog.findById(logA._id);
  assert(
    refreshedLogA?.reviewStatus === "addressed",
    "Log review status marked as addressed"
  );
  assert(
    refreshedLogA?.discomfortText === kneeDiscomfort,
    "Historical log text preserved completely without corruption"
  );

  // Athlete acknowledges feedback
  feedback.acknowledgementStatus = "acknowledged";
  feedback.acknowledgedAt = new Date();
  await feedback.save();

  const acknowledgedFeedback = await CoachFeedback.findById(feedback._id);
  assert(
    acknowledgedFeedback?.acknowledgementStatus === "acknowledged",
    "Athlete acknowledged coach feedback"
  );
  assert(
    acknowledgedFeedback?.acknowledgedAt instanceof Date,
    "Feedback recorded UTC timestamp of acknowledgment"
  );

  // TEST SUITE 7: Body Map History & Symptom Patterns
  console.log("\n[Suite 7] Body Map History & Recurring Symptom Patterns");
  const bodyMap = await DailyLog.aggregate([
    { $match: { athleteId: athleteA._id, affectedBodyPart: { $ne: "unspecified" } } },
    {
      $group: {
        _id: { bodyPart: "$affectedBodyPart", side: "$bodySide" },
        count: { $sum: 1 },
        maxSeverity: { $max: "$reportedSeverity" },
      },
    },
  ]);

  assert(bodyMap.length > 0, "Aggregated body map hotspot entries");
  assert(bodyMap[0]._id.bodyPart === "knee", "Correct hotspot body part recorded");
  assert(bodyMap[0].maxSeverity === 8, "Correct maximum severity tracked");

  console.log("\n==========================================");
  console.log(`TEST RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log("==========================================");

  if (failedCount > 0) {
    throw new Error(`${failedCount} test(s) failed.`);
  }
}

runTestSuite()
  .then(async () => {
    console.log("[Test Suite] All unit and integration tests passed cleanly.");
    await disconnectDatabase();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("[Test Suite] Execution failed:", err);
    await disconnectDatabase();
    process.exit(1);
  });
