import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {RectAreaLightUniformsLib} from 'three/addons/lights/RectAreaLightUniformsLib.js';
import './wave-gallery-demo.css';
export type WaveWork={id:string;title:string;creator:string;cover?:string};
function artwork(work:WaveWork,alive:()=>boolean){
 const c=document.createElement('canvas');c.width=1024;c.height=800;const g=c.getContext('2d')!;const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;
 const paint=(img?:HTMLImageElement)=>{
  if(!alive())return;
  const ratio=img?img.naturalWidth/img.naturalHeight:2/3;
  // Reallocate the GPU texture when the loaded image changes its dimensions.
  texture.dispose();
  c.height=1024;c.width=Math.max(1,Math.round(c.height*ratio));
  texture.userData.aspect=ratio;
  if(img)g.drawImage(img,0,0,c.width,c.height);
  else{g.fillStyle='#282c32';g.fillRect(0,0,c.width,c.height);g.fillStyle='#b9bec7';g.font='38px "Huiwen Mincho",serif';g.fillText(work.title,30,c.height/2,c.width-60)}
  texture.needsUpdate=true;
 };
 paint();if(work.cover){const img=new Image();img.crossOrigin='anonymous';img.onload=()=>paint(img);img.onerror=()=>paint();img.src=work.cover}return texture;
}
export function WaveGallery({works,onSelect}:{works:WaveWork[];onSelect:(work:WaveWork)=>void}){const host=useRef<HTMLDivElement>(null),pausedRef=useRef(false);const [paused,setPaused]=useState(false),[failed,setFailed]=useState(false);const selectRef=useRef(onSelect);selectRef.current=onSelect;pausedRef.current=paused;
 useEffect(()=>{const el=host.current!;if(!works.length)return;let alive=true;setFailed(false);let renderer:THREE.WebGLRenderer;try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true})}catch{setFailed(true);return}renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor('#08090b',0);el.appendChild(renderer.domElement);const scene=new THREE.Scene();scene.fog=new THREE.Fog('#08090b',7,15);const camera=new THREE.PerspectiveCamera(35,1,.1,60);camera.position.set(0,.55,6.8);camera.lookAt(0,0,-1);scene.add(new THREE.HemisphereLight(0xffffff,0x777777,1.6));
 // Broad softboxes reflect across the curved covers instead of a sharp point glint.
 RectAreaLightUniformsLib.init();
 const key=new THREE.RectAreaLight(0xfff5eb,5,3,10);key.position.set(-3,2,5);key.lookAt(0,0,0);scene.add(key);
 const rim=new THREE.RectAreaLight(0xe9f0ff,3,2,8);rim.position.set(5,1,3);rim.lookAt(0,0,0);scene.add(rim);
 const textures=works.map(w=>artwork(w,()=>alive));const cards=Array.from({length:works.length},(_,i)=>{const geo=new THREE.PlaneGeometry(3.55,2.85,48,14);const mesh=new THREE.Mesh(geo,new THREE.MeshPhysicalMaterial({map:textures[i],transparent:true,roughness:.38,metalness:0,sheen:.65,sheenColor:new THREE.Color(0xfff8ef),sheenRoughness:.45,clearcoat:.8,clearcoatRoughness:.3,side:THREE.DoubleSide}));mesh.userData.index=i;scene.add(mesh);return mesh});let offset=0,velocity=0,dragging=false,lastX=0,distance=0,raf=0,last=performance.now(),visible=true;const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;const gap=.12;
 const resize=()=>{renderer.setSize(el.clientWidth,el.clientHeight);camera.aspect=el.clientWidth/el.clientHeight;camera.updateProjectionMatrix()};const ro=new ResizeObserver(resize);ro.observe(el);resize();const io=new IntersectionObserver(e=>visible=e[0].isIntersecting);io.observe(el);
 const down=(e:PointerEvent)=>{dragging=true;distance=0;lastX=e.clientX;velocity=0;el.setPointerCapture(e.pointerId)};const move=(e:PointerEvent)=>{if(!dragging)return;const dx=e.clientX-lastX;distance+=Math.abs(dx);velocity=-dx*.006;offset+=velocity;lastX=e.clientX};const ray=new THREE.Raycaster();const up=(e:PointerEvent)=>{dragging=false;if(el.hasPointerCapture(e.pointerId))el.releasePointerCapture(e.pointerId);if(distance<6){const r=el.getBoundingClientRect();ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2),camera);const hit=ray.intersectObjects(cards.filter(m=>m.visible))[0];if(hit)selectRef.current(works[hit.object.userData.index])}};const cancel=()=>{dragging=false;velocity=0};
 el.addEventListener('pointerdown',down);el.addEventListener('pointermove',move);el.addEventListener('pointerup',up);el.addEventListener('pointercancel',cancel);
 const draw=(now:number)=>{const dt=Math.min((now-last)/1000,.05);last=now;if(visible){if(!dragging&&!pausedRef.current&&!reduced){offset+=dt*.3+velocity*dt*60;velocity*=Math.pow(.94,dt*60)}const widths=cards.map(m=>2.85*textures[m.userData.index].userData.aspect);
 const total=widths.reduce((sum,w)=>sum+w+gap,0);let edge=-widths[0]/2;
 cards.forEach((mesh,i)=>{const width=widths[i];const center=((edge+width/2-offset+total/2)%total+total)%total-total/2;edge+=width+gap;mesh.visible=Math.abs(center)<15;if(!mesh.visible)return;const pos=mesh.geometry.attributes.position;for(let j=0;j<pos.count;j++){const col=j%49,row=Math.floor(j/49),x=center+(col/48-.5)*width;pos.setXYZ(j,x,(.5-row/14)*2.85+.17*Math.sin(x*.55),1.35*Math.sin(x*.55)-.026*x*x)}pos.needsUpdate=true;mesh.geometry.computeVertexNormals();mesh.geometry.computeBoundingSphere()});renderer.render(scene,camera)}raf=requestAnimationFrame(draw)};raf=requestAnimationFrame(draw);return()=>{alive=false;cancelAnimationFrame(raf);ro.disconnect();io.disconnect();el.removeEventListener('pointerdown',down);el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',up);el.removeEventListener('pointercancel',cancel);cards.forEach(m=>{m.geometry.dispose();m.material.dispose()});textures.forEach(t=>t.dispose());renderer.dispose();renderer.domElement.remove()}
 },[works]);
 return <div className="gallery-wave"><div ref={host} className="wave-demo-stage" aria-label="可拖动的三维收藏画廊"/>{failed&&<p>当前设备无法显示三维画廊，请使用下方作品列表。</p>}<div className="gallery-wave-actions"><span>拖动探索 · 点击封面查看</span><button onClick={()=>setPaused(v=>!v)}>{paused?'继续流动':'暂停流动'}</button><select aria-label="选择 Gallery 作品" value="" onChange={e=>{const work=works.find(w=>w.id===e.target.value);if(work)onSelect(work)}}><option value="">选择作品…</option>{works.map(w=><option key={w.id} value={w.id}>{w.title}</option>)}</select></div></div>
}
