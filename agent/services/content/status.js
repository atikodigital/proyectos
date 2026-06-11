const TRANSITIONS = {
  draft: ["approved"],
  approved: ["scheduled", "draft"],
  scheduled: ["publishing", "approved"],
  publishing: ["published", "failed"],
  published: [],
  failed: ["scheduled"],
};

const STATUSES = Object.keys(TRANSITIONS);

function canTransition(from, to) {
  return Array.isArray(TRANSITIONS[from]) && TRANSITIONS[from].includes(to);
}

function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    throw new Error("Transición inválida: " + from + " → " + to);
  }
  return to;
}

module.exports = { canTransition, assertTransition, STATUSES, TRANSITIONS };
