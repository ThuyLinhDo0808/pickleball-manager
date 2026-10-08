// The ball store of a club ({ club_id }) or of an organiser's Xé Vé space
// ({ host_id, club_id: null }): items, purchases, the per-session ball log.
const { supabase } = require('../supabase');
const { isUuid } = require('../utils/respond');
const { todayYmd } = require('./memberships');
const { itemMetrics, ballLog } = require('./inventory');

const MIGRATION = '20261023090000_ball_log_xeve_inventory.sql';
const fail = (status, message) => Object.assign(new Error(message), { status });

function scoped(q, owner) {
  return owner.club_id ? q.eq('club_id', owner.club_id) : q.eq('host_id', owner.host_id).is('club_id', null);
}

// Before the migration only club stores exist (no host_id, no 'broken').
async function storeReady() {
  const { error } = await supabase.from('inventory_items').select('host_id').limit(1);
  return !error;
}

async function loadItem(owner, itemId) {
  if (!isUuid(itemId)) return null;
  const { data, error } = await scoped(supabase.from('inventory_items').select('*').eq('id', itemId), owner).maybeSingle();
  if (error) throw error;
  return data;
}

// Dates the owner played (club sessions, or the organiser's own kèo) up to today.
async function sessionDates(owner) {
  let q = supabase.from('events').select('event_date').neq('status', 'cancelled').neq('kind', 'meeting').lte('event_date', todayYmd());
  q = owner.club_id ? q.eq('club_id', owner.club_id) : q.eq('host_id', owner.host_id).is('club_id', null);
  const { data } = await q.limit(1000);
  return [...new Set((data || []).map((e) => e.event_date))];
}

async function list(owner) {
  const [{ data: items, error }, sessions] = await Promise.all([
    scoped(supabase.from('inventory_items').select('*, inventory_moves(*)'), owner).order('created_at'),
    sessionDates(owner),
  ]);
  if (error) throw error;
  return items.map(({ inventory_moves: moves, ...item }) => ({
    ...item,
    ...itemMetrics(moves || []),
    log: ballLog(moves || [], sessions),
    moves: (moves || []).sort((a, b) => b.occurred_on.localeCompare(a.occurred_on) || b.created_at.localeCompare(a.created_at)).slice(0, 40),
  }));
}

