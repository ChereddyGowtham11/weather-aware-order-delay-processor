export const isHighValueLead = (profile) => Number.isFinite(profile?.followers) && Number.isFinite(profile?.public_repos) && (profile.followers > 100 || profile.public_repos > 50);

export function newStarEvents(events, checkpoint, seen = []) {
  const cutoff = Date.parse(checkpoint);
  if (!Number.isFinite(cutoff)) throw new Error("Checkpoint must be a valid timestamp");
  const known = new Set(seen);
  return events.filter((event) => {
    if (typeof event?.user?.login !== "string" || !event.user.login.trim() || typeof event.starred_at !== "string") return false;
    const timestamp = Date.parse(event.starred_at);
    const id = `${event.user.login}:${event.starred_at}`;
    if (!Number.isFinite(timestamp) || timestamp <= cutoff || known.has(id)) return false;
    known.add(id);
    return true;
  }).sort((a, b) => Date.parse(a.starred_at) - Date.parse(b.starred_at));
}

export function safeProfileText(value) {
  return String(value ?? "").replace(/[<>]/g, "").replace(/(?:ignore|disregard)\s+(?:all\s+)?(?:previous|prior)\s+instructions/gi, "[removed untrusted instruction-like text]").slice(0, 500);
}

export function fallbackPitch(profile) {
  const company = safeProfileText(profile.company) || "their work"; return `Verified GitHub profile data suggests a relevant open-source conversation with ${company}.`;
}
