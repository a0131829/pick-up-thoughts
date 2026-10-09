import {useRef,useState} from 'react';
import type {CSSProperties} from 'react';
import type {ArchiveRecord} from '../../shared/types';
import './sticky-notes.css';

// Original CSS paper treatment; archive text stays read-only and unmodified.
export function StickyNotes({records}:{records:ArchiveRecord[]}){
 const [selected,setSelected]=useState<ArchiveRecord|null>(null),[limit,setLimit]=useState(12);
 const dialog=useRef<HTMLDialogElement>(null);
 return <><div className="sticky-grid">{records.slice(0,limit).map((note,i)=><button className="paper-note" key={note.id} style={{'--paper-angle':`${[-1.3,.8,-.6,1.1][i%4]}deg`,'--tape-angle':`${[-27,24,-22,29][i%4]}deg`,'--paper-color':['#eee2b9','#e9dfc5','#e5e1c8','#eedac1'][i%4]} as CSSProperties} onClick={()=>{setSelected(note);dialog.current?.showModal()}} aria-label={`阅读笔记：${note.text.slice(0,28)||'图片内容'}`}><span className="paper-tape" aria-hidden="true"/><span className="paper-body">{note.text||(note.image?<img src={note.image} alt="笔记图片" loading="lazy"/>:'此条记录没有文字正文。')}</span></button>)}</div>{records.length>limit&&<button className="sticky-more" onClick={()=>setLimit(n=>n+12)}>继续展开 ↓</button>}{!records.length&&<p className="sticky-empty">这里还没有留下笔记。</p>}
 <dialog ref={dialog} className="paper-dialog" onKeyDown={e=>e.stopPropagation()} onClick={e=>{if(e.target===e.currentTarget)dialog.current?.close()}}><button className="paper-close" aria-label="关闭笔记" onClick={()=>dialog.current?.close()}>×</button>{selected&&<div className="paper-fulltext">{selected.image&&<img src={selected.image} alt="笔记图片"/>}{selected.text||'此条记录没有文字正文。'}</div>}</dialog></>;
}
