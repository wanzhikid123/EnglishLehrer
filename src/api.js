export async function api(path, body, options = {}) {
  const response = await fetch("/api" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    ...options,
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      data.error ||
        "Die Verbindung hat nicht geklappt. Bitte versuche es erneut.",
    );
  return data;
}
export const lessonApi = (id, path, body) => api(`/lessons/${id}${path}`, body);
export const clockText = (ms) =>
  `${Math.floor(ms / 60000)
    .toString()
    .padStart(2, "0")}:${Math.floor((ms / 1000) % 60)
    .toString()
    .padStart(2, "0")}`;
export const dateText = (ms) =>
  new Intl.DateTimeFormat("de-DE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(ms);
