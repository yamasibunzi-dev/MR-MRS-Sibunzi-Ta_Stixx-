/* store.js - shared by index.html (invitation) and checkers/index.html
   Every RSVP is one record with a status:
   pending -> accepted -> (removed)    or    pending -> declined

   TWO MODES:
   1. ONLINE  - when firebase-config.js has your real Firebase keys. Works between different phones/computers.
   2. TEST    - when there are no keys yet. The invitation and Checkers pass the list to each other
                through THIS browser only (so you can try everything). Nobody else's phone can send to it.
   If something is wrong, the reason is saved in window.StoreError. */
(function(){
  /* ---------- TEST MODE (this browser only) ---------- */
  function localStore(){
    const K='sibunzi_rsvps_local', subs=[];
    const bc=('BroadcastChannel' in window)?new BroadcastChannel('sibunzi_rsvps'):null;
    const read=()=>{try{return JSON.parse(localStorage.getItem(K))||[]}catch(e){return[]}};
    const write=a=>{try{localStorage.setItem(K,JSON.stringify(a))}catch(e){}};
    const fire=()=>subs.forEach(f=>f());
    const changed=()=>{fire();if(bc)bc.postMessage('x')};
    window.addEventListener('storage',e=>{if(e.key===K)fire()});
    if(bc)bc.onmessage=fire;
    return {
      async submit(r){const a=read();a.push({id:'l'+Date.now()+Math.random().toString(36).slice(2,6),name:r.name,side:r.side,phone:r.phone||'',status:'pending',reason:'',t:Date.now()});write(a);changed()},
      watchAttendees(cb){const f=()=>cb(read().filter(x=>x.status==='accepted').sort((a,b)=>a.t-b.t).map(x=>({name:x.name,side:x.side})));subs.push(f);f()},
      watchAll(cb){const f=()=>cb(read().sort((a,b)=>a.t-b.t));subs.push(f);f()},
      async setStatus(id,status,reason){const a=read();const x=a.find(y=>y.id===id);if(x){x.status=status;x.reason=reason||''}write(a);changed()}
    };
  }

  /* ---------- ONLINE MODE (Firebase) ---------- */
  function onlineStore(){
    if(!window.firebase) throw new Error('The Firebase scripts did not load (check the internet connection)');
    if(!firebase.apps.length){
      let cfg = window.firebaseConfig || window.FIREBASE_CONFIG;
      if(!cfg){ try{ cfg = firebaseConfig }catch(e){} }      /* firebase-config.js using: const firebaseConfig = {...} */
      if(!cfg){ try{ cfg = FIREBASE_CONFIG }catch(e){} }
      if(!cfg) throw new Error('firebase-config.js was not found, or it has no Firebase keys in it');
      if(String(cfg.apiKey||'').indexOf('PASTE')===0) throw new Error('firebase-config.js still has the PASTE-... placeholders');
      firebase.initializeApp(cfg);
    }
    const col = firebase.firestore().collection('rsvps');
    const stamp = () => firebase.firestore.FieldValue.serverTimestamp();
    let ready = Promise.resolve();
    try{ if(firebase.auth && !firebase.auth().currentUser) ready = firebase.auth().signInAnonymously().catch(e=>{window.StoreError='Anonymous sign-in failed: '+e.message}); }catch(e){}
    const toRow = d => {
      const x = d.data();
      return Object.assign({id:d.id}, x, {t: x.createdAt && x.createdAt.toMillis ? x.createdAt.toMillis() : Date.now()});
    };
    return {
      async submit(r){
        await ready;
        return col.add({name:r.name, side:r.side, phone:r.phone||'', status:'pending', reason:'', createdAt:stamp()});
      },
      watchAttendees(cb, err){
        ready.then(()=>col.where('status','==','accepted').onSnapshot(
          s=>cb(s.docs.map(toRow).sort((a,b)=>a.t-b.t).map(x=>({name:x.name, side:x.side}))), err));
      },
      watchAll(cb, err){
        ready.then(()=>col.onSnapshot(s=>cb(s.docs.map(toRow).sort((a,b)=>a.t-b.t)), err));
      },
      async setStatus(id, status, reason){
        await ready;
        return col.doc(id).update({status, reason:reason||'', decidedAt:stamp()});
      }
    };
  }

  try{ window.Store=onlineStore(); window.StoreMode='online'; }
  catch(e){
    window.StoreError=e.message; window.StoreMode='local';
    console.warn('store.js: Firebase not connected ('+e.message+') - using TEST MODE');
    window.Store=localStore();
  }
})();
