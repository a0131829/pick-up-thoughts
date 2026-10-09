import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import './writing-machine.css';

type PaperImage={image:HTMLImageElement;url:string};
type Mode='typewriter'|'shredder';
type Props={text:string;onText:(text:string)=>void;onAction:(mode:'collect'|'chat',images?:string[])=>void|boolean|Promise<boolean>;status:string;collecting?:boolean;folding?:boolean};


function machineTransition(progress:number){
 const ease=(n:number)=>{const p=Math.max(0,Math.min(1,n));return p*p*(3-2*p)};
 return {withdraw:progress<.5?ease(progress/.3):1-ease((progress-.7)/.3),body:ease((progress-.32)/.34),newPaper:progress>=.5};
}
function fillShredAudio(data:Float32Array,rate:number){
 // Closely overlapping blade strokes sustain the cut without a motor tone.
 data.fill(0);
 const end=Math.min(2.5,data.length/rate-.12);
 const lowAlpha=1-Math.exp(-2*Math.PI*700/rate),highAlpha=1-Math.exp(-2*Math.PI*2800/rate);
 for(let stroke=.05;stroke<end;stroke+=.035+Math.random()*.025){
  for(let blade=0;blade<7;blade++){
   const start=Math.floor((stroke+Math.random()*.055)*rate),duration=.13+Math.random()*.08;
   const count=Math.ceil(duration*rate),strength=.03+Math.random()*.018;
   let low=0,high=0;
   for(let j=0;j<count&&start+j<data.length;j++){
    const p=j/count,n=Math.random()*2-1;
    low+=(n-low)*lowAlpha;high+=(n-high)*highAlpha;
    const envelope=Math.sin(Math.PI*p)**2*Math.exp(-p*1.7);
    data[start+j]+=(high-low)*envelope*strength;
   }
  }
 }
 // Only attenuate exceptional overlaps; never normalize quiet cuts upward.
 let peak=0;for(const sample of data)peak=Math.max(peak,Math.abs(sample));
 if(peak>.15)for(let i=0;i<data.length;i++)data[i]*=.15/peak;
}
function typewriterRows(hasImages:boolean){return hasImages?5:9}
// A fixed crease keeps each side planar instead of waving like fabric.
function paperCrease(y:number,length:number,seed:number){
 const hinge=length*(.08+Math.sin(seed)*.12),angle=Math.sin(seed*1.7)*.22;
 const tail=Math.max(0,y-hinge);
 return {y:y-tail+tail*Math.cos(angle),z:tail*Math.sin(angle)};
}
function paperWind(time:number,index:number,release:number){
 const age=Math.max(0,time-release),phase=index*2.39996;
 // Analytic gravity + linear air drag: acceleration decreases toward terminal speed.
 // Scene-unit calibration keeps the lightweight paper readable at the machine's scale.
 const gravity=4,drag=2.2+Math.cos(phase)*.7,terminal=gravity/drag,v0=.2;
 const decay=Math.exp(-drag*age),fall=terminal*age+(v0-terminal)*(1-decay)/drag;
 const wind=.55+Math.sin(phase)*2.4,horizontalDrag=1.6,launch=Math.sin(phase)*.35;
 const x=wind*age+(launch-wind)*(1-Math.exp(-horizontalDrag*age))/horizontalDrag;
 return {age,x,fall,velocity:terminal+(v0-terminal)*decay,terminal,
  twist:Math.sin(phase+age*2.8)*Math.min(age,1.4)*.7,flip:age*(1.1+Math.cos(phase)*.7),
  alpha:Math.max(0,Math.min(1,(2.9-age)/.75))};
}
function foregroundCover(sw:number,sh:number,back:{width:number;height:number;left:number;top:number},box:{left:number;top:number}){
 const scale=Math.max(back.width/sw,back.height/sh);
 return {x:back.left-box.left+(back.width-sw*scale)/2,y:back.top-box.top+back.height-sh*scale,width:sw*scale,height:sh*scale};
}
function layoutInk(raw:string,caret:number,measure:(c:string)=>number){
 const glyphs:{c:string,x:number,row:number,index:number,width:number}[]=[];
 let x=68,row=0,index=0,cx=68,cr=0;
 for(const c of raw){
  const width=measure(c)+1;
  if(c!=='\n'&&x+width>700){x=68;row++}
  if(index===caret){cx=x;cr=row}
  if(c==='\n'){x=68;row++}else{glyphs.push({c,x,row,index,width});x+=width}
  index+=c.length;
 }
 if(caret>=raw.length){cx=x;cr=row}
 return {glyphs,cx,cr};
}

