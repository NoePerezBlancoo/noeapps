const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const enabled = () => process.env.CATALOG_SUBSCRIPTIONS_V2 === 'true';
const id = value => typeof value === 'string' ? value : value && value.id || '';
const iso = value => Number.isSafeInteger(value) && value > 0 ? new Date(value * 1000).toISOString() : null;
function problem(status, message) { const error = new Error(message); error.status = status; error.publicMessage = message; return error; }

function assertStaging(env = process.env) {
  if (env.CATALOG_ENVIRONMENT !== 'staging') return;
  if (!/^(sk|rk|rkcs)_test_/.test(env.STRIPE_SECRET_KEY || '') || env.NEON_DATABASE_URL || env.LEGACY_DATABASE_URL
    || !env.DATABASE_URL || !/^https:\/\/catalogo-staging-v2-[a-z0-9-]+\.up\.railway\.app$/.test(env.PUBLIC_ORIGIN || '')
    || env.SITE_DOMAIN !== new URL(env.PUBLIC_ORIGIN).hostname
    || (env.TUNEGOCIO_CRM_ORIGIN && env.TUNEGOCIO_CRM_ORIGIN !== 'https://tunegocio-staging-v2-production.up.railway.app')) {
    throw new Error('Staging isolation configuration rejected');
  }
}

async function migrate(pool) {
  const name = '001_subscription_management.sql';
  const sql = await fs.readFile(path.join(__dirname, 'migrations', name), 'utf8');
  const checksum = crypto.createHash('sha256').update(sql).digest('hex');
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query('SELECT pg_advisory_xact_lock(784090122)');
    await db.query('CREATE TABLE IF NOT EXISTS catalog_migrations(name text PRIMARY KEY, checksum char(64) NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    const prior = await db.query('SELECT checksum FROM catalog_migrations WHERE name=$1', [name]);
    if (prior.rows.length && prior.rows[0].checksum !== checksum) throw new Error('Migration checksum mismatch');
    if (!prior.rows.length) {
      await db.query(sql);
      await db.query('INSERT INTO catalog_migrations(name,checksum) VALUES($1,$2)', [name,checksum]);
    }
    await db.query('COMMIT');
  } catch (error) { await db.query('ROLLBACK'); throw error; }
  finally { db.release(); }
}

function stripeClient(key, fetcher = fetch) {
  const live = /^(sk|rk)_live_/.test(key);
  if (!live && !/^(sk|rk|rkcs)_test_/.test(key)) throw problem(503, 'Stripe no está configurado.');
  return {
    live,
    async request(method, endpoint, fields, requestId) {
      const headers = { Authorization: 'Bearer ' + key, 'Stripe-Version': '2026-08-26.dahlia' };
      if (requestId) headers['Idempotency-Key'] = requestId;
      const body = fields ? new URLSearchParams(Object.entries(fields).map(([k,v]) => [k,String(v)])) : undefined;
      if (body) headers['Content-Type'] = 'application/x-www-form-urlencoded';
      const response = await fetcher('https://api.stripe.com/v1' + endpoint, { method, headers, body, signal: AbortSignal.timeout(12000) });
      const result = await response.json();
      if (!response.ok) throw problem(502, 'Stripe no ha confirmado la operación. Actualiza la ficha y vuelve a intentarlo.');
      if (typeof result.livemode === 'boolean' && result.livemode !== live) throw problem(502, 'El recurso Stripe pertenece a otro entorno.');
      return result;
    },
  };
}

function verifySubscription(sub, row, live) {
  if (sub.object !== 'subscription' || sub.id !== row.stripe_subscription_id || sub.livemode !== live
    || id(sub.customer) !== row.stripe_customer_id || sub.metadata?.catalog_request_id !== row.id) throw problem(403, 'La suscripción no corresponde a esta solicitud.');
}

