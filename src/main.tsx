import {CaptureFlight} from './modules/vintage-typewriter/CaptureFlight';
import {capturesStore,type Capture} from './modules/shared/local-captures';
import {WritingMachine} from './modules/vintage-typewriter/WritingMachine';
import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {motion,useReducedMotion} from 'framer-motion';
import {ArrowUpRight,BookOpen,Layers,MessageCircle,Network,Pause,Play,Sparkles,X} from 'lucide-react';
import './index.css';
import {ThoughtNetwork} from './modules/knowledge-connection-web/ThoughtNetwork';
import {Gallery} from './modules/media-gallery/Gallery';
function Film({index,paused}:{index:number;paused:boolean}){return <div className={`film garden-backdrop garden-${index}${paused?' paused':''}`}><img src="/lake.png" alt=""/><span/></div>}
function Reveal({children,className='',id}:{children:React.ReactNode;className?:string;id?:string}){const reduced=useReducedMotion();return <motion.section id={id} className={className} initial={{opacity:reduced?1:0,y:reduced?0:35}} whileInView={{opacity:1,y:0}} viewport={{once:true,amount:.15}} transition={{duration:.8}}>{children}</motion.section>}
function App(){const reduced=useReducedMotion(),[paused,setPaused]=useState(false);const stop=paused||!!reduced;
 const [thought,setThought]=useState(''),[thoughtStatus,setThoughtStatus]=useState('');
 const [captures,setCaptures]=useState<Capture[]>([]),[flight,setFlight]=useState<{id:string;from:{x:number;y:number}}|null>(null),[collecting,setCollecting]=useState(false);
 const collectionLock=useRef(false),finishCapture=useRef<(ok:boolean)=>void>(()=>{});
 useEffect(()=>{capturesStore().then(saved=>setCaptures(current=>[...saved,...current.filter(c=>!saved.some(s=>s.id===c.id))])).catch(()=>setThoughtStatus('浏览器收藏读取失败，请检查浏览器存储权限。'))},[]);
 const thoughtAction=async(mode:'collect'|'chat',imageURLs:string[]=[])=>{
  if(collectionLock.current)return false;
  if(!thought.trim()&&!imageURLs.length){setThoughtStatus('先写下一点想法或粘贴图片吧。');return false}
  if(mode==='chat'){setThoughtStatus('AI 交流尚未接通，你的内容仍保留在输入区。');return false}
  collectionLock.current=true;setCollecting(true);
  try{
   const images=await Promise.all(imageURLs.map(async url=>{const response=await fetch(url);if(!response.ok)throw Error();return response.blob()}));
   const capture:Capture={id:crypto.randomUUID(),text:thought,images,createdAt:new Date().toISOString()};
   await capturesStore(capture);
   const rect=document.querySelector('.machine-paper-input')!.getBoundingClientRect();
   setCaptures(old=>[...old,capture]);setThoughtStatus('已保存到本机浏览器，正在送往念头网…');
   const done=new Promise<boolean>(resolve=>{finishCapture.current=resolve});
   setFlight({id:capture.id,from:{x:rect.left+rect.width/2,y:rect.top+rect.height/2}});
   return await done;
  }catch{setThoughtStatus('未能保存，文字和图片仍保留。请检查浏览器存储空间。');collectionLock.current=false;setCollecting(false);return false}
 };
 const landed=()=>{setFlight(null);setThought('');setThoughtStatus('已保存为网络中的星星（本机浏览器，尚未同步资料库）。');setCollecting(false);collectionLock.current=false;finishCapture.current(true)};
 return <>{flight&&<CaptureFlight id={flight.id} from={flight.from} onDone={landed}/>}<header id="collect" className="hero"><Film index={2} paused={stop}/><div className="hero-shade"/><nav className="nav" aria-label="主导航"><div className="nav-icons"><a className="liquid-glass icon-button" href="#collect" aria-label="收集念头"><Layers size={20}/></a><a className="liquid-glass icon-button" href="#connect" aria-label="连接想法"><Network size={20}/></a><a className="liquid-glass icon-button" href="#revisit" aria-label="回看阅读"><BookOpen size={20}/></a></div></nav><div className="hero-copy"><WritingMachine text={thought} onText={value=>{setThought(value);setThoughtStatus('')}} onAction={thoughtAction} status={thoughtStatus} collecting={collecting} folding={!!flight}/></div><button className="playback liquid-glass" onClick={()=>setPaused(!paused)} aria-label={stop?'播放背景影像':'暂停背景影像'} disabled={!!reduced}>{stop?<Play size={15}/>:<Pause size={15}/>}</button></header>
 <main>
 <Reveal id="connect" className="wrap philosophy"><ThoughtNetwork captures={captures} pendingId={flight?.id}/></Reveal>
 <Reveal id="revisit" className="wrap services"><Film index={0} paused={stop}/><p className="label gallery-eyebrow">Gallery · 作品收藏</p><Gallery/></Reveal></main><footer className="footer"><a href="#">拾念 <em>glean</em></a><p>让平凡的念头，也有生长的可能。</p></footer>
 </>}
createRoot(document.getElementById('root')!).render(<App/>);
