const GOOGLE_CLIENT_ID='241983913188-o679465gj48clfjvnheepelf2s8083he.apps.googleusercontent.com';
const SHEETS_SCOPE='https://www.googleapis.com/auth/spreadsheets';
const SHEET_HEADERS=['id','title','domain','priority','status','owner','deadline','createdAt','lastUpdated','nextFollowUp','followUpType','reminderSent','blocker','nextAction','notes','agentPriority','agentReason','agentNextAction','agentReviewedAt'];
const DELETED_STORAGE='executiveMasterTasks.deleted.v1';
let googleTokenClient=null;
let googleAccessToken='';
let googleTokenExpiresAt=0;

function syncStatus(text,kind=''){
  const el=document.getElementById('googleSyncStatus');
  if(!el)return;
  el.textContent=text;
  el.dataset.kind=kind;
}
function deletedIds(){try{return new Set(JSON.parse(localStorage.getItem(DELETED_STORAGE)||'[]'))}catch{return new Set()}}
function saveDeleted(set){localStorage.setItem(DELETED_STORAGE,JSON.stringify([...set]))}
function normalizeDate(v){
  if(!v)return '';
  const d=new Date(v);
  return Number.isNaN(d.getTime())?String(v):d.toISOString();
}
function rowToTask(headers,row){
  const o={}; headers.forEach((h,i)=>o[h]=row[i]??'');
  return {
    id:String(o.id||'').trim(), title:o.title||'', domain:o.domain||'', priority:o.priority||'בינונית', status:o.status||'חדש',
    owner:o.owner||'', deadline:o.deadline||'', createdAt:o.createdAt||'', lastUpdated:normalizeDate(o.lastUpdated)||new Date(0).toISOString(),
    nextFollowUp:o.nextFollowUp||'', followUpType:o.followUpType||'', reminderSent:o.reminderSent||'', blocker:o.blocker||'',
    nextAction:o.nextAction||'', notes:o.notes||'', agentPriority:o.agentPriority||'', agentReason:o.agentReason||'',
    agentNextAction:o.agentNextAction||'', agentReviewedAt:o.agentReviewedAt||'', _dirty:false
  };
}
function taskToRow(t){return SHEET_HEADERS.map(h=>t[h]??'')}
function persistLocal(){localStorage.setItem(STORAGE,JSON.stringify(tasks));render()}

