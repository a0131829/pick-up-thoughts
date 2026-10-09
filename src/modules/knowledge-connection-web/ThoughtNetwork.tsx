import {captureOpacity,type Capture} from '../shared/local-captures';
import {useEffect,useRef,useState} from 'react';
import {AnimatePresence,motion,useReducedMotion} from 'framer-motion';
import './thought-network.css';
import {LampTypography} from './LampTypography';
import {type ArchiveRecord} from '../../shared/types';
import {StickyNotes} from './StickyNotes';
type Thought={id:string;title:string;tag:string;text:string;date:string;excerpt:boolean;related:number[];outer:boolean;parent?:number;hasRecords?:boolean;recordIds?:string[]};
type Point={x:number;y:number;z:number};
type Phase='idle'|'pop'|'fly'|'fall'|'scatter'|'gather'|'rise'|'light'|'read'|'return';
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
const ease=(n:number)=>{n=clamp(n);return n*n*(3-2*n)};
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
// Editorial introductions describe the shared taxonomy, not quotations from the archive.
const clusterIntroductions:Record<string,string>={
 '自我认知':'A space to notice who I am becoming. Questions of identity, acceptance and agency sit beside turning points and the values I choose to live by.',
 '情绪与人际关系':'How we feel, how we connect, and where we draw the line. These thoughts trace the tender work of understanding emotions and caring for relationships without losing ourselves.',
 '身体健康':'Learning to listen to the body before asking more of it. Sleep, nourishment, movement and rest become small ways of building a life with energy and care.',
 '学习与行动':'The distance between knowing and doing is crossed in small steps. Here, habits, attention, practice and feedback turn curiosity into something we can live.',
 '内容创作':'Giving an inner world a form others can encounter. Words, images, moving pictures and experiments gather here as an ongoing conversation with taste and expression.',
 '职业与财务':'What do we work for, and what is enough? Reflections on career, independence, spending and money explore the choices behind a sustainable and meaningful life.',
 '日常生活':'A life takes shape in ordinary things. Making room, tending a home and finding time to pause are quiet practices of creating a rhythm that feels our own.',
 '旅行与生活感受':'Places leave traces long after we leave them. Journeys, nature, small moments of happiness and remembered scenes offer new ways of seeing everyday life.',
 '知识探索':'Following a question beyond its first answer. Technology, society, philosophy and culture become connected paths toward a wider, more curious understanding of the world.'
};
function CaptureDetail({capture,onClose}:{capture:Capture;onClose:()=>void}){
 const [urls,setURLs]=useState<string[]>([]);
 useEffect(()=>{const urls=capture.images.map(image=>URL.createObjectURL(image));setURLs(urls);return()=>urls.forEach(url=>URL.revokeObjectURL(url))},[capture]);
 const button=useRef<HTMLButtonElement>(null);
 useEffect(()=>{const previous=document.activeElement as HTMLElement;button.current?.focus();const key=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();if(e.key==='Tab'){e.preventDefault();button.current?.focus()}};window.addEventListener('keydown',key);return()=>{window.removeEventListener('keydown',key);previous?.focus()}},[]);
 return <div className="capture-detail" role="dialog" aria-modal="true" aria-label="收集的念头" onClick={onClose}><article onClick={e=>e.stopPropagation()}><button ref={button} onClick={onClose} aria-label="关闭念头">×</button><p>{capture.text}</p>{urls.map(url=><img key={url} src={url} alt="收集的图片"/>)}<small>{capture.id.startsWith("demo-letter-star-")?"演示数据 · 未写入资料库":"保存在本机浏览器 · 尚未同步到拾念资料库"}</small></article></div>;
}
export function ThoughtNetwork({captures=[],pendingId}:{captures?:Capture[];pendingId?:string}){
 const [demoStars,setDemoStars]=useState(()=>{try{return localStorage.getItem('glean-demo-stars')!=='off'}catch{return true}});
 const [demoCaptures]=useState<Capture[]>(()=>['今天也可以慢慢来。','不必事事完美。','留一点时间给自己。','听见了风经过树叶。','身体比进度更重要。','一个小小的念头也值得留下。','读到一句让我安心的话。','允许自己改变方向。','此刻已经很好。','把担心轻轻放下。'].map((text,i)=>({id:`demo-letter-star-${i}`,text:`演示念头 · ${text}`,images:[],createdAt:new Date(Date.now()-i*.68*86400000).toISOString()})));
 const visibleCaptures=demoStars?[...captures,...demoCaptures]:captures;
 const captureLayer=useRef<HTMLDivElement>(null);
 const [captureTime,setCaptureTime]=useState(Date.now);
 useEffect(()=>{const update=()=>setCaptureTime(Date.now());const timer=window.setInterval(update,60000);document.addEventListener('visibilitychange',update);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',update)}},[]);
 const captureRef=useRef(visibleCaptures);captureRef.current=visibleCaptures;
 const captureButtons=useRef<Record<string,HTMLButtonElement|null>>({});
 const [captureOpen,setCaptureOpen]=useState<Capture|null>(null);
 const [entranceRate,setEntranceRate]=useState(1),[entranceReplay,setEntranceReplay]=useState(0);
 const [archive,setArchive]=useState<ArchiveRecord[]>([]);
 const [thoughts,setThoughts]=useState<Thought[]>([]),[error,setError]=useState(false),[selected,setSelected]=useState(-1),[reading,setReading]=useState(false),[paused,setPaused]=useState(false),[lit,setLit]=useState(true);
 const reduce=useReducedMotion(),canvasRef=useRef<HTMLCanvasElement>(null),stage=useRef<HTMLDivElement>(null),lampScene=useRef<HTMLDivElement>(null),reader=useRef<HTMLElement>(null),lamp=useRef<HTMLButtonElement>(null),beam=useRef<HTMLDivElement>(null),litContent=useRef<HTMLDivElement>(null),falloff=useRef<HTMLDivElement>(null),cordRig=useRef<HTMLDivElement>(null);
 const open=useRef<(i:number)=>void>(()=>{}),close=useRef<()=>void>(()=>{}),pause=useRef(paused),light=useRef(lit);pause.current=paused;light.current=lit;
 useEffect(()=>{const ac=new AbortController();const read=(path:string)=>fetch(path,{signal:ac.signal}).then(r=>{if(!r.ok)throw Error();return r.json()});Promise.all([read('/local/thought-network.json'),read('/local/archive.json')]).then(([nodes,data])=>{setThoughts(nodes);setArchive(data.records)}).catch(e=>{if(e.name!=='AbortError')setError(true)});return()=>ac.abort()},[]);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape')close.current()};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[]);
 useEffect(()=>{
  if(!thoughts.length)return;
  const canvas=canvasRef.current!,host=stage.current!,ctx=canvas.getContext('2d')!;
  let seed=28177;const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296};
  // Layered volume: spaced outer hubs, loose inner clusters, sparse unconnected dust.
  const nodes:Point[]=[];const outerCount=thoughts.filter(t=>t.outer).length;
  const sample=():Point=>{const z=random()*2-1,a=random()*Math.PI*2,r=.23+.85*Math.cbrt(random()),q=Math.sqrt(1-z*z);return{x:Math.cos(a)*q*r*1.35,y:Math.sin(a)*q*r,z:z*r}};
  for(let i=0;i<118;i++){
   let p=sample();
   if(i<outerCount){let best=-1;for(let j=0;j<30;j++){let c=sample();const length=Math.hypot(c.x,c.y,c.z),radius=.82+random()*.3;c={x:c.x/length*1.28*radius,y:c.y/length*radius,z:c.z/length*radius};const d=Math.min(...nodes.map(n=>Math.hypot(n.x-c.x,n.y-c.y,n.z-c.z)),3);if(d>best){best=d;p=c}}}
   else if(i<thoughts.length){const parent=nodes[thoughts[i].parent!];let best=-1;for(let j=0;j<16;j++){const q=sample(),depth=.42+random()*.32,c={x:parent.x*depth+q.x*.3,y:parent.y*depth+q.y*.3,z:parent.z*depth+q.z*.3};const gap=Math.min(...nodes.slice(outerCount).map(n=>Math.hypot(c.x-n.x,c.y-n.y,c.z-n.z)),1);if(gap>best){best=gap;p=c}}}
   else p={x:p.x*.82,y:p.y*.82,z:p.z*.82};
   nodes.push(p);
  }
  const edges:{a:number;b:number;base:number;delay:number}[]=[],seen=new Set<string>();
  const add=(a:number,b:number)=>{const key=[Math.min(a,b),Math.max(a,b)].join(':');if(a!==b&&!seen.has(key)){seen.add(key);edges.push({a,b,base:(a<outerCount||b<outerCount?.12:.09)+random()*.06,delay:random()})}};
  nodes.forEach((p,i)=>nodes.map((n,j)=>({j,d:Math.hypot(p.x-n.x,p.y-n.y,p.z-n.z)})).filter(n=>n.j!==i).sort((a,b)=>a.d-b.d).slice(0,i<outerCount?8:3).forEach(n=>add(i,n.j)));
  thoughts.forEach((t,i)=>t.related.forEach(j=>add(i,j)));
  const stars=Array.from({length:640},()=>{const p=sample(),bright=random()<.085;return {...p,x:p.x*1.22,y:p.y*1.22,z:p.z*1.22,size:bright?1.7+random()*1.3:.5+random(),alpha:bright?.55+random()*.45:.22+random()*.45}});
  const pointSizes=nodes.map((_,i)=>i<outerCount?2.1+random()*.8:1+random()*.9);
  const sparks=Array.from({length:160},()=>({a:random()*Math.PI*2,r:random(),v:random(),glyph:'·:+*念'[Math.floor(random()*5)]}));
  const figure:{x:number;y:number;glyph:string}[]=[];
  for(let y=0;y<36;y++)for(let x=-15;x<=15;x++){
   const head=x*x+(y-6)*(y-6)<30,body=y>11&&y<26&&Math.abs(x)<(y<16?y-9:7),legs=y>=26&&y<35&&Math.abs(x)>1&&Math.abs(x)<7;
   if(head||body||legs)figure.push({x:x/30,y:y/36,glyph:'·:+*#'[Math.floor(random()*5)]});
  }
  let w=0,h=0,raf=0,last=0,yaw=0,tilt=.08,vx=0,vy=0,hover=-1,active=-1,phase:Phase='idle',start=0,opacity=1;
  let mx=.5,my=.5,pointerX=0,pointerY=0,pointerInside=false,cursorX=0,cursorY=0,pitchParallax=0,down=false,drag=0,lx=0,ly=0,elapsed=0,parallax=0,swing=0,swingV=0;
  let origin={x:0,y:0},orb={x:0,y:0},trail:{x:number;y:number}[]=[];
  let positions:(Point&{s:number})[]=[],hitboxes:{x:number;y:number;width:number;height:number}[]=[];
  const hoverLevels=new Float32Array(nodes.length),finePointer=matchMedia("(pointer:fine)").matches;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Reference entrance branches: <=820px reverse-pfdive; desktop staggered 3D motion.
  const narrowEntry=window.innerWidth<=820;
  const smoothRange=(value:number,start:number,span:number)=>{const x=clamp((value-start)/span);return x*x*x*(x*(6*x-15)+10)};
  const reverseLocal=new Float32Array(nodes.length+stars.length);reverseLocal.fill(1);
  let introPlaybackRate=entranceRate;
  let introStart:number|null=null,introDone=reduced,introVisible=false,introElapsed=0;
  let entryProgress=reduced?1:0,entryOpacity=reduced?1:0,entryCamera=reduced?1:0,releaseAt=-1,entryRaw=0;
  const labelOrder=Array.from({length:outerCount},(_,i)=>i);
  for(let i=labelOrder.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[labelOrder[i],labelOrder[j]]=[labelOrder[j],labelOrder[i]]}
  const visibility=new IntersectionObserver(entries=>{introVisible=entries[0].isIntersecting;if(introVisible&&introStart===null)introStart=performance.now()},{threshold:.25});
  visibility.observe(host);
  // Independent 3D springs start across the full line; edges follow their endpoints.
  const motions=[...nodes,...stars].map((_,i)=>{const fx=random()*2-1;return {fx,fy:(random()-.5)*2.4,x:0,y:0,z:0,vx:0,vy:0,vz:0,k:.014+random()*.02,damping:.875+random()*.045,delay:Math.abs(fx)*95+random()*75,kick:i<nodes.length?8+random()*9:11+random()*15,jx:(random()-.5)*7,jy:(random()-.5)*7,jz:(random()-.5)*7,frameRemainder:0,ready:false,kicked:false}});
  const resize=()=>{w=host.clientWidth;h=host.clientHeight;const d=Math.min(devicePixelRatio,2);canvas.width=w*d;canvas.height=h*d;ctx.setTransform(d,0,0,d,0,0)};
  const ro=new ResizeObserver(resize);ro.observe(host);resize();
  const enter=(p:Phase,now:number)=>{phase=p;start=now};
  open.current=i=>{
   if(i<0||i>=thoughts.length)return;
   if(phase==='read'){active=i;setSelected(i);return}
   if(phase!=='idle')return;
   if(lampScene.current){lampScene.current.style.transform='none';lampScene.current.style.clipPath='none';lampScene.current.style.opacity='1';lampScene.current.inert=false}
   introDone=true;entryProgress=entryOpacity=entryCamera=1;active=i;origin=positions[i]||{x:w/2,y:h/2};orb={...origin};trail=[];setSelected(i);setLit(true);
   enter(reduced?'read':'pop',performance.now());if(reduced)setReading(true);
  };
  close.current=()=>{if(phase==='idle'||phase==='return')return;trail=[];pause.current=false;setPaused(false);if(lampScene.current)lampScene.current.inert=true;host.classList.remove('lamp-pointer-active');enter('return',performance.now());if(reduced){setReading(false);phase='idle';active=-1;setSelected(-1);opacity=1;if(lampScene.current)lampScene.current.style.opacity='0'}};
  const hit=(x:number,y:number)=>{
   let nearest=-1,distance=65;
   positions.forEach((p,i)=>{if(i>=outerCount)return;const d=Math.hypot(x-p.x,y-p.y);if(d<distance){distance=d;nearest=i}});
   hitboxes.forEach((p,i)=>{if(x>=p.x-6&&x<=p.x+p.width+6&&y>=p.y-6&&y<=p.y+p.height+6)nearest=i});return nearest;
  };
  const move=(e:PointerEvent)=>{const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;mx=x/w;my=y/h;pointerX=x;pointerY=y;if(!pointerInside){cursorX=x;cursorY=y}pointerInside=e.pointerType!=='touch';if(down&&phase==='idle'&&introDone){const dx=e.clientX-lx,dy=e.clientY-ly;drag+=Math.hypot(dx,dy);if(drag>7){yaw+=dx*.0032;tilt+=dy*.0028;vx=dx*.0011;vy=dy*.0009}lx=e.clientX;ly=e.clientY}hover=phase==='idle'&&introDone&&drag<7?hit(x,y):-1;canvas.style.cursor=finePointer&&!reduced&&phase==='idle'?'none':down?'grabbing':hover>=0?'pointer':'grab'};
  const pointerDown=(e:PointerEvent)=>{if(e.button!==0)return;move(e);down=true;vx=0;vy=0;drag=0;lx=e.clientX;ly=e.clientY;canvas.setPointerCapture(e.pointerId)};
  const pointerUp=(e:PointerEvent)=>{move(e);down=false;if(drag<7&&hover>=0)open.current(hover);drag=0};
  const cancel=()=>{down=false;hover=-1;pointerInside=false;mx=my=.5;drag=0;canvas.style.cursor='grab'};
  host.addEventListener('pointermove',move);canvas.addEventListener('pointerdown',pointerDown);canvas.addEventListener('pointerup',pointerUp);canvas.addEventListener('pointercancel',cancel);host.addEventListener('pointerleave',cancel);window.addEventListener('blur',cancel);window.addEventListener('scroll',cancel,true);document.addEventListener('visibilitychange',cancel);
  const draw=(now:number)=>{
   const dt=Math.min(40,now-(last||now));last=now;const step=dt/16.67;
   if(!pause.current&&!reduced)elapsed+=dt*(introDone?1:introPlaybackRate);
   if(phase==='idle'&&!down&&!reduced){yaw+=(vx+(!pause.current?.0004:0))*step*(introDone?1:introPlaybackRate);tilt+=vy*step;vx*=Math.pow(.93,step);vy*=Math.pow(.93,step)}tilt=Math.max(-.55,Math.min(.55,tilt));
   const entryRunning=!introDone&&introStart!==null&&introVisible&&!pause.current;
   if(entryRunning){
    introElapsed+=dt*introPlaybackRate;
    if(narrowEntry){
     entryProgress=entryOpacity=entryCamera=1;
     if(introElapsed>=920)introDone=true;
    }else{
     const progress=1-Math.pow(1-clamp((introElapsed-200)/1150),3);entryRaw=progress;
     if(releaseAt<0&&progress>.045)releaseAt=introElapsed;
     entryProgress=mix(entryProgress,progress,1-Math.pow(.915,step*introPlaybackRate));
     entryOpacity=mix(entryOpacity,releaseAt>=0?1:0,1-Math.pow(.94,step*introPlaybackRate));
     const cameraProgress=clamp((entryProgress-.1)/.72);
     const cameraTarget=cameraProgress<.5?2*cameraProgress*cameraProgress:-1+(4-2*cameraProgress)*cameraProgress;
     entryCamera=mix(entryCamera,cameraTarget,1-Math.pow(.93,step*introPlaybackRate));
     if(introElapsed>=3400&&motions.every((m,i)=>{const p=i<nodes.length?nodes[i]:stars[i-nodes.length];return Math.hypot(m.x-p.x,m.y-p.y,m.z-p.z)<.001&&Math.hypot(m.vx,m.vy,m.vz)<.001})){introDone=true;entryProgress=entryOpacity=entryCamera=1}
    }
   }

   const releaseAge=releaseAt<0?-1:introElapsed-releaseAt;
   const t=elapsed*.001,age=now-start,scale=Math.min(w*.30,h*.30);
   ctx.clearRect(0,0,w,h);opacity=mix(opacity,phase==='idle'?1:phase==='pop'?.8:0,reduced?1:.06*step);
   if(captureLayer.current){
    const alpha=phase==='return'?0:opacity*entryOpacity;
    captureLayer.current.style.opacity=String(alpha);
    captureLayer.current.style.visibility=alpha<.01?'hidden':'visible';
    captureLayer.current.inert=phase!=='idle'||!introDone;
   }
   parallax=mix(parallax,reduced?0:(mx-.5)*.3,1-Math.pow(.92,step));pitchParallax=mix(pitchParallax,reduced?0:(my-.5)*.22,1-Math.pow(.92,step));
   const spin=(yaw+parallax)*entryOpacity,pitch=(tilt+pitchParallax)*entryOpacity;
   const project=(p:Point)=>{const x=p.x*Math.cos(spin)+p.z*Math.sin(spin),z0=-p.x*Math.sin(spin)+p.z*Math.cos(spin),y=p.y*Math.cos(pitch)-z0*Math.sin(pitch),z=p.y*Math.sin(pitch)+z0*Math.cos(pitch),s=2.92/(2.92-.32*entryCamera-z);return{x:w*.5+x*scale*s,y:h*.50+y*scale*s,z,s}};
   const movingPoint=(target:Point,i:number)=>{
    if(introDone||narrowEntry)return target;
    const m=motions[i],unit=Math.max(scale,1);
    if(!m.ready){m.x=m.fx*Math.min(w*.27,560)/unit;m.y=m.fy/unit;m.ready=true}
    if(entryRunning){
     const released=releaseAge>m.delay,tension=releaseAt<0?clamp((entryRaw-.012)/(.045-.012)):0;
     const goal=released?target:{x:(m.fx*Math.min(w*.27,560)+Math.sin(introElapsed*.047+m.fy*53)*tension*1.5)/unit,y:(m.fy*(1+tension*2)+Math.sin(introElapsed*.061+m.fx*47)*tension*2.2)/unit,z:0};
     if(released&&!m.kicked){const dx=goal.x-m.x,dy=goal.y-m.y,dz=goal.z-m.z,d=Math.hypot(dx,dy,dz)||1;m.vx+=(dx/d*m.kick+m.jx)/unit;m.vy+=(dy/d*m.kick+m.jy)/unit;m.vz+=(dz/d*m.kick+m.jz)/unit;m.kicked=true}
     m.frameRemainder+=step*introPlaybackRate;
     while(m.frameRemainder>=1){m.vx=(m.vx+(goal.x-m.x)*m.k)*m.damping;m.vy=(m.vy+(goal.y-m.y)*m.k)*m.damping;m.vz=(m.vz+(goal.z-m.z)*m.k)*m.damping;m.x+=m.vx;m.y+=m.vy;m.z+=m.vz;m.frameRemainder-=1}
    }
    return{x:m.x,y:m.y,z:m.z};
   };
   const entryProject=(target:Point,i:number)=>{
    const p=project(movingPoint(target,i));reverseLocal[i]=1;
    if(narrowEntry&&!introDone){
     const m=motions[i],dust=i>=nodes.length,directionZ=target.z/(Math.hypot(target.x,target.y,target.z)||1);
     const hash=Math.abs(Math.sin((m.fx+1.7)*53.3+(m.fy+2.3)*97.1+directionZ*11));
     const delay=(.5*hash+.5*Math.min(1,Math.abs(m.fx)))*(dust?.04:.018);
     const local=1-Math.pow(1-clamp((introElapsed/920-delay)/(dust?.19:.15)),3);
     reverseLocal[i]=local;
     p.x=mix(w/2+(p.x-w/2)*.42,p.x,local);p.y=mix(h/2,p.y,local);
    }
    return p;
   };
   positions=nodes.map(entryProject);
   // ponytail: reuse existing graph anchors; generate dedicated positions if captures exceed node count.
   captureRef.current.forEach((capture,i)=>{const button=captureButtons.current[capture.id],p=positions[positions.length-1-i%positions.length];if(button&&p)button.style.transform=`translate(${p.x}px,${p.y}px)`});
   hover=phase==='idle'&&introDone&&pointerInside&&drag<7?hit(pointerX,pointerY):-1;
   let focus=0;hoverLevels.forEach((value,i)=>{hoverLevels[i]=mix(value,i===hover?1:0,reduced?1:1-Math.pow(.82,step));focus=Math.max(focus,hoverLevels[i])});
   const relatedGlow=(i:number)=>edges.reduce((value,e)=>e.a===i?Math.max(value,hoverLevels[e.b]):e.b===i?Math.max(value,hoverLevels[e.a]):value,0);

   if(!introDone){
    const length=Math.min(w*.54,1120),fade=narrowEntry?Math.pow(1-clamp((introElapsed/920-.015)/.245),2):releaseAt<0?1:1-clamp(releaseAge/160);
    ctx.save();ctx.globalAlpha=opacity*fade;ctx.strokeStyle='#fff';ctx.lineWidth=1.6;ctx.shadowColor='rgba(255,255,255,.9)';ctx.shadowBlur=6;ctx.beginPath();ctx.moveTo(w/2-length/2,h*.5);ctx.lineTo(w/2+length/2,h*.5);ctx.stroke();ctx.restore();
   }
   ctx.globalAlpha=opacity;
   stars.forEach((star,i)=>{const p=entryProject(star,nodes.length+i),alpha=mix(.8,star.alpha*clamp((p.s-.32)/.55),entryOpacity)*(narrowEntry&&!introDone?smoothRange(reverseLocal[nodes.length+i],.1,.8):1);ctx.fillStyle=`rgba(255,255,255,${alpha})`;const radius=Math.min(4,star.size*p.s)*.5;if(radius<.9){const side=Math.max(.8,radius*1.6);ctx.fillRect(p.x-side/2,p.y-side/2,side,side)}else{ctx.beginPath();ctx.arc(p.x,p.y,radius,0,Math.PI*2);ctx.fill()}});
   edges.forEach(({a,b,base,delay})=>{
    const p=positions[a],q=positions[b],hot=Math.max(hoverLevels[a],hoverLevels[b]);
    const growth=narrowEntry&&!introDone?smoothRange(Math.min(reverseLocal[a],reverseLocal[b]),.04,.82):1;
    const reveal=clamp((entryProgress-(.2+delay*.36))/.09)*entryOpacity,depth=clamp(((p.s+q.s)/2-.4)/.6);
    const returnEmphasis=narrowEntry&&!introDone?1+1.8*clamp((1-introElapsed/920)/.45):1;
    const alpha=base*reveal*growth*returnEmphasis*(.35+.65*depth)*(1-.5*focus)*(a<outerCount||b<outerCount?1.22:.78);
    if(alpha<.004)return;
    const from=reverseLocal[a]<=reverseLocal[b]?p:q,to=from===p?q:p;
    ctx.strokeStyle=`rgba(255,255,255,${alpha})`;ctx.lineWidth=.55;ctx.beginPath();ctx.moveTo(from.x,from.y);ctx.lineTo(mix(from.x,to.x,growth),mix(from.y,to.y,growth));ctx.stroke();
    if(hot){ctx.save();ctx.strokeStyle=`rgba(255,255,255,${.62*hot})`;ctx.lineWidth=.9;ctx.shadowColor='rgba(255,255,255,.6)';ctx.shadowBlur=5*hot;ctx.stroke();ctx.restore()}
   });
   positions.forEach((p,i)=>{if((active===i&&phase!=='idle')||(i>=outerCount&&i<thoughts.length))return;ctx.fillStyle=`rgba(231,241,236,${mix(.85,(i<outerCount?.55+.4*clamp((p.s-.4)/.7):.3+.5*clamp((p.s-.4)/.7)),entryOpacity)*(narrowEntry&&!introDone?clamp(reverseLocal[i]*2.4):1)})`;const radius=Math.min(4.5,pointSizes[i]*p.s)*.5*(1+.45*hoverLevels[i]+.3*relatedGlow(i));if(radius<.9){const side=Math.max(.9,radius*1.6);ctx.fillRect(p.x-side/2,p.y-side/2,side,side)}else{ctx.beginPath();ctx.arc(p.x,p.y,radius,0,Math.PI*2);ctx.fill()}});
   hitboxes=[];
   thoughts.forEach((n,i)=>{
    const labelAlpha=clamp((entryProgress-(.4+(labelOrder[i]??i)*.036))/.06)*entryOpacity*(narrowEntry&&!introDone?smoothRange(introElapsed/920,.58,.34):1);
    const p=positions[i],hot=hoverLevels[i];
    if(!n.outer){hitboxes[i]={x:p.x-5,y:p.y-5,width:10,height:10};ctx.fillStyle=hot?'#fff':`rgba(212,228,218,${mix(.85,.3+.5*clamp((p.s-.4)/.7),entryOpacity)*(narrowEntry&&!introDone?clamp(reverseLocal[i]*2.4):1)})`;const radius=Math.min(4.5,pointSizes[i]*p.s)*.5*(1+.45*hot);if(radius<.9){const side=Math.max(.9,radius*1.6);ctx.fillRect(p.x-side/2,p.y-side/2,side,side)}else{ctx.beginPath();ctx.arc(p.x,p.y,radius,0,Math.PI*2);ctx.fill()}return}
    const size=Math.max(10,Math.min(w<600?21:27,(w<600?12:16)*p.s));ctx.font=`${size}px "Huiwen Mincho",serif`;const width=ctx.measureText(n.title).width,x=Math.min(w-width-16,Math.max(16,p.x+9)),y=p.y;
    hitboxes[i]={x:Math.min(x,p.x),y:y-size,width:width+12,height:size+8};ctx.fillStyle=`rgba(232,240,235,${clamp(.43+p.z*.4)*(1-.45*focus*(1-hot))*(.55+.45*hot)})`;if(active!==i||phase==='idle'){ctx.save();ctx.globalAlpha*=labelAlpha;ctx.shadowColor="rgba(255,255,255,.8)";ctx.shadowBlur=10*hot;ctx.fillText(n.title,x,y+size*.25);ctx.restore();}if(hot>.02){ctx.strokeStyle=`rgba(255,255,255,${.75*hot})`;ctx.lineWidth=1;ctx.beginPath();ctx.arc(p.x,p.y,6.5+2.5*hot+Math.sin(now*.004)*1.2,0,Math.PI*2);ctx.stroke()}
   });
   ctx.globalAlpha=1;
   if(pointerInside&&finePointer&&!reduced&&phase==='idle'){
    const follow=1-Math.pow(.62,step);cursorX+=(pointerX-cursorX)*follow;cursorY+=(pointerY-cursorY)*follow;
    ctx.save();ctx.fillStyle='#fff';ctx.strokeStyle='rgba(255,255,255,.85)';ctx.lineWidth=1;
    ctx.beginPath();ctx.arc(pointerX,pointerY,1.5,0,Math.PI*2);ctx.fill();
    const radius=down?5:9;
    if(hover>=0)ctx.strokeRect(cursorX-radius,cursorY-radius,radius*2,radius*2);
    else{ctx.beginPath();for(let i=0;i<4;i++){const a=i*Math.PI/2;ctx.moveTo(cursorX+Math.cos(a)*radius,cursorY+Math.sin(a)*radius);ctx.lineTo(cursorX+Math.cos(a)*(radius+4),cursorY+Math.sin(a)*(radius+4))}ctx.stroke()}
    ctx.restore();
   }
   const center={x:w/2,y:h*.46},floor=h*.79,bulbY=h*.03+105;
   let radius=4,showOrb=false;
   if(phase==='pop'){const f=clamp(age/290);orb={x:origin.x,y:origin.y};radius=4+8*Math.sin(f*Math.PI*.7);showOrb=true;ctx.strokeStyle=`rgba(255,255,255,${1-f})`;ctx.beginPath();ctx.arc(orb.x,orb.y,8+f*48,0,Math.PI*2);ctx.stroke();if(f===1)enter('fly',now)}
   else if(phase==='fly'){const f=ease(age/520);orb={x:mix(origin.x,center.x,f),y:mix(origin.y,center.y,f)-Math.sin(f*Math.PI)*h*.1};radius=10;showOrb=true;if(f===1)enter('fall',now)}
   else if(phase==='fall'){const f=clamp(age/620);orb={x:center.x,y:mix(center.y,floor,f*f*f)};radius=9;showOrb=true;if(f===1){trail=[];enter('scatter',now)}}
   else if(phase==='scatter'){const f=clamp(age/850);sparks.forEach(p=>{const x=center.x+Math.cos(p.a)*p.r*w*.4*f,y=floor-Math.abs(Math.sin(p.a))*p.v*h*.5*Math.sin(f*Math.PI*.75);ctx.fillStyle=`rgba(232,241,235,${1-f*.85})`;ctx.font='11px monospace';ctx.fillText(p.glyph,x,y)});if(f===1)enter('rise',now)}
   else if(phase==='gather'){const f=ease(age/950);figure.forEach((p,i)=>{const r=sparks[i%sparks.length],x=mix(center.x+Math.cos(r.a)*r.r*w*.4,center.x+p.x*190,f),y=mix(floor-Math.abs(Math.sin(r.a))*r.v*h*.3,h*.37+p.y*h*.38,f);ctx.fillStyle=`rgba(230,238,228,${.2+.65*f})`;ctx.font='10px monospace';ctx.fillText(p.glyph,x,y)});if(f===1)enter('rise',now)}
   else if(phase==='rise'){const f=ease(age/520);figure.forEach(p=>{ctx.fillStyle=`rgba(230,238,228,${(1-f)*.7})`;ctx.font='10px monospace';ctx.fillText(p.glyph,center.x+p.x*190,h*.37+p.y*h*.38)});orb={x:center.x,y:mix(floor,bulbY,f)};radius=6;showOrb=true;if(f===1)enter('light',now)}
   else if(phase==='light'){orb={x:center.x,y:bulbY};if(age>560){enter('read',now);setReading(true)}}
   else if(phase==='return'){
    const fold=ease(age/850),seal=ease((age-780)/70);opacity=0;
    if(lampScene.current){lampScene.current.style.clipPath=`inset(${fold*49.9}% 0)`;lampScene.current.style.opacity=String(1-seal);}
    ctx.save();ctx.globalAlpha=seal;ctx.strokeStyle='#fff';ctx.lineWidth=1.6;ctx.shadowColor='rgba(255,255,255,.9)';ctx.shadowBlur=6;ctx.beginPath();const lineLength=mix(w,Math.min(w*.54,1120),ease((age-850)/200));ctx.moveTo(w/2-lineLength/2,h*.5);ctx.lineTo(w/2+lineLength/2,h*.5);ctx.stroke();ctx.restore();
    if(age>=1050){
     setReading(false);setSelected(-1);active=-1;trail=[];hover=-1;hoverLevels.fill(0);
     introPlaybackRate=1;introDone=false;introStart=now;introElapsed=0;entryProgress=entryOpacity=entryCamera=entryRaw=0;releaseAt=-1;
     motions.forEach(m=>{m.x=m.y=m.z=m.vx=m.vy=m.vz=m.frameRemainder=0;m.ready=m.kicked=false});
     opacity=1;enter('idle',now);
    }
   }
   if(showOrb){trail.push({...orb});if(trail.length>22)trail.shift();trail.forEach((p,i)=>{ctx.fillStyle=`rgba(245,248,235,${i/trail.length*.4})`;ctx.beginPath();ctx.arc(p.x,p.y,Math.max(.5,radius*i/trail.length*.55),0,Math.PI*2);ctx.fill()});ctx.shadowColor='#efffe9';ctx.shadowBlur=15;ctx.fillStyle='#fbfff3';ctx.beginPath();ctx.arc(orb.x,orb.y,radius,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0}
   const lampVisible=['light','read','return'].includes(phase),lightAlpha=phase==='return'?1:phase==='light'?(Math.sin(age*.04)>-.2?clamp(age/560):.12):phase==='read'&&light.current?1:0;
   if(phase!=='return'){swingV+=((reduced?0:(mx-.5)*9)-swing)*.035*step;swingV*=Math.pow(.86,step);swing+=swingV*step;}
   if(lamp.current){lamp.current.style.opacity=lampVisible?'1':'0';lamp.current.style.pointerEvents=phase==='read'?'auto':'none';lamp.current.style.transform=`translateX(-50%) rotate(${swing}deg) scale(1.5)`}
   const lampAngle=swing*Math.PI/180,bulbDx=-105*Math.sin(lampAngle),bulbDy=105*Math.cos(lampAngle)-105;
   if(phase==='read')orb={x:w/2+bulbDx,y:bulbY+bulbDy};
   if(cordRig.current)cordRig.current.style.transform=`rotate(${swing}deg)`;
   if(beam.current){beam.current.style.opacity=String(lightAlpha);beam.current.style.transform=`translate(${bulbDx}px,${bulbDy}px) rotate(${swing}deg)`}
   if(beam.current&&litContent.current){
    const cone=beam.current,ax=cone.offsetLeft+cone.offsetWidth/2+bulbDx,ay=cone.offsetTop+bulbDy;
    const angle=lampAngle,c=Math.cos(angle),s=Math.sin(angle);
    const project=(x:number,y:number)=>`${ax+x*c-y*s}px ${ay+x*s+y*c}px`;
    litContent.current.style.clipPath=`polygon(${project(0,0)},${project(cone.offsetWidth/2,cone.offsetHeight)},${project(-cone.offsetWidth/2,cone.offsetHeight)})`;
   }
   if(falloff.current&&litContent.current&&beam.current){
    const shade=falloff.current.style,cone=beam.current;
    shade.clipPath=litContent.current.style.clipPath;shade.opacity=String(lightAlpha);
    shade.setProperty('--light-x',`${cone.offsetLeft+cone.offsetWidth/2+bulbDx}px`);
    shade.setProperty('--light-y',`${cone.offsetTop+bulbDy}px`);
    // Keep the clear inner circle through the first note row, then feather its outer shadow.
    shade.setProperty('--light-radius',`${Math.hypot(w*.40,h*.38)}px`);
    shade.setProperty('--light-feather',`${h*.28}px`);
    const tail=host.parentElement?.querySelector<HTMLElement>('.network-tail');
    if(tail){tail.style.setProperty('--light-x',`${cone.offsetLeft+cone.offsetWidth/2+bulbDx}px`);tail.style.setProperty('--light-y',`${cone.offsetTop+bulbDy-h}px`);tail.style.setProperty('--light-radius',`${Math.hypot(w*.40,h*.38)}px`);tail.style.setProperty('--light-feather',`${h*.28}px`)}
   }
   if(reader.current)reader.current.style.filter=light.current?'none':'brightness(.22)';
   raf=requestAnimationFrame(draw);
  };raf=requestAnimationFrame(draw);
  return()=>{cancelAnimationFrame(raf);ro.disconnect();visibility.disconnect();host.removeEventListener('pointermove',move);canvas.removeEventListener('pointerdown',pointerDown);canvas.removeEventListener('pointerup',pointerUp);canvas.removeEventListener('pointercancel',cancel);host.removeEventListener('pointerleave',cancel);window.removeEventListener('blur',cancel);window.removeEventListener('scroll',cancel,true);document.removeEventListener('visibilitychange',cancel);open.current=()=>{};close.current=()=>{}};
 },[thoughts,entranceRate,entranceReplay]);
 const cordStart=useRef(0);
 const current=thoughts[selected];
 const cluster=current?.outer?current:thoughts[current?.parent??-1];
 return <><div className={`thought-network${reading&&lit?' is-reading':''}`}><div className="network-top"><span>念头之间</span><div><button onClick={()=>{const next=!demoStars;setDemoStars(next);if(captureOpen?.id.startsWith("demo-letter-star-"))setCaptureOpen(null);try{localStorage.setItem("glean-demo-stars",next?"on":"off")}catch{}}}>{demoStars?"清除演示星星":"添加演示星星"}</button>{!reading&&<><button onClick={()=>{setSelected(-1);setPaused(false);setEntranceReplay(n=>n+1);stage.current?.scrollIntoView({block:"center",behavior:"instant"})}}>重播展开</button><button aria-label="切换展开播放速度" onClick={()=>{setSelected(-1);setPaused(false);setEntranceRate(v=>v===1?.01:1);stage.current?.scrollIntoView({block:"center",behavior:"instant"})}}>{entranceRate===1?'原速':'100 倍慢放'}</button></>}<button onClick={()=>setPaused(v=>!v)}>{paused?'继续流动':'暂停流动'}</button></div></div>
 <div className="network-tags" aria-label="选择念头">{thoughts.map((n,i)=>n.outer?<button key={n.id} aria-pressed={cluster?.id===n.id} onClick={()=>open.current(i)}>{n.title}</button>:null)}</div>
 <div className="network-stage" ref={stage}>
 <div ref={captureLayer} className="captured-stars-layer" style={{position:"absolute",inset:0,pointerEvents:"none",opacity:0}}>{!reading&&visibleCaptures.map(capture=>captureOpacity(capture.createdAt,captureTime)>0?<button className="captured-star" key={capture.id} ref={el=>{captureButtons.current[capture.id]=el}} data-capture-id={capture.id} style={{pointerEvents:'auto',visibility:pendingId===capture.id?'hidden':'visible',opacity:captureOpacity(capture.createdAt,captureTime)}} aria-label={`查看收集的念头：${capture.text.slice(0,30)||'图片'}`} onClick={()=>setCaptureOpen(capture)}>✦</button>:null)}</div>
 <canvas ref={canvasRef} aria-label="立体念头网络，拖动旋转或使用上方按钮选择"/>
 <div className="lamp-scene" ref={lampScene}><div className="thought-beam" ref={beam}/>
 <button className="thought-lamp" ref={lamp} onClick={()=>close.current()} aria-label="熄灯并返回念头网络" aria-hidden={!reading} tabIndex={reading?0:-1}><span className="lamp-wire"/><span className="lamp-shade"/><span className="lamp-bulb"/></button>
 {reading&&<div className="lamp-cord-rig" ref={cordRig}><button className="lamp-cord" aria-label="拉绳关灯并返回网络" onPointerDown={e=>{cordStart.current=e.clientY;e.currentTarget.setPointerCapture(e.pointerId)}} onPointerMove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.style.setProperty('--cord-pull',`${Math.min(45,Math.max(0,e.clientY-cordStart.current))}px`)}} onPointerCancel={e=>{e.currentTarget.style.setProperty('--cord-pull','0px')}} onPointerUp={e=>{e.currentTarget.style.setProperty('--cord-pull','0px')}} onClick={()=>close.current()}><span className="cord-knob"/></button></div>}
 <div className="lamp-content-clip" ref={litContent}><AnimatePresence mode="wait">{reading&&selected>=0&&<motion.article ref={reader} className="thought-reader" key={thoughts[selected].id} initial={{opacity:0,y:reduce?0:18,filter:'blur(6px)'}} animate={{opacity:1,y:0,filter:'blur(0px)'}} exit={{opacity:0,y:reduce?0:-15}} transition={{duration:reduce?0:.45}} aria-live="polite">
 <p className="reader-introduction" lang="en">{clusterIntroductions[cluster?.title]??'A collection of thoughts, connected by a shared curiosity.'}</p>
 <div className="reader-related" aria-label="二级标签">{cluster&&<button aria-pressed={current.outer} onClick={()=>open.current(thoughts.indexOf(cluster))}>全部</button>}{cluster?.related.map(i=><button key={i} aria-pressed={selected===i} onClick={()=>open.current(i)}>{thoughts[i].title}</button>)}</div>
 <StickyNotes key={current.id} records={archive.filter(r=>current.recordIds?.includes(r.id))}/>
 <button className="reader-back" onClick={()=>close.current()}>← 返回网络</button>
 </motion.article>}</AnimatePresence></div>
 <AnimatePresence>{reading&&cluster&&<LampTypography key={cluster.id} title={cluster.title} lit={lit} stage={stage} beam={beam}/>}</AnimatePresence>
 <div className="lamp-distance-falloff" ref={falloff} aria-hidden="true"/></div>
 {selected<0&&<span className="network-hint">{error?'本地记录未加载':thoughts.length?'拖动探索 · 点击念头':'正在拾起念头…'}</span>}
 </div><div className="network-tail"><div className="network-footnote">{archive.length} 条示例内容 · {archive.filter(r=>!r.themes.length).length} 条未归类{captures.length>0&&` · ${captures.length} 条本机收藏`}</div></div></div>{captureOpen&&<CaptureDetail capture={captureOpen} onClose={()=>setCaptureOpen(null)}/>}</>
}
