const DATABASE_NAME='swarm-web-original-assets';
const DATABASE_VERSION=1;
const STORE_NAME='presentations';
const CACHE_KEY='original-v1';

function openDatabase(){
  if(!globalThis.indexedDB)throw new Error('This browser does not support persistent asset storage.');
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DATABASE_NAME,DATABASE_VERSION);
    request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE_NAME))request.result.createObjectStore(STORE_NAME);};
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error??new Error('Unable to open browser asset storage.'));
  });
}

async function runTransaction(mode,operation){
  const database=await openDatabase();
  try{
    return await new Promise((resolve,reject)=>{
      const transaction=database.transaction(STORE_NAME,mode),request=operation(transaction.objectStore(STORE_NAME));
      let result;
      request.onsuccess=()=>{result=request.result;};
      request.onerror=()=>reject(request.error??new Error('Browser asset storage failed.'));
      transaction.oncomplete=()=>resolve(result);
      transaction.onerror=()=>reject(transaction.error??new Error('Browser asset storage failed.'));
      transaction.onabort=()=>reject(transaction.error??new Error('Browser asset storage was interrupted.'));
    });
  }finally{database.close();}
}

export async function cacheOriginalAssets(payload){
  await runTransaction('readwrite',store=>store.put({...payload,version:1},CACHE_KEY));
}

export async function hasCachedOriginalAssets(){
  return (await runTransaction('readonly',store=>store.count(CACHE_KEY)))>0;
}

export async function readCachedOriginalAssets(){
  const payload=await runTransaction('readonly',store=>store.get(CACHE_KEY));
  if(payload?.version!==1||!Array.isArray(payload.levels)||!payload.strings||!payload.images||!payload.sounds)throw new Error('The cached original assets are incomplete.');
  return payload;
}

export async function clearCachedOriginalAssets(){
  await runTransaction('readwrite',store=>store.delete(CACHE_KEY));
}