function initGoogleClient(){
  if(!window.google?.accounts?.oauth2){syncStatus('Google Identity עדיין נטען…');return false}
  googleTokenClient=google.accounts.oauth2.initTokenClient({
    client_id:GOOGLE_CLIENT_ID,
    scope:SHEETS_SCOPE,
    callback:()=>{},
    error_callback:e=>syncStatus('שגיאת התחברות ל-Google: '+(e?.type||'unknown'),'error')
  });
  syncStatus('מוכן לחיבור ל-Google');
  return true;
}
function ensureGoogleToken(){
  return new Promise((resolve,reject)=>{
    if(googleAccessToken && Date.now()<googleTokenExpiresAt-60000){resolve(googleAccessToken);return}
    if(!googleTokenClient && !initGoogleClient()){reject(new Error('Google Identity Services לא נטען'));return}
    googleTokenClient.callback=resp=>{
      if(resp.error){reject(new Error(resp.error));return}
      googleAccessToken=resp.access_token;
      googleTokenExpiresAt=Date.now()+((resp.expires_in||3500)*1000);
      syncStatus('מחובר ל-Google · מוכן לסנכרון','ok');
      resolve(googleAccessToken);
    };
    googleTokenClient.requestAccessToken({prompt:googleAccessToken?'':'consent'});
  });
}
async function sheetsFetch(url,options={}){
  const token=await ensureGoogleToken();
  const res=await fetch(url,{...options,headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json',...(options.headers||{})}});
  if(res.status===401){googleAccessToken='';googleTokenExpiresAt=0;throw new Error('פג תוקף ההרשאה. לחץ שוב על התחברות וסנכרון.')}
  if(!res.ok){let msg='';try{msg=(await res.json())?.error?.message||''}catch{};throw new Error(msg||('Google API '+res.status))}
  return res.status===204?{}:res.json();
}
function sheetBase(){
  const id=document.getElementById('sheetIdInput').value.trim();
  const name=document.getElementById('sheetNameInput').value.trim()||'MasterTasks';
  return {id,name,range:encodeURIComponent("'"+name.replaceAll("'","''")+"'!A:S")};
}
async function readRemoteTasks(){
  const {id,range}=sheetBase();
  const data=await sheetsFetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values/${range}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`);
  const values=data.values||[];
  if(!values.length)return [];
  const headers=values[0].map(String);
  return values.slice(1).filter(r=>String(r[0]||'').trim()).map(r=>rowToTask(headers,r));
}
async function writeRemoteTasks(list){
  const {id,name,range}=sheetBase();
  await sheetsFetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values/${range}:clear`,{method:'POST',body:'{}'});
  const out=[SHEET_HEADERS,...list.map(taskToRow)];
  const start=encodeURIComponent("'"+name.replaceAll("'","''")+"'!A1");
  await sheetsFetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values/${start}?valueInputOption=RAW`,{method:'PUT',body:JSON.stringify({majorDimension:'ROWS',values:out})});
}
async function syncNow(){
  const btn=document.getElementById('syncNowBtn');
  if(btn)btn.disabled=true;
  syncStatus('מסנכרן…');
  try{
    const remote=await readRemoteTasks();
    const deleted=deletedIds();
    const remoteMap=new Map(remote.filter(t=>!deleted.has(t.id)).map(t=>[t.id,t]));
    for(const local of tasks){
      if(deleted.has(local.id))continue;
      const r=remoteMap.get(local.id);
      if(!r){remoteMap.set(local.id,{...local,_dirty:false});continue}
      if(local._dirty){
        remoteMap.set(local.id,{...r,...local,_dirty:false});
      }
    }
    const merged=[...remoteMap.values()].sort((a,b)=>String(a.id).localeCompare(String(b.id),'en'));
    await writeRemoteTasks(merged);
    tasks=merged.map(t=>({...t,_dirty:false}));
    saveDeleted(new Set());
    persistLocal();
    const stamp=new Date().toLocaleString('he-IL',{dateStyle:'short',timeStyle:'short'});
    localStorage.setItem('executiveMasterTasks.lastSync',new Date().toISOString());
    syncStatus(`סונכרנו ${tasks.length} משימות · ${stamp}`,'ok');
  }catch(err){
    console.error(err);
    const m=String(err?.message||err);
    if(m.includes('origin')||m.includes('403')) syncStatus('נדרשת בדיקת OAuth / הרשאות Google: '+m,'error');
    else syncStatus('הסנכרון נכשל: '+m,'error');
  }finally{if(btn)btn.disabled=false}
}
function disconnectGoogle(){
  if(googleAccessToken && window.google?.accounts?.oauth2){
    google.accounts.oauth2.revoke(googleAccessToken,()=>{});
  }
  googleAccessToken='';googleTokenExpiresAt=0;
  syncStatus('מנותק מ-Google');
}

function installDirtyTracking(){
  const form=document.getElementById('taskForm');
  form.onsubmit=e=>{
    e.preventDefault();
    const original=document.getElementById('editTaskIdOriginal').value;
    const previous=tasks.find(t=>t.id===original)||{};
    const now=new Date().toISOString();
    const item={...previous,
      id:document.getElementById('taskId').value.trim(),domain:document.getElementById('taskDomain').value.trim(),title:document.getElementById('taskTitle').value.trim(),
      priority:document.getElementById('taskPriority').value,status:document.getElementById('taskStatus').value,owner:document.getElementById('taskOwner').value.trim(),
      nextFollowUp:document.getElementById('taskFollowup').value,nextAction:document.getElementById('taskNextAction').value.trim(),blocker:document.getElementById('taskBlocker').value.trim(),
      notes:document.getElementById('taskNotes').value.trim(),createdAt:previous.createdAt||now,lastUpdated:now,_dirty:true
    };
    const i=tasks.findIndex(t=>t.id===original);
    if(i>=0)tasks[i]=item;else tasks.push(item);
    if(original && original!==item.id){const d=deletedIds();d.add(original);saveDeleted(d)}
    persistLocal();
    document.getElementById('taskDialog').close();
  };
  document.getElementById('deleteTaskBtn').onclick=()=>{
    const id=document.getElementById('editTaskIdOriginal').value;
    if(id&&confirm('למחוק את '+id+'?')){
      const d=deletedIds();d.add(id);saveDeleted(d);
      tasks=tasks.filter(t=>t.id!==id);persistLocal();document.getElementById('taskDialog').close();
    }
  };
}
function showLastSync(){
  const x=localStorage.getItem('executiveMasterTasks.lastSync');
  if(x)syncStatus('סנכרון אחרון: '+new Date(x).toLocaleString('he-IL',{dateStyle:'short',timeStyle:'short'}));
}
window.addEventListener('load',()=>{
  initGoogleClient();installDirtyTracking();showLastSync();
  document.getElementById('googleConnectBtn').onclick=async()=>{try{await ensureGoogleToken();await syncNow()}catch(e){syncStatus('התחברות נכשלה: '+e.message,'error')}};
  document.getElementById('syncNowBtn').onclick=syncNow;
  document.getElementById('googleDisconnectBtn').onclick=disconnectGoogle;
});