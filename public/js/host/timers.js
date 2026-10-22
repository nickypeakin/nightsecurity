// One-shot callbacks on the host's clock, so a paused solo game pauses
// them too: later(match, seconds, fn).

export function later(m, sec, fn) {
  (m.timers || (m.timers = [])).push({ at: m.t + sec, fn });
}

export function runTimers(m) {
  if (!m.timers || !m.timers.length) return;
  const due = m.timers.filter((x) => x.at <= m.t);
  if (!due.length) return;
  m.timers = m.timers.filter((x) => x.at > m.t);
  for (const x of due) x.fn();
}
