import { api } from "./api.js";

export async function confirmTopicDeletion(topic, turnId = null) {
  if (
    !window.confirm(
      `„${topic.name}“ wirklich aus der Themenliste löschen?\nBereits gespeicherte Stunden und Lernergebnisse bleiben erhalten.`,
    )
  )
    return false;
  await api(`/topics/${encodeURIComponent(topic.id)}/delete`, {
    expectedRevision: topic.revision,
    confirmed: true,
    turnId,
  });
  return true;
}
