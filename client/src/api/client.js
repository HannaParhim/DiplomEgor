const API_URL = import.meta.env.VITE_API_URL || "/api";

export async function apiRequest(path, { method = "GET", body, token, headers } = {}) {
  const isFormData = body instanceof FormData;
  let response;

  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers
      },
      body: body ? (isFormData ? body : JSON.stringify(body)) : undefined
    });
  } catch {
    throw new Error("Не удалось связаться с сервером");
  }

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const fieldErrors =
      payload && typeof payload === "object" ? payload.details?.fieldErrors : null;
    const firstFieldError = fieldErrors
      ? Object.values(fieldErrors).flat().find(Boolean)
      : null;

    throw new Error(
      (payload && typeof payload === "object" ? payload.message : null) ||
        firstFieldError ||
        (typeof payload === "string" && payload) ||
        "Не удалось выполнить запрос"
    );
  }

  return payload;
}
