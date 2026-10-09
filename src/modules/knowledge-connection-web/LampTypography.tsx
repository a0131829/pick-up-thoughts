import {useEffect,useId,useRef} from 'react';
import type {RefObject} from 'react';
import {motion,useReducedMotion} from 'framer-motion';

export function LampTypography({title,lit,stage,beam}:{title:string;lit:boolean;stage:RefObject<HTMLDivElement|null>;beam:RefObject<HTMLDivElement|null>}){
 const id=useId().replace(/:/g,''),svg=useRef<SVGSVGElement>(null),hole=useRef<SVGCircleElement>(null),reveal=useRef<SVGCircleElement>(null),cursor=useRef<HTMLDivElement>(null),dot=useRef<HTMLDivElement>(null),trail=useRef<HTMLDivElement>(null);
 const reduce=useReducedMotion();
 useEffect(()=>{
  const host=stage.current,cone=beam.current,root=cursor.current;
  if(!host||!cone||!root||!lit||!matchMedia('(pointer:fine)').matches||reduce)return;
  let x=0,y=0,tx=0,ty=0,mx=0,my=0,radius=0,targetRadius=0,active=false,first=true,raf=0,last=0;
  const hide=()=>{active=false;targetRadius=0;root.style.opacity='0';host.classList.remove('lamp-pointer-active')};
  const move=(e:PointerEvent)=>{
   const box=host.getBoundingClientRect(),px=e.clientX-box.left,py=e.clientY-box.top;
   // Test the actual rotated triangle, not its rectangular bounding box.
   const apexX=cone.offsetLeft+cone.offsetWidth/2,apexY=cone.offsetTop;
   const inverse=new DOMMatrix(getComputedStyle(cone).transform).inverse();
   const p=new DOMPoint(px-apexX,py-apexY).matrixTransform(inverse);
   const inside=px>=0&&px<=box.width&&py>=0&&py<=box.height&&p.y>=0&&p.y<=cone.offsetHeight&&Math.abs(p.x)<=p.y*cone.offsetWidth/(2*cone.offsetHeight);
   if(!inside||e.pointerType==='touch'){hide();return}
   active=true;host.classList.add('lamp-pointer-active');root.style.opacity='1';x=px;y=py;
   if(first){tx=x;ty=y;first=false}
   dot.current!.style.transform=`translate(${x}px,${y}px)`;
   const target=e.target as Element;
   root.dataset.state=target.closest('input,textarea,[contenteditable="true"]')?'text':target.closest('button,a,summary,label')?'interactive':'';
   const matrix=svg.current?.getScreenCTM();
   if(matrix){const local=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse());mx=local.x;my=local.y;const width=title.length*150;targetRadius=local.x>-60&&local.x<width+60&&local.y>-60&&local.y<240?130/matrix.a:0}
  };
  const down=()=>{if(active)root.classList.add('is-pressed')},up=()=>root.classList.remove('is-pressed');
  const frame=(now:number)=>{const dt=Math.min(50,now-last||16.7);last=now;const follow=1-Math.pow(.62,dt/16.7);tx+=(x-tx)*follow;ty+=(y-ty)*follow;trail.current!.style.transform=`translate(${tx}px,${ty}px)`;radius+=(targetRadius-radius)*(1-Math.exp(-dt/65));for(const c of [hole.current,reveal.current])if(c){c.setAttribute('cx',String(mx));c.setAttribute('cy',String(my));c.setAttribute('r',String(radius))}raf=requestAnimationFrame(frame)};
  window.addEventListener('pointermove',move);window.addEventListener('pointerdown',down);window.addEventListener('pointerup',up);window.addEventListener('scroll',hide,true);window.addEventListener('blur',hide);document.documentElement.addEventListener('pointerleave',hide);raf=requestAnimationFrame(frame);
  return()=>{cancelAnimationFrame(raf);hide();for(const c of [hole.current,reveal.current])c?.setAttribute('r','0');window.removeEventListener('pointermove',move);window.removeEventListener('pointerdown',down);window.removeEventListener('pointerup',up);window.removeEventListener('scroll',hide,true);window.removeEventListener('blur',hide);document.documentElement.removeEventListener('pointerleave',hide)};
 },[lit,title,reduce,stage,beam]);
 const width=title.length*150;
 return <><motion.div className="reader-cluster-backdrop" key={title} initial={{opacity:0,y:reduce?0:90,skewX:reduce?0:-6}} animate={{opacity:lit?1:.18,y:0,skewX:0}} exit={{opacity:0,y:reduce?0:90}} transition={{duration:reduce?0:.55,ease:[.22,1,.36,1]}}><svg ref={svg} viewBox={`0 0 ${width} 180`} role="img" aria-label={title}>
 <defs><radialGradient id={`${id}-fade`}><stop offset="78%" stopColor="black"/><stop offset="100%" stopColor="white"/></radialGradient><mask id={`${id}-solid`} maskUnits="userSpaceOnUse" x="0" y="0" width={width} height="180"><rect width={width} height="180" fill="white"/><circle ref={hole} r="0" fill={`url(#${id}-fade)`}/></mask><clipPath id={`${id}-outline`}><circle ref={reveal} r="0"/></clipPath></defs>
 <text x="0" y="152" textLength={width} lengthAdjust="spacingAndGlyphs" mask={`url(#${id}-solid)`}>{title}</text><text className="cluster-outline" x="0" y="152" textLength={width} lengthAdjust="spacingAndGlyphs" clipPath={`url(#${id}-outline)`} aria-hidden="true">{title}</text>
 </svg></motion.div><div ref={cursor} className="lamp-cursor" aria-hidden="true"><div ref={dot} className="lamp-cursor-dot"/><div ref={trail} className="lamp-cursor-trail"><i/><i/><i/><i/><b/></div></div></>;
}
