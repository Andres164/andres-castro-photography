async function apiFetch(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`API error ${res.status}: ${errBody}`);
  }

  return res.json();
}