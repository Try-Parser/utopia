/* Pure movement and pathfinding for the office floor. Coordinates denote feet. */
(function (root, factory) {
  const model = factory();
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.OfficeGameModel = model;
})(typeof window === 'object' ? window : globalThis, () => {
  'use strict';
  const walls = [[335,69,343,235],[604,69,612,235],[335,357,343,494],[604,357,612,494],[68,280,145,323],[819,280,889,323]];
  walls.push([902,64,912,275],[902,357,912,537],[986,191,1158,411],[1056,150,1088,178],[1056,425,1088,453]);
  for(const x of [948,1167])for(const y of [222,290,358])walls.push([x,y,x+27,y+35]);
  for (const x of [194,474,754]) {
    walls.push([x-49,138,x+49,190], [x-26,194,x+26,236], [x-49,385,x+49,438], [x-26,440,x+26,482]);
  }
  // Extra side workstations and office equipment rendered in the scene.
  for(const x of [272,552,832]) {
    walls.push([x-26,138,x+26,180],[x-13,193,x+13,225],
      [x-26,383,x+26,425],[x-13,438,x+13,470]);
  }
  for(const x of [80,360,632]) walls.push([x,130,x+39,205],[x,390,x+39,454]);
  const baseWalls=walls.slice();let bounds={left:80,top:73,right:1210,bottom:505};
  function configure(geometry) {
    walls.splice(0,walls.length);bounds=geometry?{left:35,top:35,right:geometry.width-35,bottom:geometry.height-35}:{left:80,top:73,right:1210,bottom:505};
    if(!geometry){walls.push(...baseWalls);return;}
    walls.push(...geometry.furniture.slice(0,3),...geometry.walls,...(geometry.decorations||[]).map(d=>d.bounds));
    for(const {desk:{x,y}} of geometry.stations)walls.push([x-28,y-20,x+28,y+20]);
    // Chairs mark intentional sitting positions; desk and shared furniture block walking.
  }

  function free(x,y) {
    return Number.isFinite(x) && Number.isFinite(y) && x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom &&
      !walls.some(([a,b,c,d]) => x > a-8+1e-7 && x < c+8-1e-7 && y > b-8+1e-7 && y < d+8-1e-7);
  }
  function move(position, dx, dy) {
    let {x,y} = position;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx),Math.abs(dy))/4));
    for (let i=0;i<steps;i++) { if (free(x+dx/steps,y)) x+=dx/steps; if (free(x,y+dy/steps)) y+=dy/steps; }
    // Keep exact grid boundaries stable across fractional animation steps.
    return {x:Math.round(x*1e9)/1e9,y:Math.round(y*1e9)/1e9};
  }
  // Consume a distance budget across waypoints, independently of graphics frame rate.
  function advanceRoute(position,route,distance){
    let next={...position},remaining=Math.max(0,distance),index=0,heading=null,moved=false;
    while(index<route.length){const target=route[index],dx=target.x-next.x,dy=target.y-next.y,d=Math.hypot(dx,dy);if(d<1){index++;continue;}if(remaining<=0)break;
      const step=Math.min(d,remaining),after=move(next,dx/d*step,dy/d*step),travelled=Math.hypot(after.x-next.x,after.y-next.y);if(travelled>.000001){heading={x:after.x-next.x,y:after.y-next.y};moved=true;}next=after;remaining-=travelled;
      if(travelled<step-.000001)break;if(Math.hypot(target.x-next.x,target.y-next.y)<1)index++;else break;
    }
    return {position:next,route:route.slice(index),heading,moved};
  }
  // A* on the bounded 10px floor grid; tall departments need directed search.
  function path(start, target) {
    if (!free(start.x,start.y) || !free(target.x,target.y)) return [];
    const key = p => `${p.x},${p.y}`;
    // A clear point beside a desk may round into it. Attach each endpoint to
    // the nearest free grid node only when the entire connecting segment is clear.
    function attach(p) {
      const candidates=[];
      for(let x=Math.floor(p.x/10)*10-10;x<=Math.ceil(p.x/10)*10+10;x+=10) {
        for(let y=Math.floor(p.y/10)*10-10;y<=Math.ceil(p.y/10)*10+10;y+=10) {
          const distance=Math.hypot(x-p.x,y-p.y),steps=Math.max(1,Math.ceil(distance/2));
          let clear=true;
          for(let i=0;i<=steps;i++) if(!free(p.x+(x-p.x)*i/steps,p.y+(y-p.y)*i/steps)) {clear=false;break;}
          if(clear) candidates.push({x,y,distance});
        }
      }
      candidates.sort((a,b)=>a.distance-b.distance);
      return candidates[0];
    }
    const a=attach(start),b=attach(target);
    if (!a || !b) return [];
    const heap=[],visited=new Map([[key(a),null]]),costs=new Map([[key(a),0]]);
    const estimate=p=>Math.abs(p.x-b.x)+Math.abs(p.y-b.y),before=(a,b)=>a.f<b.f||a.f===b.f&&a.h<b.h;
    function push(p,g){const n={...p,g,h:estimate(p)};n.f=g+n.h;heap.push(n);let i=heap.length-1;while(i){const parent=(i-1)>>1;if(!before(heap[i],heap[parent]))break;[heap[i],heap[parent]]=[heap[parent],heap[i]];i=parent;}}
    function pop(){const n=heap[0],last=heap.pop();if(heap.length){heap[0]=last;let i=0;while(true){let next=i;for(const j of [i*2+1,i*2+2])if(j<heap.length&&before(heap[j],heap[next]))next=j;if(next===i)break;[heap[i],heap[next]]=[heap[next],heap[i]];i=next;}}return n;}
    push(a,0);
    while(heap.length) {
      const p=pop();if(p.g!==costs.get(key(p)))continue;
      if(key(p)===key(b)) {
        const result=[target]; let cursor=p;
        while(cursor) {result.push(cursor);cursor=visited.get(key(cursor));}
        return result.reverse();
      }
      for(const [dx,dy] of [[10,0],[-10,0],[0,10],[0,-10]]) {
        const q={x:p.x+dx,y:p.y+dy}, k=key(q),cost=p.g+10;
        if(free(q.x,q.y) && cost<(costs.get(k)??Infinity)) {costs.set(k,cost);visited.set(k,p);push(q,cost);}
      }
    }
    return [];
  }
  return {free,move,path,configure,advanceRoute};
});
