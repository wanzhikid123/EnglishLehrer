// Match an actual farewell, not a lesson about the word or a negated request.
export function isGoodbye(text) {
  const words = String(text || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/[^\p{L}\s]/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
  return /^(?:(?:okay|ok|ja|gut|danke|vielen dank|mia|und|also|dann)\s+)*(?:tschüss(?:chen|i)?|tschuess(?:chen|i)?|tüss(?:che|chen)?|tüssche|tschüs|tschüß|tschau|ciao|auf wiedersehen|bye(?: bye)?|goodbye)(?:\s+(?:mia|danke|bis bald|bis morgen|bis zum nächsten mal))*$/.test(
    words,
  );
}
