const STATUSES = new Set(["hard", "easy", "known", "unsure", "new"]);

export function validateState(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  if (!Array.isArray(data.words) || data.words.length > 8000) return false;
  if (!Number.isInteger(data.goal) || data.goal < 1 || data.goal > 100) return false;
  if (!data.today || typeof data.today.date !== "string" || !Array.isArray(data.today.ids)) return false;
  const ids = new Set();
  for (const word of data.words) {
    if (!word || typeof word !== "object") return false;
    if (typeof word.id !== "string" || !word.id || word.id.length > 80) return false;
    if (ids.has(word.id)) return false;
    ids.add(word.id);
    if (typeof word.en !== "string" || !word.en.trim() || word.en.length > 400) return false;
    if (typeof word.de !== "string" || !word.de.trim() || word.de.length > 800) return false;
    if (word.exampleEn != null && typeof word.exampleEn !== "string") return false;
    if (word.exampleDe != null && typeof word.exampleDe !== "string") return false;
    if (word.note != null && typeof word.note !== "string") return false;
    if (word.topic != null && typeof word.topic !== "string") return false;
    if ((word.exampleEn || "").length > 2000 || (word.exampleDe || "").length > 2000) return false;
    if ((word.note || "").length > 2000) return false;
    if (!STATUSES.has(word.status)) return false;
  }
  return true;
}
