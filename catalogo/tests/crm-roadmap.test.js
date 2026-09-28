const test=require('node:test');
const assert=require('node:assert/strict');
const {expenseMonth,whatsappDraft,validTemplate,defaultTemplates,detectIncidents}=require('../crm-roadmap');
test('expenses respect month, start, stop, future dates and keep commission payments separate',()=>{
  const rows=[
    {category:'hosting',amount_cents:1000,cadence:'monthly',expense_date:'2026-08-01',active:false,ended_on:'2026-09-12'},
    {category:'software',amount_cents:500,cadence:'monthly',expense_date:'2026-10-01',active:true},
    {category:'ads',amount_cents:2000,cadence:'one_time',expense_date:'2026-09-15',active:true},
    {category:'ads',amount_cents:4000,cadence:'one_time',expense_date:'2026-10-01',active:true},
    {category:'commission',amount_cents:300,cadence:'one_time',expense_date:'2026-09-20',active:true},
    {category:'tax',amount_cents:800,cadence:'one_time',expense_date:'2026-09-29',active:true}
  ];
  assert.deepEqual(expenseMonth(rows,'2026-09',new Date('2026-09-28T12:00:00Z')),{month:'2026-09',operatingExpensesCents:3000,recordedCommissionPaymentsCents:300,byCategory:{hosting:1000,ads:2000}});
  assert.equal(expenseMonth(rows,'2026-08',new Date('2026-09-28')).operatingExpensesCents,1000);
  assert.equal(expenseMonth(rows,'2026-10',new Date('2026-10-15')).operatingExpensesCents,4500);
  assert.throws(()=>expenseMonth(rows,'2026-19'));
});
test('WhatsApp encodes exact reviewable text, rejects missing contacts/links and never sends',()=>{
  const item={contact_name:'Ana & Juan',business_name:'Taller <QA>',whatsapp:'+34 600 000 001',payment_url:'https://example.com/pay?a=1&b=2'};
  const result=whatsappDraft('payment',defaultTemplates.payment,item);
  assert.equal(new URL(result.url).hostname,'wa.me');assert.equal(new URL(result.url).searchParams.get('text'),result.message);
  assert.match(result.message,/Ana & Juan/);assert.match(result.message,/Taller <QA>/);
  for(const input of [{...item,whatsapp:'0000'},{...item,payment_url:''},{...item,payment_url:'javascript:alert(1)'},{...item,payment_url:'https://secret@example.com'}])assert.throws(()=>whatsappDraft('payment',defaultTemplates.payment,input));
  assert.equal(validTemplate('constructor','hola'),false);assert.equal(validTemplate('payment','Hola {token}'),false);
  assert.throws(()=>whatsappDraft('cancellation',defaultTemplates.cancellation,item));
  assert.throws(()=>whatsappDraft('published',defaultTemplates.published,{...item,publicUrl:'https://example.com',published:false}));
});
test('incidents distinguish paid access, overdue checkout, billing failures and publication faults',()=>{
  const now=Date.parse('2026-09-28T12:00:00Z');
  const rows=[
    {id:'paid',business_name:'Pagado',first_paid_amount_cents:995,subscription_paid_until:'2026-10-28',site_status:'draft'},
    {id:'late',stripe_subscription_status:'past_due',site_status:'active',site_origin_url:'https://example.com',subscription_paid_until:'2026-10-28'},
    {id:'old',stripe_checkout_session_id:'cs_test_qa',stripe_payment_status:'unpaid',updated_at:'2026-09-26'},
    {id:'expired',site_status:'active',site_origin_url:'https://example.com',subscription_paid_until:'2026-09-01'},
    {id:'ok',site_status:'active',site_origin_url:'https://example.com',subscription_paid_until:'2026-10-01',first_paid_amount_cents:995}
  ];
  const incidents=detectIncidents(rows,'catalog',now);
  assert.deepEqual(incidents.map(x=>x.kind),['paid_unpublished','past_due','checkout_stale','expired_entitlement']);
  assert.ok(incidents.every(x=>x.recommendation&&x.key&&x.entityId!=='ok'));
  assert.equal(detectIncidents([{id:'tn',payment_status:'paid',published:false,paid_until:'2026-10-01'}],'tunegocio',now)[0].kind,'paid_unpublished');
});
