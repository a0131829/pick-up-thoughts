export type Capture={id:string;text:string;images:Blob[];createdAt:string};
// Fade by elapsed wall-clock time, including time spent with the page closed.
export function captureOpacity(createdAt:string,now=Date.now()):number{
 const created=Date.parse(createdAt);
 if(!Number.isFinite(created))return 1;
 return Math.max(0,Math.min(1,1-(now-created)/(7*24*60*60*1000)));
}
function openDB():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const request=indexedDB.open('glean-public-demo-captures',1);request.onupgradeneeded=()=>request.result.createObjectStore('captures',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
export async function capturesStore(value?:Capture):Promise<Capture[]>{
 const db=await openDB();
 return new Promise((resolve,reject)=>{const tx=db.transaction('captures',value?'readwrite':'readonly'),store=tx.objectStore('captures');let result:Capture[]=[];
 if(value)store.put(value);else{const req=store.getAll();req.onsuccess=()=>{result=req.result}}
 tx.oncomplete=()=>{db.close();resolve(result)};tx.onerror=tx.onabort=()=>{db.close();reject(tx.error??new Error('保存失败'))};
 });
}