async function createItem(owner, body) {
  const name = String(body.name || '').trim();
  if (!name) throw fail(400, 'name is required.');
  if (!owner.club_id && !(await storeReady())) throw fail(409, `Run migration ${MIGRATION} first.`);
  const holes = body.holes === '' || body.holes == null ? null : parseInt(body.holes, 10);
  const { data, error } = await supabase
    .from('inventory_items')
    .insert({
      club_id: owner.club_id || null,
      ...(owner.host_id && (await storeReady()) ? { host_id: owner.host_id } : {}),
      name,
      category: body.category === 'other' ? 'other' : 'ball',
      holes: Number.isInteger(holes) ? holes : null,
      unit: String(body.unit || '').trim() || 'quả',
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function movesOf(itemId) {
  const { data, error } = await supabase.from('inventory_moves').select('*').eq('item_id', itemId);
  if (error) throw error;
  return data;
}

// An event of this owner (a club session / the organiser's kèo), or null.
async function ownEvent(owner, eventId) {
  if (!isUuid(eventId)) return null;
  let q = supabase.from('events').select('id, event_date').eq('id', eventId);
  q = owner.club_id ? q.eq('club_id', owner.club_id) : q.eq('host_id', owner.host_id).is('club_id', null);
  const { data } = await q.maybeSingle();
  return data;
}

// Purchase (a club also books the expense in its fund), use, broken, retire or adjust.
// `hostId`: whose ledger a club purchase goes into.
async function addMove(owner, item, body, hostId) {
  const kind = body.kind;
  const quantity = parseInt(body.quantity, 10);
  if (!['purchase', 'retire', 'adjust', 'use', 'broken'].includes(kind)) throw fail(400, 'kind must be purchase, use, broken, retire or adjust.');
  if (!Number.isInteger(quantity) || quantity === 0 || (kind !== 'adjust' && quantity < 0)) throw fail(400, 'quantity must be a whole number (positive except for adjust).');
  if (kind === 'broken' && !(await storeReady())) throw fail(409, `Run migration ${MIGRATION} first.`);
  let event = null;
  if (body.event_id) {
    event = await ownEvent(owner, body.event_id);
    if (!event) throw fail(404, 'Event not found.');
  }
  const unitCost = kind === 'purchase' ? Number(body.unit_cost) : null;
  if (kind === 'purchase' && !(unitCost >= 0)) throw fail(400, 'unit_cost is required for a purchase.');
  const lasted = kind === 'retire' && body.sessions_lasted !== '' && body.sessions_lasted != null ? Number(body.sessions_lasted) : null;
  if (lasted != null && !(lasted > 0 && lasted < 10000)) throw fail(400, 'sessions_lasted must be > 0.');
  const occurred_on = event ? event.event_date : /^\d{4}-\d{2}-\d{2}$/.test(body.occurred_on || '') ? body.occurred_on : todayYmd();

  const m = itemMetrics(await movesOf(item.id));
  if ((kind === 'retire' || kind === 'use' || (kind === 'adjust' && quantity < 0)) && Math.abs(quantity) > m.stock) throw fail(400, `Only ${m.stock} in stock.`);
  if (kind === 'broken' && quantity > m.in_play) throw fail(400, `Only ${m.in_play} in play.`);

  let transaction_id = null;
  if (kind === 'purchase' && owner.club_id && body.record_expense !== false && unitCost * quantity > 0) {
    const { data: txn, error: tErr } = await supabase
      .from('transactions')
      .insert({ host_id: hostId, owner_type: 'club', club_id: owner.club_id, type: 'expense', category: 'balls', amount: Math.round(unitCost * quantity), note: `${quantity} × ${item.name}`, occurred_on })
      .select('id')
      .single();
    if (tErr) throw tErr;
    transaction_id = txn.id;
  }
  const { data, error } = await supabase
    .from('inventory_moves')
    .insert({ item_id: item.id, kind, quantity, unit_cost: unitCost, sessions_lasted: lasted, occurred_on, note: String(body.note || '').trim() || null, transaction_id, ...(event ? { event_id: event.id } : {}) })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// One session of the ball table at once: balls in play that broke, new balls taken out.
// Replaces what was logged for that date before.
async function logSession(owner, item, body) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(body.occurred_on || '') ? body.occurred_on : todayYmd();
  const newOut = Math.max(0, parseInt(body.new_out, 10) || 0);
  const broken = Math.max(0, parseInt(body.broken, 10) || 0);
  if (broken && !(await storeReady())) throw fail(409, `Run migration ${MIGRATION} first.`);
  const before = await movesOf(item.id);
  const previous = before.filter((m) => m.occurred_on === date && (m.kind === 'use' || m.kind === 'broken'));
  const rest = before.filter((m) => !previous.includes(m));
  const m = itemMetrics(rest);
  // Balls in play before this session (everything taken out earlier, less what broke).
  const inPlay = ballLog(rest.filter((x) => x.occurred_on < date)).at(-1);
  const playing = inPlay ? inPlay.old + inPlay.new : 0;
  // Broken balls are old ones in play, or new ones taken out (and broken) this session.
  if (broken > playing + newOut) throw fail(400, `Only ${playing + newOut} balls were played this session (${playing} old + ${newOut} new).`);
  // New balls come out of what was in the box on that day (and stay within today's stock).
  const boxThen = itemMetrics(rest.filter((x) => x.occurred_on <= date)).stock;
  const box = Math.min(boxThen, m.stock);
  if (newOut > box) throw fail(400, `Only ${box} in the box on ${date}.`);
  const event = body.event_id ? await ownEvent(owner, body.event_id) : null;
  if (previous.length) {
    const { error } = await supabase.from('inventory_moves').delete().in('id', previous.map((x) => x.id));
    if (error) throw error;
  }
  const rows = [
    ...(broken ? [{ item_id: item.id, kind: 'broken', quantity: broken, occurred_on: date }] : []),
    ...(newOut ? [{ item_id: item.id, kind: 'use', quantity: newOut, occurred_on: date }] : []),
  ].map((r) => (event ? { ...r, event_id: event.id } : r));
  if (rows.length) {
    const { error } = await supabase.from('inventory_moves').insert(rows);
    if (error) throw error;
  }
  return { date, new_out: newOut, broken };
}

// Undo a mistaken entry; a linked fund expense is voided (the ledger stays append-only).
async function deleteMove(item, moveId) {
  if (!isUuid(moveId)) throw fail(404, 'Move not found.');
  const { data: move } = await supabase.from('inventory_moves').select('*').eq('id', moveId).eq('item_id', item.id).maybeSingle();
  if (!move) throw fail(404, 'Move not found.');
  // Removing a purchase (or a positive adjustment) must not leave negative stock.
  const effect = move.kind === 'purchase' || move.kind === 'adjust' ? move.quantity : 0;
  if (effect > 0) {
    const stock = itemMetrics(await movesOf(item.id)).stock;
    if (stock - effect < 0) throw fail(400, `Can't delete: ${effect - stock} of these balls are already out of the box. Delete those entries first.`);
  }
  if (move.transaction_id) {
    await supabase.from('transactions').update({ is_voided: true, voided_at: new Date().toISOString(), void_reason: 'inventory entry deleted' }).eq('id', move.transaction_id);
  }
  const { error } = await supabase.from('inventory_moves').delete().eq('id', move.id);
  if (error) throw error;
}

// The Express handlers. `ownerOf(req)` -> { club_id } or { host_id, club_id: null };
// req.hostId is whose ledger a club purchase goes into.
function mount(router, prefix, ownerOf) {
  const send = (res, err) => res.status(err.status || 500).json({ error: err.status ? err.message : 'Something went wrong.' });
  const withItem = (fn) => async (req, res) => {
    try {
      req.inventoryOwner = ownerOf(req);
      const item = await loadItem(req.inventoryOwner, req.params.itemId);
      if (!item) return res.status(404).json({ error: 'Item not found.' });
      await fn(req, res, item);
    } catch (err) {
      if (!err.status) console.error(err);
      send(res, err);
    }
  };
  router.get(prefix || '/', async (req, res) => {
    try {
      req.inventoryOwner = ownerOf(req);
      res.json(await list(req.inventoryOwner));
    } catch (err) {
      if (!err.status) console.error(err);
      send(res, err);
    }
  });
  router.post(prefix || '/', async (req, res) => {
    try {
      req.inventoryOwner = ownerOf(req);
      res.status(201).json(await createItem(req.inventoryOwner, req.body || {}));
    } catch (err) {
      if (!err.status) console.error(err);
      send(res, err);
    }
  });
  router.patch(`${prefix}/:itemId`, withItem(async (req, res, item) => {
    const fields = {};
    for (const k of ['name', 'is_active', 'unit']) if (k in req.body) fields[k] = req.body[k];
    const { data, error } = await supabase.from('inventory_items').update(fields).eq('id', item.id).select().single();
    if (error) throw error;
    res.json(data);
  }));
  router.post(`${prefix}/:itemId/moves`, withItem(async (req, res, item) => res.status(201).json(await addMove(req.inventoryOwner, item, req.body || {}, req.hostId))));
  router.post(`${prefix}/:itemId/sessions`, withItem(async (req, res, item) => res.status(201).json(await logSession(req.inventoryOwner, item, req.body || {}))));
  router.delete(`${prefix}/:itemId/moves/:moveId`, withItem(async (req, res, item) => {
    await deleteMove(item, req.params.moveId);
    res.status(204).end();
  }));
}

module.exports = { list, createItem, loadItem, addMove, logSession, deleteMove, mount, storeReady };
