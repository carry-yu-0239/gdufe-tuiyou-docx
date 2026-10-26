/* Light Evergreen Lattice composition — isolated presentation lifecycle. */
const REDUCED=matchMedia('(prefers-reduced-motion: reduce)');
const smallScreen=matchMedia('(max-width: 650px)');
const clampVisual=(n,min,max)=>Math.min(max,Math.max(min,n));
const root=document.documentElement;
const presentation={handles:new Map(),owned:[],hero:null,progress:null,dottext:null,nav:null,destroyed:false};
const dom=(s)=>document.querySelector(s);
const own=(off)=>{presentation.owned.push(off);return off;};
function listenVisual(el,evt,fn,opts){el.addEventListener(evt,fn,opts);own(()=>el.removeEventListener(evt,fn,opts));}
function fitCanvas(cv,ctx){const rect=cv.getBoundingClientRect();const dpr=Math.min(2,window.devicePixelRatio||1);const w=Math.max(1,rect.width),h=Math.max(1,rect.height);cv.width=Math.max(1,Math.round(w*dpr));cv.height=Math.max(1,Math.round(h*dpr));ctx.setTransform(dpr,0,0,dpr,0,0);return {w,h,dpr};}
function createHero(){
  const host=dom('.page-heading'),canvas=dom('#latticeField');if(!host||!canvas)return;
  const ctx=canvas.getContext('2d',{alpha:true});if(!ctx)return;
  let W=0,H=0,step=0,rafOff=null,inView=true,fieldScale=1;
  const pointer={x:0,y:0,active:false},N=smallScreen.matches?390:850,gridCount=Math.round(N*.26);
  const dots=new Dots(N);dots.k=34;dots.damp=7;dots.flow=9;
  for(let i=0;i<N;i++){dots.s[i]=i<gridCount?.65:.6+dots.seed[i]*.9;dots.heat[i]=0;}
  function mapPoint(i,index){
    const t=(i-gridCount)/Math.max(1,N-gridCount-1),j=dots.seed[i];
    const cx=W*(smallScreen.matches?.78:.79),cy=H*.53;
    const rx=W*(smallScreen.matches?.23:.215),ry=H*.375;
    const turn=t*Math.PI*2,phase=index%6;
    if(phase===0){const ring=t*5.5*Math.PI;const rr=.66+.28*Math.sin(t*9*Math.PI)+.1*(j-.5);return [cx+rx*Math.cos(ring)*rr,cy+ry*Math.sin(ring)*(.79+.2*Math.sin(t*4*Math.PI))];}
    if(phase===1){const a=t*11*Math.PI;const x=cx+(t-.5)*rx*1.8;return [x,cy+Math.sin(a)*ry*.7+(j-.5)*12];}
    if(phase===2){const ring=Math.floor(t*4),local=t*4-ring,a=local*2*Math.PI+ring*.7;return [cx+Math.cos(a)*rx*(.31+ring*.21),cy+Math.sin(a)*ry*(.31+ring*.21)];}
    if(phase===3){const layer=Math.floor(t*6),local=t*6-layer,a=-1.15+layer*.48+local*.16;const rad=Math.pow(local,.8)*(rx*.95);return [cx+Math.cos(a)*rad+(j-.5)*10,cy+Math.sin(a)*rad*.97+(j-.5)*12];}
    if(phase===4){const cols=Math.max(16,Math.floor(rx*2/13));return [cx-rx+(i%cols)*(rx*2/cols),cy-ry+(Math.floor((i-gridCount)/cols)%Math.max(1,Math.floor(ry*2/13)))*(ry*2/Math.max(1,Math.floor(ry*2/13)))];}
    // final stage: a big check made from two gently noisy point strokes
    const v=t<.37?t/.37:(t-.37)/.63;
    return t<.37?[cx-rx*.8+v*rx*.62,cy+v*ry*.38]:[cx-rx*.18+v*rx*1.26,cy+ry*.38-v*ry*1.2];
  }
  function target(s,initial=false){step=s;
    const stepNoise=step*.27;
    for(let i=0;i<N;i++){
      if(i<gridCount){const cols=Math.max(10,Math.round(W*.45/20));const col=i%cols,row=Math.floor(i/cols);const px=W*.53+col*19+(row%2)*9,py=21+row*19;
        dots.home(i,px,py,.11+.12*dots.seed[i]);dots.s[i]=.52;
      }else{
        const [x,y]=mapPoint(i,s);dots.home(i,x,y,.29+.63*dots.seed[i]);dots.s[i]=.6+.83*dots.seed[i];
      }
      if(initial){dots.place(i,dots.tx[i]+(dots.seed[i]-.5)*65,dots.ty[i]+(dots.seed[(i*7)%N]-.5)*38);dots.a[i]=0;}
    }
    if(initial||REDUCED.matches)dots.snap();else dots.stagger(.65,i=>dots.tx[i]+dots.ty[i]*.14);
  }
  function resize(){const b=fitCanvas(canvas,ctx);W=b.w;H=b.h;if(W<2||H<2)return;target(step,true);draw(0,0);}
  function draw(dt,t){ctx.clearRect(0,0,W,H);if(W<2||H<2)return;
    // One field, two particle states: faint lattice sites + concentrated spring points.
    if(pointer.active&&!REDUCED.matches)dots.attract(pointer.x,pointer.y,140,-.75);
    if(!REDUCED.matches){dots.flow=16;dots.step(dt);}else dots.snap();
    const hot='#1e674a',deep='#285b44',faint='#7fae91';
    for(let i=0;i<N;i++){
      const a=dots.a[i];if(a<.018)continue;
      const x=dots.x[i],y=dots.y[i];if(!Number.isFinite(x)||!Number.isFinite(y))continue;
      const depth=dots.seed[i],glow=dots.heat[i];
      ctx.globalAlpha=Math.min(1,a*(i<gridCount?.65:1));
      ctx.fillStyle=glow>.55?'#0d553a':i<gridCount?faint:(depth>.77?hot:deep);
      const r=i<gridCount?.78:depth>.82?1.9:1.1;
      ctx.beginPath();ctx.arc(x,y,r*(1+glow*.44),0,Math.PI*2);ctx.fill();
      if(i>=gridCount&&i%17===0&&depth>.35){ctx.globalAlpha=a*.15;ctx.beginPath();ctx.arc(x,y,4.8,0,Math.PI*2);ctx.fill();}
    }
    ctx.globalAlpha=1;
  }
  const off=clock.add((dt,t)=>{if(!document.hidden&&inView)draw(dt,t);});own(off);
  const ro=new ResizeObserver(resize);ro.observe(host);own(()=>ro.disconnect());
  const io=new IntersectionObserver(([v])=>{inView=!!v?.isIntersecting;},{threshold:0});io.observe(host);own(()=>io.disconnect());
  function pointerMove(e){const r=canvas.getBoundingClientRect();pointer.x=e.clientX-r.left;pointer.y=e.clientY-r.top;pointer.active=true;}
  listenVisual(host,'pointermove',pointerMove,{passive:true});listenVisual(host,'pointerleave',()=>pointer.active=false,{passive:true});
  listenVisual(host,'pointerdown',e=>{if(REDUCED.matches)return;pointerMove(e);dots.burst(pointer.x,pointer.y,32);},{passive:true});
  resize();
  presentation.hero={stepTo(n){if(n===step)return;target(n);},get step(){return step;},get count(){return dots.n}};
}
function createNavDots(){
  const nav=dom('#steps');if(!nav)return;
  const cv=document.createElement('canvas');cv.className='lattice-steps-canvas';cv.setAttribute('aria-hidden','true');nav.appendChild(cv);
  const ctx=cv.getContext('2d');if(!ctx)return;own(()=>cv.remove());
  const dots=new Dots(28);dots.k=100;dots.damp=11;let w=1,h=1,shown=-1;
  function draw(dt){ctx.clearRect(0,0,w,h);dots.step(dt);dots.draw(ctx,{ink:'#a6e7ba',hot:'#e1ffda',r:1.17});}
  function resize(){const b=fitCanvas(cv,ctx);w=b.w;h=b.h;target(true);draw(0);}
  function target(force=false){const active=nav.querySelector('.step-button.active');if(!active)return;const list=nav.getBoundingClientRect(),rect=active.getBoundingClientRect(),mobile=matchMedia('(max-width: 870px)').matches;
    if(!force && Number(active.dataset.step)===shown)return;
    shown=Number(active.dataset.step);
    for(let i=0;i<dots.n;i++){
      const col=i%14,row=Math.floor(i/14);
      const x=mobile?rect.left-list.left+9+col*(Math.max(24,rect.width-18)/13):rect.right-list.left-33+col*.75;
      const y=mobile?rect.bottom-list.top-7+row*2.7:rect.top-list.top+rect.height*.44+row*5;
      dots.home(i,x,y,mobile?.5:.6);
      if(force)dots.place(i,x,y);
    }
    dots.stagger(.24,i=>dots.tx[i]);if(force||REDUCED.matches)dots.snap();
  }
  const ro=new ResizeObserver(resize);ro.observe(nav);own(()=>ro.disconnect());
  const off=clock.add(dt=>{if(!document.hidden&&!REDUCED.matches)draw(dt);});own(off);
  resize();presentation.nav={target};
}
function mountReadout(){
  const s=dom('#latticeStepGlyph');if(!s)return;
  const instance=owned(()=>mountDotText(s,{pitch:4.2,color:'--hot'}));presentation.dottext=instance.api;
  own(()=>{const value=s.getAttribute('aria-label')||'01';instance.destroy();s.querySelectorAll('canvas.lx-canvas').forEach(x=>x.remove());s.textContent=value;s.removeAttribute('style');});
}
function mountCompletion(){
  const holder=dom('#latticeProgress'),bar=dom('#fillBar'),percent=dom('#latticeProgressPercent');if(!holder||!bar)return;
  const instance=owned(()=>mountProgress(holder));presentation.progress=instance.api;
  let prev=-1;
  const sync=()=>{const p=clampVisual(parseFloat(bar.style.width)||0,0,100);if(p===prev)return;prev=p;instance.api.set(p/100);if(percent)percent.textContent=Math.round(p)+'%';};
  const mo=new MutationObserver(sync);mo.observe(bar,{attributes:true,attributeFilter:['style']});own(()=>mo.disconnect());
  own(()=>{instance.destroy();holder.querySelectorAll('canvas.lx-canvas').forEach(x=>x.remove());});
  sync();
}
function buttons(){
  const selectors=['#nextBtn','#prevBtn','#downloadDocx','#runValidation','#saveDraft','#railReview','.add-button'];
  const active=new Set(document.querySelectorAll(selectors.join(',')));
  for(const [node,h] of [...presentation.handles]){
    if(!node.isConnected || !active.has(node) || !node.querySelector('canvas.lx-canvas')){
      h.destroy();presentation.handles.delete(node);
    }
  }
  for(const b of active){if(presentation.handles.has(b))continue;
    try{const variant=b.matches('#nextBtn,#downloadDocx')?'accent':b.matches('#prevBtn,#runValidation')?'primary':'ghost';const handle=enhanceButton(b,{variant});presentation.handles.set(b,handle);}
    catch(e){console.warn('Lattice button enhancement skipped:',e.message);}
  }
}
function onStepChanged(){const active=dom('.step-button.active'),step=Number(active?.dataset.step||0);if(Number.isInteger(step)){
  presentation.hero?.stepTo(step);presentation.nav?.target();
  presentation.dottext?.set(String(step+1).padStart(2,'0'));
  const hint=dom('.lattice-step-caption');if(hint)hint.textContent=`CURRENT / 06`;
}}
function observeOriginal(){
  const nav=dom('#steps');
  if(nav){const obs=new MutationObserver(()=>{requestAnimationFrame(onStepChanged);});obs.observe(nav,{attributes:true,attributeFilter:['class'],subtree:true});own(()=>obs.disconnect());}
  // The original app rebuilds repeatable records and the export button's innerHTML.
  // Reattach only canvases to new DOM; never rebind the app's business events.
  const watch=dom('#form');if(watch){let scheduled=false;const obs=new MutationObserver(()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;buttons();});});obs.observe(watch,{childList:true,subtree:true});own(()=>obs.disconnect());}
  listenVisual(document,'pointerdown',e=>{
    const node=e.target.closest?.('.btn,.add-button,.step-button');if(!node||REDUCED.matches||e.pointerType==='touch')return;
    const r=node.getBoundingClientRect();const p=document.createElement('span');p.className='lattice-button-burst';p.style.left=(e.clientX-r.left)+'px';p.style.top=(e.clientY-r.top)+'px';
    if(getComputedStyle(node).position==='static')return;
    node.appendChild(p);setTimeout(()=>p.remove(),720);
  },{passive:true});
}
function injectDecor(){for(const sec of document.querySelectorAll('.section-head')){
  const d=document.createElement('div');d.className='lattice-section-dots';d.setAttribute('aria-hidden','true');d.innerHTML='<i></i><i></i><i></i>';sec.appendChild(d);
}}
function initPresentation(){try{
  injectDecor();createHero();createNavDots();mountReadout();mountCompletion();buttons();observeOriginal();onStepChanged();
  // No network dependency. The original business bundle and underlying DOCX remain untouched.
  window.QingmaLattice={diagnostics:()=>({buttons:presentation.handles.size,particles:presentation.hero?.count||0,clockSubscribers:clock.subs.size,step:presentation.hero?.step||0}),teardown:destroyPresentation};
}catch(e){console.error('Carry Lattice visual enhancement failed; original form remains usable:',e);}}
function destroyPresentation(){if(presentation.destroyed)return;presentation.destroyed=true;
  for(const [node,h]of presentation.handles)h.destroy();presentation.handles.clear();
  for(const off of presentation.owned.splice(0).reverse())try{off();}catch{};
}
window.addEventListener('pagehide',destroyPresentation,{once:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initPresentation,{once:true});else initPresentation();