function stateFrom(sub, row, now = Date.now()) {
  const items = sub.items?.data || [];
  const currentPeriodEnd = items.length === 1 && !sub.items.has_more ? iso(items[0].current_period_end || sub.current_period_end) : null;
  const terminal = ['canceled','incomplete_expired'].includes(sub.status);
  const cancelAt = terminal ? null : iso(sub.cancel_at);
  const scheduled = !terminal && (Boolean(sub.cancel_at_period_end) || Boolean(cancelAt));
  const editable = ['active','trialing','past_due'].includes(sub.status) && !sub.schedule;
  const end = cancelAt || currentPeriodEnd;
  return {
    status: sub.status, cancelAtPeriodEnd: !terminal && Boolean(sub.cancel_at_period_end), cancelAt, canceledAt: iso(sub.canceled_at),
    currentPeriodEnd, nextRenewalAt: !scheduled && ['active','trialing'].includes(sub.status) ? currentPeriodEnd : null,
    paidUntil: row.subscription_paid_until ? new Date(row.subscription_paid_until).toISOString() : null,
    amountCents: items.length === 1 && items[0].price?.unit_amount != null ? items[0].price.unit_amount * (items[0].quantity ?? 1) : null,
    currency: items[0]?.price?.currency || 'eur',
    interval: items[0]?.price?.recurring?.interval || null,
    canCancel: editable && !scheduled && Boolean(end && Date.parse(end) > now),
    canReactivate: editable && scheduled && Boolean(end && Date.parse(end) > now),
  };
}

function paidInvoiceEnd(invoice, subscriptionId, customerId, live) {
  const sub = id(invoice.parent?.subscription_details?.subscription || invoice.subscription);
  if (invoice.object !== 'invoice' || invoice.status !== 'paid' || invoice.livemode !== live || sub !== subscriptionId
    || id(invoice.customer) !== customerId || invoice.amount_remaining !== 0 || invoice.amount_paid <= 0 || invoice.paid_out_of_band
    || invoice.lines?.has_more) return null;
  const ends = invoice.lines.data.filter(line => {
    const detail = line.parent?.subscription_item_details;
    const bound = id(detail?.subscription || line.subscription) === subscriptionId;
    const recurring = line.type === 'subscription' || line.parent?.type === 'subscription_item_details';
    return bound && recurring && !(detail?.proration || line.proration) && Number.isSafeInteger(line.period?.start)
      && Number.isSafeInteger(line.period?.end) && line.period.end > line.period.start && line.period.end - line.period.start <= 367 * 86400;
  }).map(line => line.period.end);
  return ends.length ? iso(Math.max(...ends)) : null;
}

function hasPaidAccess(row, now = Date.now()) {
  return Boolean(row.subscription_paid_until && Date.parse(row.subscription_paid_until) > now);
}

async function sync(db, row, stripe) {
  const sub = await stripe.request('GET', '/subscriptions/' + encodeURIComponent(row.stripe_subscription_id));
  verifySubscription(sub,row,stripe.live);
  // Reconciliation consults a settled invoice; a subscription's future period is never proof of payment.
  const settled = await stripe.request('GET', '/invoices?subscription=' + encodeURIComponent(sub.id) + '&status=paid&limit=1');
  if (settled.data?.[0]?.id) {
    const invoice = await stripe.request('GET', '/invoices/' + encodeURIComponent(settled.data[0].id));
    const end = paidInvoiceEnd(invoice,sub.id,row.stripe_customer_id,stripe.live);
    if (end) {
      const result = await db.query('UPDATE catalog_requests SET subscription_paid_until=GREATEST(subscription_paid_until,$2::timestamptz) WHERE id=$1 RETURNING *', [row.id,end]);
      row = result.rows[0];
    }
  }
  const state = stateFrom(sub,row);
  const result = await db.query(`UPDATE catalog_requests SET subscription_state=$2::jsonb,stripe_subscription_status=$3,subscription_synced_at=now(),
    site_status=CASE WHEN subscription_paid_until>now() THEN 'active' WHEN subscription_paid_until IS NOT NULL OR $3 IN ('canceled','unpaid','incomplete_expired') THEN 'suspended' ELSE site_status END,
    updated_at=now() WHERE id=$1 RETURNING *`, [row.id,JSON.stringify(state),sub.status]);
  return { sub, state, row: result.rows[0] };
}

