// Pure policy shared with the exported n8n controller nodes.
export function retryDecision(response, attempt, now = Date.now()) {
  const status = Number(response.statusCode || 0);
  const headers = Object.fromEntries(Object.entries(response.headers || {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
  const limited = status === 429 || (status === 403 && (headers['retry-after'] !== undefined || headers['x-ratelimit-remaining'] === '0' || /rate limit|secondary rate/i.test(response.body?.message || '')));
  const transient = limited || status >= 500 && status <= 599 || !status && !!response.error;
  if (status >= 200 && status < 300 && !response.error) return { retry: false, success: true };
  if (!transient || attempt >= 2) throw new Error('GitHub request failed or retries exhausted; checkpoint unchanged.');
  let seconds = limited ? 60 * 2 ** attempt : 2 ** attempt;
  const after = headers['retry-after'];
  if (after !== undefined && after.trim()) {
    const numeric = /^\d+(?:\.\d+)?$/.test(after.trim()) ? Number(after) : NaN;
    const date = Date.parse(after);
    if (Number.isFinite(numeric)) seconds = Math.max(seconds, numeric);
    else if (Number.isFinite(date)) seconds = Math.max(seconds, Math.ceil((date - now) / 1000));
  }
  if (limited && /^\d+$/.test(headers['x-ratelimit-reset'] || '')) seconds = Math.max(seconds, Math.ceil((Number(headers['x-ratelimit-reset']) * 1000 - now) / 1000));
  // Stop rather than retry before a server's long reset deadline.
  if (seconds > 300) throw new Error('GitHub reset exceeds the 300-second retry budget; checkpoint unchanged. Retry after the server deadline.');
  return { retry: true, success: false, waitSeconds: Math.max(1, seconds), attempt: attempt + 1 };
}

export function advanceStarRequest(context, response, now = Date.now()) {
  const decision = retryDecision(response, context.attempt, now);
  if (decision.retry) return { ...context, ...decision, action: 'request' };
  if (!Array.isArray(response.body)) throw new Error('Invalid star response; checkpoint unchanged.');
  const pages = [...context.pages, response.body];
  const headers = Object.fromEntries(Object.entries(response.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
  const next = String(headers.link || '').match(/<([^>]+)>;\s*rel="next"/)?.[1];
  if (!next) return { ...context, pages, action: 'done', body: pages.flat(), statusCode: 200 };
  // n8n's Code sandbox has no global URL constructor. Match the exact HTTPS
  // authority and listing path; reject credentials, ports, fragments and slashes.
  const match = /^https:\/\/api\.github\.com(\/[^?#\\\s]*)(?:\?[^#\\\s]*)?$/.exec(next);
  const originalPath = context.url.split('?')[0].slice('https://api.github.com'.length);
  if (!match || match[1] !== originalPath || pages.length >= 100 || context.visited.includes(next)) throw new Error('Unsafe or repeated pagination URL; checkpoint unchanged.');
  return { ...context, url: next, pages, visited: [...context.visited, next], attempt: 0, waitSeconds: 1, action: 'request' };
}

export function advanceProfileRequest(context, response, now = Date.now()) {
  const decision = retryDecision(response, context.attempt, now);
  if (decision.retry) return { ...context, ...decision, action: 'request' };
  const expected = context.events[context.index];
  const profile = response.body;
  if (profile?.login?.toLowerCase() !== expected.login.toLowerCase() || !Number.isInteger(profile.followers) || profile.followers < 0 || !Number.isInteger(profile.public_repos) || profile.public_repos < 0) throw new Error('Invalid GitHub profile; checkpoint unchanged.');
  const profiles = [...context.profiles, { ...expected, profile }];
  const index = context.index + 1;
  if (index === context.events.length) return { ...context, profiles, action: 'done' };
  return { ...context, profiles, index, url: 'https://api.github.com/users/' + encodeURIComponent(context.events[index].login), attempt: 0, waitSeconds: 1, action: 'request' };
}

export function commitEvents(state, events) {
  if (!events.length) return;
  const seen = new Set(state.seen || []);
  let latest = state.checkpoint;
  for (const event of events) {
    if (!event.login || !Number.isFinite(Date.parse(event.starred_at))) throw new Error('Invalid processed event; checkpoint unchanged.');
    seen.add(event.login + ':' + event.starred_at);
    if (Date.parse(event.starred_at) > Date.parse(latest)) latest = event.starred_at;
  }
  state.seen = [...seen].slice(-1000);
  state.checkpoint = latest;
}
