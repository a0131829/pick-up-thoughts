import {useEffect,useRef} from 'react';
import './capture-flight.css';
export function envelopePose(age:number){
 const smooth=(n:number)=>{const p=Math.max(0,Math.min(1,n));return p*p*(3-2*p)};
 return {insert:smooth(age/650),fold:smooth((age-750)/400),seal:smooth((age-1150)/150)};
}
export function CaptureFlight({id,from,onDone}:{id:string;from:{x:number;y:number};onDone:()=>void}){
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const el=ref.current!,start=performance.now(),scrollFrom=window.scrollY,reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const star=document.querySelector<HTMLElement>(`[data-capture-id="${id}"]`),stage=document.querySelector('.network-stage');
  if(!star||!stage){onDone();return}
  const area=stage.getBoundingClientRect(),scrollTo=Math.max(0,Math.min(document.documentElement.scrollHeight-window.innerHeight,area.top+scrollFrom+area.height*.5-window.innerHeight*.5));
  let raf=0,packed=false;
  const draw=(now:number)=>{
   const age=now-start,p=Math.max(0,Math.min(1,(age-1300)/4200)),ease=p*p*(3-2*p);
   // Read geometry before scrolling/writing styles: avoid a forced second layout every frame.
   const target=star.getBoundingClientRect(),nextScroll=reduced?scrollTo:scrollFrom+(scrollTo-scrollFrom)*ease;
   const tx=target.left+target.width/2,ty=target.top+target.height/2-(nextScroll-window.scrollY);
   if(reduced||p>0)window.scrollTo({top:nextScroll,behavior:'instant'});
   const leaf=Math.sin(p*Math.PI*5)*Math.sin(p*Math.PI)*Math.min(150,window.innerWidth*.16);
   const x=from.x+(tx-from.x)*ease+leaf,y=from.y+(ty-from.y)*ease+Math.sin(p*Math.PI)*80;
   const scale=1-.95*ease,rotation=Math.sin(p*Math.PI*5)*28*Math.sin(p*Math.PI);
   el.style.transform=`translate3d(${x}px,${y}px,0) rotate(${rotation}deg) scale(${scale})`;
   if(!packed){
   const pose=envelopePose(age);
   el.style.setProperty('--insert',String(pose.insert));
   el.style.setProperty('--fold',String(pose.fold));
   el.style.setProperty('--seal',String(pose.seal));
   el.style.setProperty('--flap-layer',pose.fold>0?'4':'1');
   packed=age>=1300;
   }
   el.style.setProperty('--star',String(Math.max(0,(p-.8)/.2)));
   if(reduced||p===1){onDone();return}raf=requestAnimationFrame(draw);
  };raf=requestAnimationFrame(draw);return()=>cancelAnimationFrame(raf);
 },[id]);
 return <div ref={ref} className="capture-flight" aria-hidden="true"><div className="capture-envelope"><span className="envelope-pocket"><span className="envelope-paper"/></span><span className="envelope-front"/><span className="envelope-flap"/><span className="envelope-seal"/></div><span className="flight-star">✦</span></div>;
}
