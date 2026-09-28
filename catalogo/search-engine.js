(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CatalogSearch=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const businesses=[
    ['peluqueria','Peluquería y barbería','Belleza','Belleza y moda','peluqueria peluquerias barberia barberias barber hair salon belleza estetica'],
    ['restaurante','Restaurante y cafetería','Hostelería','Hostelería y turismo','restaurante restaurantes restaurant gastronomia cafeteria cafe bar cocina food'],
    ['abogado','Abogacía y asesoría','Legal','Servicios profesionales','abogado abogados abogada abogacia despacho bufete legal law lawyer asesor juridico'],
    ['taller','Taller y automoción','Automoción','Industria y movilidad','taller talleres coche mecanica mecanico garage automotive motor automocion'],
    ['industria','Empresa industrial','Industria','Industria y movilidad','fabrica manufactura maquinaria industria industrial ingenieria'],
    ['inmobiliaria','Inmobiliaria','Inmobiliaria','Vivienda y construcción','inmobiliaria inmobiliarias vivienda viviendas realestate estate propiedades property'],
    ['construccion','Construcción y reformas','Construcción','Vivienda y construcción','construccion constructora reforma reformas arquitectura obra'],
    ['salud','Clínica y salud','Salud','Salud y deporte','clinica clinicas medico medica dentista dental salud health wellness fisioterapia'],
    ['fitness','Gimnasio y entrenamiento','Fitness','Salud y deporte','gimnasio gym fitness entrenador deporte entrenamiento deportivo'],
    ['educacion','Academia y educación','Educación','Educación y ocio','academia escuela colegio educacion formacion cursos education'],
    ['turismo','Hotel y turismo','Turismo','Hostelería y turismo','hotel hoteles turismo alojamiento viaje viajes rural tourism'],
    ['eventos','Eventos','Eventos','Educación y ocio','eventos evento bodas boda wedding celebracion'],
    ['ocio','Ocio y entretenimiento','Entretenimiento','Educación y ocio','entretenimiento ocio musica espectaculo gaming'],
    ['tecnologia','Tecnología','Tecnología','Tecnología y creatividad','tecnologia tech software startup saas digital ai ia'],
    ['creativos','Estudio creativo','Creativos','Tecnología y creatividad','creativo creativos agencia portfolio fotografia fotografo diseno designer'],
    ['moda','Moda','Moda','Belleza y moda','moda fashion ropa boutique'],
    ['servicios','Servicios profesionales','Servicios','Servicios profesionales','servicios profesional profesionales consultoria mantenimiento limpieza'],
    ['empresas','Empresa','Empresas','Servicios profesionales','empresa empresas corporativo corporate negocio business']
  ].map(([id,label,category,sector,aliases])=>({id,label,category,sector,aliases:aliases.split(' ')}));
  const styles=[
    {aliases:'elegante elegantes elegancia premium lujo lujoso sofisticado exclusiva exclusivo refinado'.split(' '),values:['premium','clasico','minimalista']},
    {aliases:'moderno moderna modernos modernas contemporaneo actual innovador'.split(' '),values:['moderno','animado','experimental']},
    {aliases:'serio seria sobrio sobria formal confianza tradicional clasico clasica'.split(' '),values:['clasico','minimalista'],categories:['Legal','Empresas','Servicios']},
    {aliases:'industrial tecnico tecnica robusto mecanico'.split(' '),values:['oscuro'],categories:['Industria','Automoción','Construcción']},
    {aliases:'minimal minimalista limpio limpia sencillo sencilla simple'.split(' '),values:['minimalista']},
    {aliases:'oscuro oscura dark negro negra'.split(' '),values:['oscuro']},
    {aliases:'animado animada dinamico dinamica movimiento'.split(' '),values:['animado']},
    {aliases:['3d','inmersivo','inmersiva'],values:['3d']}
  ];
  const stopWords=new Set('una un de del el la los las para con y web webs pagina paginas quiero necesito como'.split(' '));
  function tier(item){
    const tags=(item.style||[]).map(normalize),impact=Number(item.impact_score||0);
    if(tags.some(t=>t.includes('3d')||t.includes('experimental')))return {key:'signature',label:'Signature',price:299};
    if(tags.includes('premium')||impact>=24)return {key:'premium',label:'Premium',price:149};
    if(tags.includes('animado')||impact>=18)return {key:'pro',label:'Pro',price:79};
    return {key:'esencial',label:'Esencial',price:39};
  }
  function describe(item){
    const business=businesses.find(b=>normalize(b.category)===normalize(item.category));
    return {business:business?.id||'',sector:business?.sector||'Otros',text:normalize([item.id,item.commercial_name,item.title,item.original_title,item.category,item.desc,item.format,...(item.style||[]),...(item.tags||[])].join(' ')),style:(item.style||[]).map(normalize)};
  }
  function queryScore(item,query){
    const doc=describe(item),tokens=[...new Set(normalize(query).split(' ').filter(x=>x&&!stopWords.has(x)))].slice(0,16);
    let score=0;const reasons=[];
    for(const token of tokens){
      const matches=businesses.filter(b=>b.aliases.includes(token));
      const style=styles.find(s=>s.aliases.includes(token));
      const business=matches.find(b=>b.id===doc.business);
      const styleMatch=style&&(style.values.some(s=>doc.style.includes(s))||(style.categories||[]).includes(item.category));
      const literal=doc.text.split(' ').some(word=>word===token||(token.length>=4&&word.startsWith(token)));
      if(!literal&&!business&&!styleMatch)return null;
      score+=literal?12:business?8:5;
      if(business)reasons.push(business.label);
      else if(styleMatch)reasons.push('Estilo '+token);
    }
    return {score,reasons:[...new Set(reasons)]};
  }
  function search(items,options={}){
    const min=options.minPrice==null||options.minPrice===''?0:Number(options.minPrice);
    const max=options.maxPrice==null||options.maxPrice===''?Infinity:Number(options.maxPrice);
    if(!Number.isFinite(min)||min<0||Number.isNaN(max)||max<min)return [];
    const scored=[];
    for(const item of items){
      const doc=describe(item),price=tier(item).price;
      if((options.category&&item.category!==options.category)||(options.style&&!(item.style||[]).includes(options.style))
        ||(options.sector&&doc.sector!==options.sector)||(options.business&&doc.business!==options.business)||price<min||price>max)continue;
      const match=queryScore(item,options.query||'');if(match===null)continue;
      scored.push({item,...match});
    }
    const stats=options.stats||{},dates=options.dates||{};
    const metric=(id,key)=>stats[id]&&stats[id][key]!=null?Number(stats[id][key]):-1;
    const compare=(a,b)=>{
      const aid=a.item.id,bid=b.item.id;
      let difference=0;
      switch(options.sort){
        case 'price-asc':difference=tier(a.item).price-tier(b.item).price;break;
        case 'price-desc':difference=tier(b.item).price-tier(a.item).price;break;
        case 'popular':difference=metric(bid,'requests')-metric(aid,'requests');break;
        case 'sales':difference=metric(bid,'sales')-metric(aid,'sales');break;
        case 'conversion':difference=metric(bid,'conversion')-metric(aid,'conversion')||metric(bid,'requests')-metric(aid,'requests');break;
        case 'newest':difference=(Date.parse(dates[bid])||0)-(Date.parse(dates[aid])||0);break;
      }
      return difference||b.score-a.score||Number(b.item.impact_score||0)-Number(a.item.impact_score||0)
        ||String(a.item.commercial_name||a.item.title||aid).localeCompare(String(b.item.commercial_name||b.item.title||bid),'es')||aid.localeCompare(bid);
    };
    scored.sort(compare);return scored;
  }
  return {normalize,businesses,describe,tier,search};
});
