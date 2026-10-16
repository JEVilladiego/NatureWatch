/**
 * Rate Limiting & Anti-Troll Protection for Anonymous Submissions
 * NatureWatch - Provincial Government of Rizal (PG-ENRO)
 */

const STORAGE_KEY = 'naturewatch_sub_log_v1';
const BURST_COOLDOWN_SECONDS = 120; // 2 minutes between submissions per device
const MAX_SUBMISSIONS_PER_DAY = 5; // Max 5 reports per 24 hours per device
const DAY_MS = 24 * 60 * 60 * 1000;

interface SubmissionLog {
  timestamps: number[]; // Epoch ms of recent submissions
}

function getLog(): SubmissionLog {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { timestamps: [] };
    const parsed = JSON.parse(raw);
    const now = Date.now();
    // Keep only timestamps from the last 24 hours
    const valid = (parsed.timestamps || []).filter((t: number) => now - t < DAY_MS);
    return { timestamps: valid };
  } catch {
    return { timestamps: [] };
  }
}

function saveLog(log: SubmissionLog) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(log));
  } catch {
    // LocalStorage might be disabled in private mode; fail gracefully
  }
}

export interface RateLimitCheckResult {
  allowed: boolean;
  remainingSeconds: number;
  reason?: 'burst' | 'daily_limit';
  todayCount: number;
  maxPerDay: number;
}

/**
 * Checks if the current client device is permitted to submit a report.
 */
export function checkSubmissionRateLimit(): RateLimitCheckResult {
  const log = getLog();
  const now = Date.now();
  const lastTime = log.timestamps.length > 0 ? log.timestamps[log.timestamps.length - 1] : 0;
  const elapsedSeconds = Math.floor((now - lastTime) / 1000);

  // 1. Burst protection (must wait at least BURST_COOLDOWN_SECONDS)
  if (lastTime > 0 && elapsedSeconds < BURST_COOLDOWN_SECONDS) {
    const remaining = BURST_COOLDOWN_SECONDS - elapsedSeconds;
    return {
      allowed: false,
      remainingSeconds: remaining,
      reason: 'burst',
      todayCount: log.timestamps.length,
      maxPerDay: MAX_SUBMISSIONS_PER_DAY,
    };
  }

  // 2. Daily limit protection
  if (log.timestamps.length >= MAX_SUBMISSIONS_PER_DAY) {
    const oldestInWindow = log.timestamps[0];
    const resetInSeconds = Math.max(1, Math.floor((oldestInWindow + DAY_MS - now) / 1000));
    return {
      allowed: false,
      remainingSeconds: resetInSeconds,
      reason: 'daily_limit',
      todayCount: log.timestamps.length,
      maxPerDay: MAX_SUBMISSIONS_PER_DAY,
    };
  }

  return {
    allowed: true,
    remainingSeconds: 0,
    todayCount: log.timestamps.length,
    maxPerDay: MAX_SUBMISSIONS_PER_DAY,
  };
}

/**
 * Records a successful submission timestamp for this device.
 */
export function recordSubmission(): void {
  const log = getLog();
  log.timestamps.push(Date.now());
  saveLog(log);
}

/**
 * Formats seconds into MM:SS for user countdowns.
 */
export function formatCooldownTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins > 60) {
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hours}h ${remMins}m`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