export function WritingMachine({text,onText,onAction,status,collecting=false,folding=false}:Props){
 const [mode,setMode]=useState<Mode>('typewriter');
 const [vent,setVent]=useState(''),[undo,setUndo]=useState<{text:string;images:PaperImage[]}|null>(null);
 const [shredding,setShredding]=useState(false),[muted,setMuted]=useState(true),[failed,setFailed]=useState(false);
 const [pictures,setPictures]=useState<Record<Mode,PaperImage[]>>({typewriter:[],shredder:[]}),[pasteError,setPasteError]=useState('');
 const pictureRef=useRef(pictures);pictureRef.current=pictures;
 const imageURLs=useRef(new Set<string>()),mounted=useRef(true),loading=useRef(0);
 const collectingRef=useRef(collecting);collectingRef.current=collecting;
 const [switching,setSwitching]=useState(false);
 const [shredMuted,setShredMuted]=useState(false);
 const shredGain=useRef<GainNode|null>(null);
 const grass=useRef<HTMLCanvasElement>(null);
 const host=useRef<HTMLDivElement>(null),input=useRef<HTMLTextAreaElement>(null);
 const modeRef=useRef(mode),strike=useRef(0),shredStart=useRef(0),windSeed=useRef(0);
 const audio=useRef<AudioContext|null>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const foldBytes=useRef<Promise<ArrayBuffer|null>|null>(null);
 useEffect(()=>{foldBytes.current=fetch('/audio/envelope-fold.mp3').then(r=>{if(!r.ok)throw Error('Paper audio unavailable');return r.arrayBuffer()}).catch(()=>null)},[]);
 useEffect(()=>{
  const ac=audio.current;
  if(!folding||!ac||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  let cancelled=false,source:AudioBufferSourceNode|undefined;
  const start=ac.currentTime;
  void (async()=>{
   const bytes=await foldBytes.current;if(!bytes||cancelled)return;
   const buffer=await ac.decodeAudioData(bytes.slice(0));
   const offset=ac.currentTime-start;
   if(cancelled||offset>=buffer.duration)return;
   source=ac.createBufferSource();source.buffer=buffer;source.connect(ac.destination);
   source.onended=()=>source?.disconnect();source.start(0,offset);
  })().catch(()=>{});
  return()=>{cancelled=true;source?.stop();source?.disconnect()};
 },[folding]);
 const reduced=useRef(matchMedia('(prefers-reduced-motion: reduce)').matches);
 modeRef.current=mode;
 const value=mode==='typewriter'?text:vent;
 const textRef=useRef(value),selection=useRef({start:0,end:0}),focused=useRef(false);textRef.current=value;
 const sound=(long=false)=>{
  if(long?shredMuted:muted)return;
  try{
   const ac=audio.current??(audio.current=new AudioContext());void ac.resume();
   if(long){
    const duration=reduced.current?.8:5.6,buffer=ac.createBuffer(1,Math.ceil(ac.sampleRate*duration),ac.sampleRate);
    fillShredAudio(buffer.getChannelData(0),ac.sampleRate);
    const source=ac.createBufferSource(),gain=ac.createGain();source.buffer=buffer;gain.gain.value=.8;
    source.connect(gain);gain.connect(ac.destination);shredGain.current=gain;source.start();
    source.onended=()=>{source.disconnect();gain.disconnect();if(shredGain.current===gain)shredGain.current=null};
    return;
   }
   const length=.045,buffer=ac.createBuffer(1,Math.ceil(ac.sampleRate*length),ac.sampleRate);
   const data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*Math.exp(-i/data.length*5);
   const source=ac.createBufferSource(),filter=ac.createBiquadFilter(),gain=ac.createGain();
   source.buffer=buffer;filter.type='bandpass';filter.frequency.value=1800;gain.gain.value=.08;
   source.connect(filter);filter.connect(gain);gain.connect(ac.destination);source.start();
   source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect()};
  }catch{/* Text entry remains available when audio is unavailable. */}
 };
 // Reuse the unlocked machine context; a soft major-sixth chime marks arrival.
 const starLandedSound=()=>{
  const ac=audio.current;if(!ac||ac.state!=='running')return;
  const start=ac.currentTime;
  [523.25,659.25,880].forEach((frequency,i)=>{
   const tone=ac.createOscillator(),gain=ac.createGain(),t=start+i*.09;
   tone.type='sine';tone.frequency.value=frequency;
   gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(.045-i*.009,t+.025);
   gain.gain.exponentialRampToValueAtTime(.0001,t+1.8);
   tone.connect(gain);gain.connect(ac.destination);tone.start(t);tone.stop(t+1.85);
   tone.onended=()=>{tone.disconnect();gain.disconnect()};
  });
 };
 const typed=(next:string,composing=false)=>{
  if(mode==='typewriter')onText(next);else setVent(next);
  if(!composing){strike.current=performance.now();sound()}
 };
 const pasteImages=async(e:React.ClipboardEvent<HTMLTextAreaElement>)=>{
  const files=Array.from(e.clipboardData.items).filter(item=>item.type.startsWith('image/')).map(item=>item.getAsFile()).filter((file):file is File=>!!file);
  if(!files.length)return;
  e.preventDefault();const destination=mode;setPasteError('正在读取图片…');loading.current++;
  try{
   const added=await Promise.all(files.map(async file=>{
    if(file.size>20*1024*1024)throw new Error('图片过大，请使用 20 MB 以内的图片。');
    const url=URL.createObjectURL(file);imageURLs.current.add(url);
    const image=new Image();
    await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error('图片读取失败，请重新复制图片。'));image.src=url});
    return {image,url};
   }));
   if(mounted.current){setPictures(old=>({...old,[destination]:[...old[destination],...added]}));setPasteError('')}
  }catch(error){if(mounted.current)setPasteError(error instanceof Error?error.message:'图片读取失败。')}
  finally{loading.current--}
 };
 const shred=()=>{
  if((!vent.trim()&&!pictures.shredder.length)||shredding||loading.current)return;
  windSeed.current=Math.random()*1000;setUndo({text:vent,images:pictures.shredder});setShredding(true);shredStart.current=performance.now();sound(true);
  timer.current=setTimeout(()=>{setVent('');setPictures(old=>({...old,shredder:[]}));setShredding(false);timer.current=null},reduced.current?150:5600);
 };
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;if(timer.current)clearTimeout(timer.current);imageURLs.current.forEach(url=>URL.revokeObjectURL(url));void audio.current?.close()}},[]);
 useEffect(()=>{
  const el=host.current!;let alive=true,visible=true,raf=0,last=performance.now(),blend=0,paperFeed=0,lastPaint='',caretX=0,caretY=1,paintedRow=0,paintedColumn=0;
  let transitionStart=-10000,lastTarget=0,paperMode=0,previousPaperMode=0,fromBlend=0,transitionOn=false;
  let renderer:THREE.WebGLRenderer;
  try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:true})}catch{setFailed(true);return}
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setClearColor(0,0);el.appendChild(renderer.domElement);
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-3.2,3.2,3.36,-3.36,.1,20);camera.position.z=10;
  const textures:THREE.Texture[]=[],geometries:THREE.BufferGeometry[]=[],materials:THREE.Material[]=[];
  // Painted layers retain the concept's brushwork; depth and motion are rendered in Three.js.
  const loader=new THREE.TextureLoader();
  const illustrated=(url:string,width:number,height:number,y:number)=>{
   const texture=loader.load(url,t=>{if(!alive){t.dispose();return}t.colorSpace=THREE.SRGBColorSpace},undefined,()=>{if(alive)setFailed(true)});textures.push(texture);
   const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false});materials.push(material);
   const geometry=new THREE.PlaneGeometry(width,height);geometries.push(geometry);
   const mesh=new THREE.Mesh(geometry,material);mesh.position.set(0,y,.2);scene.add(mesh);return mesh;
  };
  const typewriter=illustrated('/machines/typewriter-watercolor.png',5.9,4.41,-.85);
  const shredder=illustrated('/machines/shredder-watercolor.png',4.5,4.5,-.9);
  const paperCanvas=document.createElement('canvas');paperCanvas.width=768;paperCanvas.height=640;
  const g=paperCanvas.getContext('2d')!;
  const stock=document.createElement('canvas');stock.width=768;stock.height=640;
  const pulp=stock.getContext('2d')!;
  // One handmade paper texture, shared by the intact sheet and its cut strips.
  let seed=29;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
  pulp.beginPath();
  for(let x=0;x<=768;x+=4){const y=3+random()*3;x===0?pulp.moveTo(x,y):pulp.lineTo(x,y)}
  pulp.lineTo(765,637);pulp.lineTo(3,637);pulp.closePath();pulp.clip();
  pulp.fillStyle='#e9d8b5';pulp.fillRect(0,0,768,640);
  for(let i=0;i<30000;i++){
   const x=random()*768,y=random()*640;
   pulp.strokeStyle=random()>.5?'#fff8dc50':'#71583c23';pulp.lineWidth=.3+random();
   pulp.beginPath();pulp.moveTo(x,y);pulp.lineTo(x+random()*5,y+random()*2);pulp.stroke();
  }
  const shade=pulp.createLinearGradient(0,0,0,640);
  [[0,'#755d3c60'],[.025,'#fff8dc90'],[.08,'#fff5d800'],[.65,'#59462900'],[.84,'#59462924'],[1,'#30251875']].forEach(([stop,color])=>shade.addColorStop(stop as number,color as string));
  pulp.fillStyle=shade;pulp.fillRect(0,0,768,640);
  const paperTexture=new THREE.CanvasTexture(paperCanvas);paperTexture.colorSpace=THREE.SRGBColorSpace;textures.push(paperTexture);
  renderer.localClippingEnabled=true;
  const paperSlot=new THREE.Plane(new THREE.Vector3(0,1,0),-.52);
  const paperMaterial=new THREE.MeshBasicMaterial({map:paperTexture,side:THREE.DoubleSide,transparent:true,depthWrite:false,vertexColors:true,clippingPlanes:[paperSlot]});materials.push(paperMaterial);
  const paperGeometry=new THREE.PlaneGeometry(1,1,40,40);geometries.push(paperGeometry);
  paperGeometry.setAttribute('color',new THREE.BufferAttribute(new Float32Array(paperGeometry.attributes.position.count*3).fill(1),3));
  const paper=new THREE.Mesh(paperGeometry,paperMaterial);paper.position.z=.1;scene.add(paper);
  const barMaterial=new THREE.MeshBasicMaterial({color:'#96744d',transparent:true,depthWrite:false});materials.push(barMaterial);
  const barGeo=new THREE.PlaneGeometry(.035,1);geometries.push(barGeo);
  const bar=new THREE.Mesh(barGeo,barMaterial);bar.position.z=.4;scene.add(bar);
  const headGeo=new THREE.PlaneGeometry(.13,.08);geometries.push(headGeo);
  const head=new THREE.Mesh(headGeo,barMaterial);head.position.z=.41;scene.add(head);
  const caretGeo=new THREE.PlaneGeometry(.014,.18);geometries.push(caretGeo);
  const caret=new THREE.Mesh(caretGeo,barMaterial);caret.position.z=.3;scene.add(caret);
  const scatterRenderer=new THREE.WebGLRenderer({alpha:true,antialias:true});
  scatterRenderer.setPixelRatio(Math.min(devicePixelRatio,1.5));scatterRenderer.setClearColor(0,0);scatterRenderer.localClippingEnabled=true;
  const scatterCanvas=scatterRenderer.domElement;scatterCanvas.className='paper-wind-overlay';scatterCanvas.setAttribute('aria-hidden','true');document.body.appendChild(scatterCanvas);
  const scatterScene=new THREE.Scene(),scatterCamera=new THREE.OrthographicCamera();scatterCamera.position.z=10;scatterCamera.near=.1;scatterCamera.far=20;
  let scatterWidth=0,scatterHeight=0;
  const stripMat=new THREE.MeshBasicMaterial({map:paperTexture,side:THREE.DoubleSide,transparent:true,depthWrite:false,
   clippingPlanes:[new THREE.Plane(new THREE.Vector3(0,-1,0),-.78)]});materials.push(stripMat);
  const weights=Array.from({length:20},()=>.45+random()*1.3),total=weights.reduce((a,b)=>a+b,0),columns=[0];
  weights.forEach(weight=>columns.push(columns[columns.length-1]+weight/total));
  const cutRows=weights.map(()=>[0,.12+random()*.28,.53+random()*.28,1]);
  const strips=Array.from({length:60},(_,i)=>{
   const column=Math.floor(i/3),row=i%3;
   const cuts=cutRows[column],left=columns[column],right=columns[column+1];
   const low=cuts[row],high=cuts[row+1];
   const geometry=new THREE.PlaneGeometry(1,1,2,12);geometries.push(geometry);
   const uv=geometry.attributes.uv;
   for(let j=0;j<uv.count;j++)uv.setXY(j,left+uv.getX(j)*(right-left),low+uv.getY(j)*(high-low));
   const material=stripMat.clone();materials.push(material);
   const mesh=new THREE.Mesh(geometry,material);mesh.userData={midU:(left+right)/2,low,high,seed:random()*1000};scatterScene.add(mesh);return mesh;
  });
  const paint=()=>{
   const raw=textRef.current,sel=selection.current,images=pictureRef.current[modeRef.current];
   const key=modeRef.current+'|'+raw+'|'+sel.start+'|'+sel.end+'|'+images.map(p=>p.url).join(',');
   if(lastPaint===key)return;lastPaint=key;
   g.clearRect(0,0,768,640);g.drawImage(stock,0,0);
   g.font=(modeRef.current==='typewriter'?'38':'50')+'px "Courier New", "Songti SC", serif';g.textBaseline='alphabetic';
   const {glyphs,cx,cr}=layoutInk(raw,sel.start,c=>g.measureText(c).width);
   paintedRow=cr;paintedColumn=(cx-68)/632;
   const offset=Math.max(0,cr-(modeRef.current==='typewriter'?typewriterRows(images.length>0):2)),base=(modeRef.current==='typewriter'?123:120)+(images.length?190:0);
   if(images.length){
    const columns=Math.min(3,images.length),rows=Math.ceil(images.length/columns),cellWidth=632/columns,cellHeight=180/rows;
    const aspectCorrection=modeRef.current==='typewriter'?768*3.4/(640*3.8):768*3/(640*2.18);
    images.forEach(({image},i)=>{
     const ratio=image.naturalWidth/image.naturalHeight*aspectCorrection;
     const h=Math.min(cellHeight-8,(cellWidth-8)/ratio),w=h*ratio;
     g.drawImage(image,68+(i%columns)*cellWidth+(cellWidth-w)/2,44+Math.floor(i/columns)*cellHeight,w,h);
    });
   }
   for(const glyph of glyphs){
    const y=base+(glyph.row-offset)*48;if(y<40||y>600)continue;
    if(glyph.index>=sel.start&&glyph.index<sel.end){g.fillStyle='#aa946950';g.fillRect(glyph.x,y-30,glyph.width,38)}
    g.fillStyle='#514334';g.fillText(glyph.c,glyph.x,y);
   }
   if(!raw&&!images.length){g.fillStyle='#88785f';g.fillText(modeRef.current==='typewriter'?'留下任何想法…':'把烦恼留在纸上…',68,base)}
   caretX=cx/768-.5;caretY=.5-(base+(cr-offset)*48-10)/640;
   paperTexture.needsUpdate=true;
  };
  // Reuse the live background frame, aligned in page space, so foreground foliage
  // stays in sync with the meadow rather than starting a second video.
  const foreground=grass.current!,fg=foreground.getContext('2d')!;
  const mask=document.createElement('canvas'),mg=mask.getContext('2d')!;
  let lastGrass=0;
  const drawGrass=(now:number)=>{
   if(now-lastGrass<33)return;lastGrass=now;
   const hero=el.closest('.hero')!,video=hero.querySelector('video'),fallback=hero.querySelector('img');
   const source=video&&video.readyState>=2?video:fallback?.complete&&fallback.naturalWidth?fallback:null;
   if(!source)return;
   const box=el.getBoundingClientRect(),back=source.getBoundingClientRect(),w=box.width,h=box.height;
   const ratio=Math.min(devicePixelRatio,2);
   if(foreground.width!==Math.round(w*ratio)||foreground.height!==Math.round(h*ratio)){
    foreground.width=Math.round(w*ratio);foreground.height=Math.round(h*ratio);
    mask.width=foreground.width;mask.height=foreground.height;
   }
   fg.setTransform(ratio,0,0,ratio,0,0);fg.clearRect(0,0,w,h);
   const sw=source instanceof HTMLVideoElement?source.videoWidth:source.naturalWidth,sh=source instanceof HTMLVideoElement?source.videoHeight:source.naturalHeight;
   const crop=foregroundCover(sw,sh,back,box);
   fg.drawImage(source,crop.x,crop.y,crop.width,crop.height);
   const fadeOut=fg.createLinearGradient(0,back.top-box.top,0,back.bottom-box.top);
   fadeOut.addColorStop(0,'#0000');fadeOut.addColorStop(.65,'#0000');fadeOut.addColorStop(1,'#000');
   fg.fillStyle=fadeOut;fg.fillRect(0,0,w,h);
   const shade=fg.createLinearGradient(0,back.top-box.top,0,back.bottom-box.top);
   shade.addColorStop(0,'#08090b55');shade.addColorStop(.6,'#08090b22');shade.addColorStop(1,'#08090b00');
   fg.fillStyle=shade;fg.fillRect(0,0,w,h);
   mg.setTransform(ratio,0,0,ratio,0,0);mg.clearRect(0,0,w,h);
   const foot=h*.96,spread=THREE.MathUtils.lerp(.46,.34,blend);
   const haze=mg.createLinearGradient(0,foot-h*.13,0,foot+h*.035);
   haze.addColorStop(0,'#fff0');haze.addColorStop(.65,'#fffb');haze.addColorStop(1,'#fff');
   mg.fillStyle=haze;mg.fillRect(w*(.5-spread),foot-h*.13,w*spread*2,h*.17);
   // A few fern fronds overlap the lower casing; the keys, paper and controls stay clear.
   mg.fillStyle='#fff';mg.strokeStyle='#fff';
   for(let i=0;i<8;i++){
    const location=[-.94,-.76,-.53,-.25,.23,.48,.73,.95][i];
    const side=location<0?-1:1,root=w*(.5+location*spread);
    const length=h*(.065+Math.abs(location)*.065+(i%3)*.007),lean=side*w*(.018+(i%3)*.011);
    mg.lineWidth=Math.max(1,w*.003);mg.beginPath();mg.moveTo(root,foot);mg.quadraticCurveTo(root+lean*.4,foot-length*.7,root+lean,foot-length);mg.stroke();
    for(let j=1;j<6;j++){
     const t=j/6,cx=root+lean*t,cy=foot-length*t,leaf=w*.027*(1-t*.7);
     for(const sign of [-1,1]){mg.beginPath();mg.moveTo(cx,cy);mg.quadraticCurveTo(cx+sign*leaf,cy-length*.07,cx+sign*leaf,cy-length*.22);mg.quadraticCurveTo(cx+sign*leaf*.2,cy-length*.17,cx,cy);mg.fill()}
    }
   }
   const edgeFade=mg.createLinearGradient(0,h*.92,0,h*.975);edgeFade.addColorStop(0,'#fff');edgeFade.addColorStop(1,'#fff0');
   mg.globalCompositeOperation='destination-in';mg.fillStyle=edgeFade;mg.fillRect(0,0,w,h);mg.globalCompositeOperation='source-over';
   fg.globalCompositeOperation='destination-in';fg.drawImage(mask,0,0,w,h);fg.globalCompositeOperation='source-over';
  };
  const resize=()=>{renderer.setSize(el.clientWidth*2.2,el.clientHeight*2,false);const h=6.4*el.clientHeight/el.clientWidth;camera.left=-3.2*2.2;camera.right=3.2*2.2;camera.top=h*.7;camera.bottom=h*.7-h*2;camera.updateProjectionMatrix()};
  const ro=new ResizeObserver(resize);ro.observe(el);resize();
  const io=new IntersectionObserver(e=>{visible=e[0].isIntersecting});io.observe(el);
  const draw=(now:number)=>{
   const dt=Math.min((now-last)/1000,.05);last=now;
   if(visible||(shredStart.current&&now-shredStart.current<5600)){
    const target=modeRef.current==='shredder'?1:0;
    if(target!==lastTarget){transitionStart=now;previousPaperMode=paperMode;fromBlend=blend;lastTarget=target;transitionOn=true;setSwitching(!reduced.current)}
    const transitionProgress=reduced.current?1:Math.min(1,(now-transitionStart)/1000),animating=transitionProgress<1;
    const transition=machineTransition(transitionProgress);
    blend=THREE.MathUtils.lerp(fromBlend,target,transition.body);
    paperMode=transition.newPaper?target:previousPaperMode;
    if(!animating&&transitionOn){transitionOn=false;setSwitching(false)}
    typewriter.material.opacity=1-blend;shredder.material.opacity=blend;
    typewriter.position.x=-.12*blend;shredder.position.x=.12*(1-blend);
    const age=(now-strike.current)/1000,pulse=!reduced.current&&age<.2?Math.sin(age/.2*Math.PI):0;
    const t=shredStart.current?(now-shredStart.current)/1000:99;
    const active=target===1&&t<5.6&&!reduced.current;
    // Text is baked into the same sheet texture; never animate a DOM text layer separately.
    if(!animating||transition.newPaper)paint();
    const feedTarget=target===0?Math.min(typewriterRows(pictureRef.current.typewriter.length>0)*.255,(paintedRow+paintedColumn)*.255)+(pictureRef.current.typewriter.length?190/640*3.4:0):0;
    if(!animating||transition.newPaper)paperFeed=reduced.current?feedTarget:THREE.MathUtils.damp(paperFeed,feedTarget,6,dt);
    const width=THREE.MathUtils.lerp(3.8,2.18,paperMode),height=THREE.MathUtils.lerp(3.4,3,paperMode);
    const travel=active?Math.min(1,t/2.4)*3.18:0;
    const center=THREE.MathUtils.lerp(-.30,1.14,paperMode)+paperFeed-travel-transition.withdraw*5;
    paperSlot.constant=-THREE.MathUtils.lerp(.52,.64,blend);
    paper.position.x=-.1*paperMode;paper.position.y=center;paper.visible=!collectingRef.current;
    const p=paperGeometry.attributes.position,uv=paperGeometry.attributes.uv;
    for(let i=0;i<p.count;i++){
     const u=uv.getX(i),v=uv.getY(i),curl=Math.pow(v,7),edge=Math.pow(u,10);
     p.setXYZ(i,(u-.5)*width*(1-.035*curl),(v-.5)*height-.18*curl+.018*Math.sin(u*9)*curl,
      -.12+curl*.22-.15*Math.pow(1-v,3)+edge*.28);
     const shade=1-.16*edge-.09*curl;paperGeometry.attributes.color.setXYZ(i,shade,shade,shade);
    }
    p.needsUpdate=true;paperGeometry.attributes.color.needsUpdate=true;
    const cx=caretX*width-.1*paperMode,cy=center+caretY*height;
    caret.visible=!animating&&focused.current&&!collectingRef.current&&!active&&Math.floor(now/550)%2===0;
    caret.position.set(cx,cy,.3);
    typewriter.position.y=-.85-pulse*.008;
    // The carriage tracks the insertion point; the hammer only strokes vertically.
    bar.visible=head.visible=!animating&&blend<.1&&pulse>0&&focused.current&&!collectingRef.current;
    const hammerY=Math.min(1,Math.max(.64,cy))-(1-pulse)*.20;
    // Keep the lower end inside the type basket, even while the paper feeds upward.
    bar.scale.y=hammerY-.02;bar.rotation.z=0;
    bar.position.set(cx,(hammerY+.02)/2,.4);head.position.set(cx,hammerY,.41);
    strips.forEach((strip,i)=>{
     const {midU,low,high,seed:fragmentSeed}=strip.userData;
     // Each uneven segment stays attached until its trailing edge clears the cutter.
     const release=(height*high+.06)/1.325,wind=paperWind(t,fragmentSeed+windSeed.current,release);
     strip.visible=active&&t>.12&&wind.alpha>0;if(!strip.visible)return;
     const pos=strip.geometry.attributes.position,uv=strip.geometry.attributes.uv;
     const fed=Math.min(travel,height*high+.06),mid=(low+high)/2;
     const centerX=(midU-.5)*width-.1+wind.x,centerY=-.78+height*mid-fed-wind.fall;
     const cosine=Math.cos(wind.twist),sine=Math.sin(wind.twist);
     const tumble=wind.age*(.65+Math.sin(fragmentSeed)*.35),ct=Math.cos(tumble),st=Math.sin(tumble);
     for(let j=0;j<pos.count;j++){
      const u=uv.getX(j),v=uv.getY(j);
      const fold=paperCrease((v-mid)*height,(high-low)*height,fragmentSeed);
      const flatX=(u-midU)*width,flatY=fold.y*ct-fold.z*st,z=fold.y*st+fold.z*ct;
      const x=flatX*Math.cos(wind.flip)+z*Math.sin(wind.flip),y=flatY;
      pos.setXYZ(j,centerX+x*cosine-y*sine,centerY+x*sine+y*cosine,
       .35-flatX*Math.sin(wind.flip)+z*Math.cos(wind.flip));
     }
     strip.material.color.setScalar(.72+.28*Math.abs(ct*Math.cos(wind.flip)));
     strip.material.opacity=wind.alpha*Math.min(1,(5.6-t)*5);
     pos.needsUpdate=true;
    });
    renderer.render(scene,camera);drawGrass(now);
    scatterCanvas.style.display=active?'block':'none';
    if(active){
     const box=el.getBoundingClientRect(),unit=6.4/box.width,h=box.height*unit;
     if(scatterWidth!==innerWidth||scatterHeight!==innerHeight){scatterWidth=innerWidth;scatterHeight=innerHeight;scatterRenderer.setSize(scatterWidth,scatterHeight)}
     scatterCamera.left=-3.2-box.left*unit;scatterCamera.right=scatterCamera.left+innerWidth*unit;
     scatterCamera.top=h/2+box.top*unit;scatterCamera.bottom=scatterCamera.top-innerHeight*unit;scatterCamera.updateProjectionMatrix();
     scatterRenderer.render(scatterScene,scatterCamera);
    }
   }else scatterCanvas.style.display='none';
   raf=requestAnimationFrame(draw);
  };raf=requestAnimationFrame(draw);
  return()=>{alive=false;cancelAnimationFrame(raf);ro.disconnect();io.disconnect();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());renderer.dispose();renderer.domElement.remove();scatterRenderer.dispose();scatterCanvas.remove()};
 },[]);
 return <>
  <div className="machine-toggle" role="group" aria-label="书写模式">
   <button className="liquid-glass" aria-pressed={mode==='typewriter'} disabled={shredding||collecting||switching} onClick={()=>setMode('typewriter')}>打字机</button><span>/</span>
   <button className="liquid-glass" aria-pressed={mode==='shredder'} disabled={shredding||collecting||switching} onClick={()=>setMode('shredder')}>碎纸机</button>
  </div>
  <div className={`writing-machine ${mode}${shredding?' is-shredding':''}${failed?' machine-fallback':''}${collecting?' is-collecting':''}`}>
   <div className="machine-stage">
    <div ref={host} className="machine-canvas" aria-hidden="true" onClick={()=>input.current?.focus()}/>
    <canvas ref={grass} className="machine-foreground-grass" aria-hidden="true"/>
    <div className="machine-paper-input"><textarea ref={input} aria-label={mode==='typewriter'?'留下任何想法':'写下想碎掉的话'} placeholder={mode==='typewriter'?'留下任何想法…':'把烦恼留在纸上…'} value={value} disabled={shredding||collecting||switching} spellCheck={false} onPaste={pasteImages} onChange={e=>{selection.current={start:e.target.selectionStart??e.target.value.length,end:e.target.selectionEnd??e.target.value.length};typed(e.target.value,(e.nativeEvent as InputEvent).isComposing)}} onFocus={()=>{focused.current=true}} onBlur={()=>{focused.current=false}} onSelect={e=>{selection.current={start:e.currentTarget.selectionStart,end:e.currentTarget.selectionEnd}}} onCompositionEnd={()=>{strike.current=performance.now();sound()}}/></div>
   </div>
   <div className="machine-actions">{mode==='typewriter'?<><button className="liquid-glass" disabled={collecting||switching} onClick={async()=>{if(loading.current){setPasteError('请等图片读取完成后再收集。');return}try{const ac=audio.current??(audio.current=new AudioContext());void ac.resume().catch(()=>{})}catch{/* Collection also works without audio. */}const ok=await onAction('collect',pictures.typewriter.map(p=>p.url));if(ok){starLandedSound();setPictures(old=>({...old,typewriter:[]}))}}}>收集</button><button className="liquid-glass" disabled={collecting||switching} onClick={()=>onAction('chat',pictures.typewriter.map(p=>p.url))}>AI 交流</button></>:<><button className="liquid-glass" disabled={(!vent.trim()&&!pictures.shredder.length)||shredding||switching} onClick={shred}>{shredding?'正在碎掉…':'碎掉'}</button>{undo!==null&&!shredding&&<button className="liquid-glass" onClick={()=>{setVent(v=>v&&undo.text?v+'\n'+undo.text:v||undo.text);setPictures(old=>({...old,shredder:[...old.shredder,...undo.images]}));setUndo(null);shredStart.current=0}}>撤回碎纸</button>}</>}
    <button className="liquid-glass machine-sound" aria-pressed={!(mode==='shredder'?shredMuted:muted)} onClick={()=>{if(mode==='shredder'){setShredMuted(v=>!v);if(shredGain.current&&audio.current)shredGain.current.gain.setTargetAtTime(shredMuted?.8:0,audio.current.currentTime,.06)}else setMuted(v=>!v)}} aria-label={`${(mode==='shredder'?shredMuted:muted)?'开启':'关闭'}${mode==='shredder'?'碎纸机':'打字机'}音效`}>{(mode==='shredder'?shredMuted:muted)?'音效关':'音效开'}</button>
   </div>
   {pictures[mode].length>0&&<button className="machine-image-clear" disabled={shredding||collecting||switching} onClick={()=>setPictures(old=>({...old,[mode]:[]}))}>移除图片（{pictures[mode].length}）</button>}
   <p className="machine-status" role="status">{pasteError|| (mode==='typewriter'?status:shredding?'让这张纸慢慢离开。':undo!==null?'已碎掉当前草稿，可撤回。':'只碎掉这里写下的话。')}</p>
  </div>
 </>;
}
