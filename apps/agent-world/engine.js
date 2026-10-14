/* Browser and Node compatible simulation model. No agent execution. */
(function (root) {
  'use strict';
  const ROLES = [
    { id: 'planner', name: 'Frank', role: 'Coordinator', color: '#739777', initials: 'FR', x: 194, y: 217, description: 'Turns the request into a plan and routes work to the right specialists.' },
    { id: 'designer', name: 'Dara', role: 'Designer', color: '#a492c3', initials: 'DA', x: 474, y: 217, description: 'Shapes the interface, user journeys, and accessible interaction states.' },
    { id: 'builder', name: 'Beck', role: 'Builder', color: '#659cae', initials: 'BE', x: 754, y: 217, description: 'Implements the plan and checks the affected code.' },
    { id: 'reviewer', name: 'Remy', role: 'Reviewer', color: '#b49a70', initials: 'RE', x: 194, y: 462, description: 'Independently checks correctness and looks for reachable defects.' },
    { id: 'qa', name: 'Quinn', role: 'QA engineer', color: '#70a38e', initials: 'QU', x: 474, y: 462, description: 'Verifies the user journey, failure paths, and regression evidence.' },
    { id: 'security', name: 'Sage', role: 'Security', color: '#c38f78', initials: 'SA', x: 754, y: 462, description: 'Independently checks trust boundaries, permissions, and data exposure.' }
  ];
  const STAGES = [
    { label: 'Planning', roles: ['planner'], duration: 6 },
    { label: 'Designing', roles: ['designer'], duration: 7 },
    { label: 'Building', roles: ['builder'], duration: 12 },
    { label: 'Independent checks', roles: ['reviewer', 'qa', 'security'], duration: 10 },
    { label: 'Handing off', roles: ['planner'], duration: 5 }
  ];
  const TOTAL = STAGES.reduce((n, s) => n + s.duration, 0);
  const KINDS = ['feature', 'fix', 'research'];
  function fresh() { return { version: 1, elapsed: 0, paused: false, speed: 1, nextId: 1, missions: [], events: [] }; }
  function event(state, text) { state.events.unshift({ time: state.elapsed, text }); state.events = state.events.slice(0, 30); }
  function assign(state, title, brief = '', kind = 'feature') {
    if (typeof title !== 'string' || !title.trim() || title.trim().length > 100 || typeof brief !== 'string' || brief.length > 600 || !KINDS.includes(kind)) throw new Error('Enter a mission name of 1–100 characters and a brief of up to 600 characters.');
    if (state.missions.length >= 50) throw new Error('Mission board is full. Reset the simulation to begin a new session.');
    const mission = { id: state.nextId++, title: title.trim(), brief, kind, elapsed: 0, status: 'queued' };
    state.missions.push(mission); event(state, `Mission queued: ${mission.title}`); return mission;
  }
  function stage(mission) {
    let time = mission.elapsed;
    for (const value of STAGES) { if (time < value.duration) return value; time -= value.duration; }
    return { label: 'Complete', roles: [], duration: 0 };
  }
  function tick(state, seconds) {
    if (state.paused || !Number.isFinite(seconds) || seconds <= 0) return;
    let remaining = Math.min(seconds, 5) * state.speed;
    state.elapsed += remaining;
    while (remaining > 0) {
      const mission = state.missions.find(m => m.status !== 'complete');
      if (!mission) break;
      if (mission.status === 'queued') { mission.status = 'active'; event(state, `Frank started planning: ${mission.title}`); }
      const before = stage(mission).label;
      const step = Math.min(remaining, TOTAL - mission.elapsed);
      mission.elapsed += step; remaining -= step;
      const after = stage(mission);
      if (mission.elapsed >= TOTAL) { mission.status = 'complete'; event(state, `Simulated handoff complete: ${mission.title}`); }
      else if (before !== after.label) event(state, `${after.label}: ${mission.title}`);
    }
  }
  function restore(raw) {
    try {
      if (typeof raw !== 'string' || raw.length > 100000) return fresh();
      const state = JSON.parse(raw);
      if (!state || state.version !== 1 || !Number.isFinite(state.elapsed) || state.elapsed < 0 || typeof state.paused !== 'boolean' || ![1, 2, 4].includes(state.speed) || !Number.isSafeInteger(state.nextId) || state.nextId < 1 || !Array.isArray(state.missions) || state.missions.length > 50 || !Array.isArray(state.events) || state.events.length > 30) return fresh();
      const ids = new Set(); let active = 0; let unfinished = false;
      for (const m of state.missions) {
        if (!m || !Number.isSafeInteger(m.id) || m.id < 1 || m.id >= state.nextId || ids.has(m.id) || typeof m.title !== 'string' || !m.title.trim() || m.title.length > 100 || typeof m.brief !== 'string' || m.brief.length > 600 || !KINDS.includes(m.kind) || !Number.isFinite(m.elapsed) || m.elapsed < 0 || m.elapsed > TOTAL || !['queued', 'active', 'complete'].includes(m.status)) return fresh();
        if ((m.status === 'queued' && m.elapsed !== 0) || (m.status === 'active' && m.elapsed >= TOTAL) || (m.status === 'complete' && m.elapsed !== TOTAL) || (unfinished && m.status === 'complete')) return fresh();
        if (m.status !== 'complete') unfinished = true;
        if (m.status === 'active' && ++active > 1) return fresh();
        ids.add(m.id);
      }
      if (state.missions.some((m, i) => m.status === 'active' && state.missions.slice(0, i).some(p => p.status !== 'complete'))) return fresh();
      if (state.events.some(e => !e || !Number.isFinite(e.time) || e.time < 0 || e.time > state.elapsed || typeof e.text !== 'string' || e.text.length > 250)) return fresh();
      return { version: 1, elapsed: state.elapsed, paused: state.paused, speed: state.speed, nextId: state.nextId, missions: state.missions.map(m => ({id:m.id,title:m.title,brief:m.brief,kind:m.kind,elapsed:m.elapsed,status:m.status})), events: state.events.map(e => ({time:e.time,text:e.text})) };
    } catch (_) { return fresh(); }
  }
  const api = { ROLES, STAGES, TOTAL, fresh, assign, stage, tick, restore };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AgentWorld = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
