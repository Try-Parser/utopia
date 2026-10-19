/* Portable provider selection: the server owns commands and capabilities. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.MissionProviders=api;})(typeof window==='object'?window:globalThis,()=>{
  'use strict';
  const idPattern=/^[a-z][a-z0-9-]{0,39}$/;
  function validProviders(providers){
    return Array.isArray(providers)&&providers.length<=32&&new Set(providers.map(p=>p?.id)).size===providers.length&&providers.every(p=>p&&typeof p.id==='string'&&idPattern.test(p.id)&&typeof p.label==='string'&&p.label.length>0&&p.label.length<=80&&typeof p.installed==='boolean'&&typeof p.available==='boolean'&&typeof p.reason==='string'&&p.reason.length<=240&&Array.isArray(p.accessModes)&&p.accessModes.length<=2&&p.accessModes.every(m=>['read-only','workspace-write'].includes(m))&&(!p.available||p.installed&&p.accessModes.length>0));
  }
  function selectProvider(providers,saved,current=''){
    const available=providers.filter(p=>p.available);
    if(available.some(p=>p.id===current))return current;
    if(available.some(p=>p.id===saved))return saved;
    return available.length===1?available[0].id:'';
  }
  function jobProvider(job){
    // Saved jobs from the original runner predate provider fields and are Codex.
    if(job.provider===undefined)return 'Codex';
    return job.providerLabel||job.provider;
  }
  return {validProviders,selectProvider,jobProvider};
});
