(function(){
  'use strict';
  window.CatalogDiscoveryUI={async setup({state,render,escape:esc}){
    let report;
    try{const r=await fetch('/api/catalog/discovery',{cache:'no-store',signal:AbortSignal.timeout(12000)});if(!r.ok)return null;report=await r.json();}catch{return null;}
    if(!report.enabled||!window.CatalogSearch)return null;
    const engine=window.CatalogSearch,controls=document.querySelector('.library-controls');
    const values=key=>[...new Set(state.items.map(x=>key==='sector'?engine.describe(x).sector:x[key]).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
    const options=(items,first)=>'<option value="">'+first+'</option>'+items.map(x=>'<option value="'+esc(x)+'">'+esc(x)+'</option>').join('');
    controls.classList.add('discovery-controls');
    controls.innerHTML='<label class="discovery-query">Qué negocio y estilo buscas<input id="librarySearch" type="search" maxlength="200" placeholder="Ej. peluquería elegante"></label>'
      +'<label>Categoría<select id="libraryCategory">'+options(values('category'),'Todas las categorías')+'</select></label>'
      +'<label>Estilo visual<select id="libraryStyle">'+options([...new Set(state.items.flatMap(x=>x.style||[]))].sort(),'Todos los estilos')+'</select></label>'
      +'<label>Sector<select id="discoverySector">'+options(values('sector'),'Todos los sectores')+'</select></label>'
      +'<label>Tipo de negocio<select id="discoveryBusiness"><option value="">Todos los negocios</option>'+engine.businesses.filter(b=>state.items.some(x=>engine.describe(x).business===b.id)).map(b=>'<option value="'+b.id+'">'+esc(b.label)+'</option>').join('')+'</select></label>'
      +'<label>Creación desde (€)<input id="discoveryMin" type="number" min="0" step="1" placeholder="Sin mínimo"></label>'
      +'<label>Creación hasta (€)<input id="discoveryMax" type="number" min="0" step="1" placeholder="Sin máximo"></label>'
      +'<label>Ordenar por<select id="discoverySort"><option value="relevance">Más apropiadas</option><option value="popular">Más populares · solicitudes</option><option value="sales">Más vendidas</option><option value="conversion">Mayor conversión</option><option value="newest">Más nuevas · incorporadas</option><option value="price-asc">Precio menor a mayor</option><option value="price-desc">Precio mayor a menor</option></select></label>';
    controls.insertAdjacentHTML('afterend','<div class="discovery-examples" aria-label="Ejemplos de búsqueda">'+['peluquería elegante','restaurante moderno','abogado serio','taller industrial','inmobiliaria premium'].map(x=>'<button type="button" data-discovery-query="'+esc(x)+'">'+esc(x)+'</button>').join('')+'</div><div class="discovery-actions"><button id="discoveryRecommend" type="button">Recomendar las 3 más apropiadas</button><button id="discoveryAll" type="button" hidden>Ver todos los resultados</button><button id="discoveryReset" type="button">Limpiar filtros</button></div><div id="discoverySummary" class="discovery-summary" role="status" aria-live="polite"></div>');
    let onlyThree=false,latest=[],total=0;
    const get=id=>document.getElementById(id),sort=get('discoverySort');
    if(!report.metricsAvailable)for(const option of sort.options)if(['popular','sales','conversion'].includes(option.value))option.disabled=true;
    const read=()=>({query:state.query,category:state.category,style:state.style,sector:get('discoverySector').value,business:get('discoveryBusiness').value,minPrice:get('discoveryMin').value,maxPrice:get('discoveryMax').value,sort:onlyThree?'relevance':sort.value,stats:report.stats,dates:report.dates});
    const reset=()=>{onlyThree=false;get('discoveryAll').hidden=true;};
    ['discoverySector','discoveryBusiness','discoveryMin','discoveryMax','discoverySort'].forEach(id=>get(id).addEventListener(id==='discoveryMin'||id==='discoveryMax'?'input':'change',()=>{reset();render(true)}));
    ['librarySearch','libraryCategory','libraryStyle'].forEach(id=>get(id).addEventListener(id==='librarySearch'?'input':'change',reset));
    get('discoveryRecommend').onclick=()=>{onlyThree=true;sort.value='relevance';get('discoveryAll').hidden=false;render(true)};
    get('discoveryAll').onclick=()=>{reset();render(true)};
    get('discoveryReset').onclick=()=>{controls.querySelectorAll('input,select').forEach(x=>x.value='');sort.value='relevance';state.query='';state.category='';state.style='';reset();render(true)};
    document.querySelectorAll('[data-discovery-query]').forEach(button=>button.onclick=()=>{get('librarySearch').value=button.dataset.discoveryQuery;get('librarySearch').dispatchEvent(new Event('input',{bubbles:true}))});
    return {
      filter(items){latest=engine.search(items,read());total=latest.length;return (onlyThree?latest.slice(0,3):latest).map(result=>result.item);},
      afterRender(){
        const options=read(),invalid=options.minPrice!==''&&options.maxPrice!==''&&Number(options.minPrice)>Number(options.maxPrice);
        let message=invalid?'El precio mínimo no puede superar al máximo.':onlyThree?Math.min(3,total)+' demos recomendadas de '+total+' coincidencias.':total+' diseños coinciden con tu búsqueda.';
        if(onlyThree&&total>0&&total<3)message+=' No hay tres coincidencias con estos filtros.';
        const notes=['Precio de creación. Mantenimiento al activar: 19,90 €/mes.'];
        if(report.mode==='test')notes.push('Staging: estadísticas de pruebas, sin clientes reales.');
        if(!report.metricsAvailable)notes.push('Estadísticas no disponibles ahora. La búsqueda sigue funcionando.');
        else notes.push('Popularidad = solicitudes; conversión = ventas con cobro / solicitudes.');
        if(report.metricsAvailable&&options.sort==='popular'&&!latest.some(x=>report.stats?.[x.item.id]?.requests>0))notes.push('No hay solicitudes registradas para ordenar estos resultados por popularidad.');
        if(report.metricsAvailable&&['sales','conversion'].includes(options.sort)&&!latest.some(x=>report.stats?.[x.item.id]?.sales>0))notes.push('Todavía no hay ventas registradas entre estos diseños; no existe un ranking de ventas con datos.');
        if(options.sort==='newest')notes.push('Incorporaciones observadas desde el inicio del seguimiento. Las fechas anteriores no están disponibles; esos diseños aparecen al final.');
        get('discoverySummary').innerHTML=esc(message)+'<small>'+notes.map(esc).join(' ')+'</small>';
        document.querySelectorAll('#libraryGrid .library-card').forEach(card=>{
          const id=card.dataset.templateId,result=latest.find(x=>x.item.id===id),metric=report.stats?.[id];
          const title=card.querySelector('h3');
          if(onlyThree&&result?.reasons.length)title.insertAdjacentHTML('beforebegin','<p class="discovery-badge">'+esc(result.reasons.join(' · '))+'</p>');
          const info=!report.metricsAvailable||!metric?'Estadísticas no disponibles':metric.requests===0?'Sin solicitudes ni ventas registradas':metric.requests+' solicitudes · '+metric.sales+' ventas · '+(metric.conversion*100).toLocaleString('es-ES',{maximumFractionDigits:1})+'% de conversión';
          const added=report.dates?.[id];
          title.insertAdjacentHTML('afterend','<p class="discovery-card-note">'+esc(info)+(options.sort==='newest'?'<br>'+esc(added?'Incorporada al seguimiento: '+new Date(added).toLocaleDateString('es-ES'):'Fecha de incorporación no disponible'):'')+'</p>');
        });
      }
    };
  }};
})();
