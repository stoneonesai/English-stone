export const TOPICS = [
  { id: "kommunikation", name: "Kommunikation & Sprache" },
  { id: "gefuehle", name: "Gefühle, Charakter & Beziehungen" },
  { id: "zeit", name: "Zeit, Termine & Alltag" },
  { id: "wohnen", name: "Wohnen & Haushalt" },
  { id: "geld", name: "Geld, Einkauf & Preise" },
  { id: "essen", name: "Essen, Kochen & Restaurant" },
  { id: "gesundheit", name: "Gesundheit & Körper" },
  { id: "arbeit", name: "Arbeit & Beruf" },
  { id: "bildung", name: "Bildung & Lernen" },
  { id: "reisen", name: "Reisen & Verkehr" },
  { id: "stadt", name: "Stadt, Natur & Wetter" },
  { id: "technik", name: "Technik, Internet & Medien" },
  { id: "gesellschaft", name: "Gesellschaft, Recht & Behörden" },
  { id: "freizeit", name: "Freizeit, Sport & Hobbys" },
  { id: "verben", name: "Verben & Phrasal Verbs" },
  { id: "verbindung", name: "Verbindungswörter & Adverbien" },
];

const BY_ID = new Map(TOPICS.map((topic) => [topic.id, topic.name]));

export function topicName(id) {
  if (!id) return "Ohne Thema";
  return BY_ID.get(id) || "Ohne Thema";
}
