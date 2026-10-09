import {WaveGallery} from './WaveGallery';
import {useEffect,useMemo,useRef,useState} from 'react';
import './gallery.css';
type Work={id:string;title:string;creator:string;kind:string;status:string;cover?:string;quote?:string;text:string;excerpts:{id:string;text:string}[]};
const kinds:Record<string,string>={book:'图书',movie:'电影',tv:'剧集',music:'音乐',game:'游戏'};
export function Gallery(){
 const [works,setWorks]=useState<Work[]>([]),[kind,setKind]=useState('all'),[query,setQuery]=useState(''),[selected,setSelected]=useState<Work|null>(null),[error,setError]=useState(false);const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const ac=new AbortController();fetch('/local/gallery.json',{signal:ac.signal}).then(r=>{if(!r.ok)throw Error();return r.json()}).then(setWorks).catch(e=>{if(e.name!=='AbortError')setError(true)});return()=>ac.abort()},[]);
 const visible=useMemo(()=>works.filter(w=>(kind==='all'||w.kind===kind)&&(!query||[w.title,w.creator].join(' ').toLowerCase().includes(query.toLowerCase()))),[works,kind,query]);
 return <><div className="gallery-heading"><p>书、影像、音乐与游戏。收藏作品，也留下它们在你身上的回响。</p><span>{works.length} 部作品</span></div><div className="gallery-controls"><div>{['all',...Object.keys(kinds)].map(k=><button key={k} aria-pressed={kind===k} onClick={()=>setKind(k)}>{k==='all'?'全部':kinds[k]}</button>)}</div><input aria-label="搜索 Gallery 作品" placeholder="找一本书，或一位作者…" value={query} onChange={e=>setQuery(e.target.value)}/></div>
 {error?<p>Gallery 暂未加载，请刷新本地内容。</p>:<WaveGallery works={visible} onSelect={w=>{const full=works.find(item=>item.id===w.id);if(full){setSelected(full);dialog.current?.showModal()}}}/>}{!error&&works.length>0&&!visible.length&&<p>这里暂时没有匹配的作品。</p>}
 <dialog ref={dialog} className="gallery-dialog" onClick={e=>{if(e.target===e.currentTarget)dialog.current?.close()}}><button className="gallery-close" onClick={()=>dialog.current?.close()} aria-label="关闭作品详情">关闭 ×</button>{selected&&<article>{selected.cover&&<img className="gallery-detail-cover" src={selected.cover} alt={selected.title+'封面'}/>}<small>{kinds[selected.kind]}</small><h2>{selected.title}</h2><p>{selected.creator}</p><div className="gallery-original">{selected.text}</div>{selected.quote&&<blockquote>{selected.quote}</blockquote>}{selected.excerpts.length>0&&<><h3>留下的句子</h3>{selected.excerpts.map(e=><blockquote key={e.id}>{e.text}</blockquote>)}</>}</article>}</dialog></>;
}