async function manage(pool, requestId, action, stripe, origin, actor = 'crm-admin') {
  if (!['refresh','cancel','reactivate','portal'].includes(action)) throw problem(400,'Acción no válida.');
  const db = await pool.connect(), operation = crypto.randomUUID();
  let attempted = false;
  try {
    await db.query('SELECT pg_advisory_lock(hashtextextended($1,0))', ['catalog-subscription:' + requestId]);
    const row = (await db.query('SELECT * FROM catalog_requests WHERE id=$1',[requestId])).rows[0];
    if (!row || !/^sub_[a-zA-Z0-9]+$/.test(row.stripe_subscription_id)) throw problem(404,'Suscripción no encontrada.');
    let result = await sync(db,row,stripe);
    let url;
    if (action !== 'refresh') {
      await db.query('INSERT INTO catalog_subscription_audit(request_id,operation_id,actor,action,outcome) VALUES($1,$2,$3,$4,$5)',[requestId,operation,actor,action,'requested']);
      attempted = true;
      if (action === 'cancel' || action === 'reactivate') {
        if (!(action === 'cancel' ? result.state.canCancel : result.state.canReactivate)) throw problem(409,'Stripe no permite esta acción en el estado actual.');
        const fields = { proration_behavior: 'none', ...(action === 'reactivate' && !result.sub.cancel_at_period_end && result.sub.cancel_at
          ? { cancel_at: '' } : { cancel_at_period_end: action === 'cancel' }) };
        await stripe.request('POST','/subscriptions/' + row.stripe_subscription_id,fields,'catalog-subscription:' + operation);
        result = await sync(db,result.row,stripe);
      } else {
        const configurations = await stripe.request('GET','/billing_portal/configurations?active=true&limit=100');
        let config = configurations.data.find(item => item.metadata?.application === 'noeapps-catalog' && item.metadata?.purpose === 'period-end-v2');
        if (!config) config = await stripe.request('POST','/billing_portal/configurations',{
          'metadata[application]':'noeapps-catalog','metadata[purpose]':'period-end-v2',
          'features[subscription_cancel][enabled]':true,'features[subscription_cancel][mode]':'at_period_end',
          'features[subscription_update][enabled]':false,'features[payment_method_update][enabled]':true,'features[invoice_history][enabled]':true,
        },'catalog-portal-config-v2');
        if (config.livemode !== stripe.live || !config.features.subscription_cancel.enabled || config.features.subscription_cancel.mode !== 'at_period_end' || config.features.subscription_update.enabled) throw problem(503,'El portal no tiene una configuración segura.');
        const portal = await stripe.request('POST','/billing_portal/sessions',{customer:row.stripe_customer_id,configuration:config.id,return_url:origin+'/crm'});
        const target = new URL(portal.url);
        if (target.origin !== 'https://billing.stripe.com' || target.username || target.password || id(portal.customer) !== row.stripe_customer_id || id(portal.configuration) !== config.id) throw problem(502,'El portal Stripe no pudo verificarse.');
        url = portal.url;
      }
    }
    if (attempted) await db.query('INSERT INTO catalog_subscription_audit(request_id,operation_id,actor,action,outcome) VALUES($1,$2,$3,$4,$5)',[requestId,operation,actor,action,'succeeded']);
    return { subscription: result.state, ...(url ? {url} : {}) };
  } catch (error) {
    if (attempted) await db.query('INSERT INTO catalog_subscription_audit(request_id,operation_id,actor,action,outcome) VALUES($1,$2,$3,$4,$5)',[requestId,operation,actor,action,'failed']).catch(()=>{});
    throw error;
  } finally {
    try { await db.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',['catalog-subscription:' + requestId]); db.release(); }
    catch { db.release(true); }
  }
}

module.exports = { enabled, assertStaging, migrate, stripeClient, verifySubscription, stateFrom, paidInvoiceEnd, hasPaidAccess, manage, sync };
