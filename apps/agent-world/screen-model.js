/* Computer displays project evidence, never invent terminal output. */
(function(root,factory){const m=factory();if(typeof module==='object'&&module.exports)module.exports=m;else root.ComputerModel=m;})(typeof window==='object'?window:globalThis,()=>{
  'use strict';
  const roles=['planner','designer','builder','reviewer','qa','security'];
  function project(role,mode,live,sessions,simulation,occupant) {
    if(mode==='simulation')return {source:'Simulation / illustrative',status:simulation.active.includes(role)?'Simulating':'Ready',title:simulation.title||'No simulated mission',activity:simulation.active.includes(role)?simulation.stage:'Waiting for a simulated handoff',events:simulation.events,result:'',changes:[],jobId:null};
    if(mode==='office'||mode==='live') {
      const jobs=live.jobs.filter(j=>occupant===undefined?j.role===role:occupant?.id===`job-${j.id}`);
      const job=jobs.find(j=>j.status==='running')||jobs.find(j=>j.status==='starting')||jobs.find(j=>j.status==='queued')||jobs[0];
      if(job)return {...job,changes:job.changes||[],jobId:job.id,source:'Native task events',status:job.status==='completed'?'Turn complete':job.status};
    }
    if(mode==='office'||mode==='sessions') {
      const entries=sessions.entries.filter(e=>(occupant===undefined?e.role===role:occupant?.id===`session-${e.id}`)&&['event-working','event-waiting','adapter-working','adapter-waiting','adapter-idle','adapter-ended'].includes(e.status));
      if(entries.length){const recorded=entries[0].status.startsWith('event-');return {source:recorded?'Local session transcript':'Adapter-reported metadata',status:entries[0].status.replace('adapter-','').replace('event-',''),title:entries[0].taskLabel||entries[0].label,activity:recorded?(entries[0].action||'Recent session activity'):`${entries[0].action||'Task role reported'}. Code and terminal output are not supplied by this metadata source.`,events:(entries[0].recentEvents||[]).map(e=>({at:e.at,text:e.label})),result:'',changes:[],jobId:null,sessionId:entries[0].id};}
    }
    return {source:mode==='observed'?'Read-only checkpoints / no per-agent screen':'No task screen connected',status:'Unmapped',title:'No assigned computer activity',activity:'Process presence alone does not reveal code, terminal output or a computer screen.',events:[],result:'',changes:[],jobId:null};
  }
  function previewURL(value,parentPort) {
    const u=new URL(value);
    if(u.protocol!=='http:'||!['localhost','127.0.0.1'].includes(u.hostname)||u.username||u.password||Number(u.port||80)===Number(parentPort||80))throw new Error('Use your local app address on a different port, such as http://localhost:3000.');
    return u.href;
  }
  return {roles,project,previewURL};
});
