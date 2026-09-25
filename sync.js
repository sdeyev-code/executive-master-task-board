const GOOGLE_CLIENT_ID='241983913188-hn0dpna5blesr57fr5c6er306jjlj09h.apps.googleusercontent.com';
const SHEETS_SCOPE='https://www.googleapis.com/auth/spreadsheets';
const SHEET_HEADERS=['id','title','domain','priority','status','owner','deadline','createdAt','lastUpdated','nextFollowUp','followUpType','reminderSent','blocker','nextAction','notes','agentPriority','agentReason','agentNextAction','agentReviewedAt'];
const DELETED_STORAGE='executiveMasterTasks.deleted.v1';
const OR_CONTROL_SHEET_ID='1vFl-xuolyOT23_9ecUx6bY5eDUF0jD9Ce_khykMMy0Q';
const OR_CONTROL_DATA_SHEET='נתוני חדרים ושעות';
const FCOT_TARGET_MINUTES=7*60+45;
let googleTokenClient=null;
let googleAccessToken='';
let googleTokenExpiresAt=0;
let orKpiTimer=null;

function syncStatus(text,kind=''){const el=document.getElementById('googleSyncStatus');if(!el)return;el.textContent=text;el.dataset.kind=kind}
function deletedIds(){try{return new Set(JSON.parse(localStorage.getItem(DELETED_STORAGE)||'[]'))}catch{return new Set()}}
function saveDeleted(set){localStorage.setItem(DELETED_STORAGE,JSON.stringify([...set]))}
function normalizeDate(v){if(!v)return '';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toISOString()}
function rowToTask(headers,row){const o={};headers.forEach((h,i)=>o[h]=row[i]??'');return{id:String(o.id||'').trim(),title:o.title||'',domain:o.domain||'',priority:o.priority||'בינונית',status:o.status||'חדש',owner:o.owner||'',deadline:o.deadline||'',createdAt:o.createdAt||'',lastUpdated:normalizeDate(o.lastUpdated)||new Date(0).toISOString(),nextFollowUp:o.nextFollowUp||'',followUpType:o.followUpType||'',reminderSent:o.reminderSent||'',blocker:o.blocker||'',nextAction:o.nextAction||'',notes:o.notes||'',agentPriority:o.agentPriority||'',agentReason:o.agentReason||'',agentNextAction:o.agentNextAction||'',agentReviewedAt:o.agentReviewedAt||'',_dirty:false}}
function taskToRow(t){return SHEET_HEADERS.map(h=>t[h]??'')}
function persistLocal(){localStorage.setItem(STORAGE,JSON.stringify(tasks));render()}

function initGoogleClient(){
 if(!window.google?.accounts?.oauth2){syncStatus('Google Identity עדיין נטען…');return false}
 googleTokenClient=google.accounts.oauth2.initTokenClient({client_id:GOOGLE_CLIENT_ID,scope:SHEETS_SCOPE,callback:()=>{},error_callback:e=>syncStatus('שגיאת התחברות ל-Google: '+(e?.type||'unknown'),'error')});
 syncStatus('מוכן לחיבור ל-Google');return true
}
function ensureGoogleToken(){
 return new Promise((resolve,reject)=>{
  if(googleAccessToken&&Date.now()<googleTokenExpiresAt-60000){resolve(googleAccessToken);return}
  if(!googleTokenClient&&!initGoogleClient()){reject(new Error('Google Identity Services לא נטען'));return}
  googleTokenClient.callback=resp=>{if(resp.error){reject(new Error(resp.error));return}googleAccessToken=resp.access_token;googleTokenExpiresAt=Date.now()+((resp.expires_in||3500)*1000);syncStatus('מחובר ל-Google · מוכן לסנכרון','ok');resolve(googleAccessToken)};
  googleTokenClient.requestAccessToken({prompt:googleAccessToken?'':'consent'})
 })
}
async function sheetsFetch(url,options={}){
 const token=await ensureGoogleToken();
 const res=await fetch(url,{...options,headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json',...(options.headers||{})}});
 if(res.status===401){googleAccessToken='';googleTokenExpiresAt=0;throw new Error('פג תוקף ההרשאה. לחץ שוב על התחברות וסנכרון.')}
 if(!res.ok){let msg='';try{msg=(await res.json())?.error?.message||''}catch{};throw new Error(msg||('Google API '+res.status))}
 return res.status===204?{}:res.json()
}
function sheetBase(){const id=document.getElementById('sheetIdInput').value.trim();const name=document.getElementById('sheetNameInput').value.trim()||'MasterTasks';return{id,name,range:encodeURIComponent("'"+name.replaceAll("'","''")+"'!A:S")}}
async function readRemoteTasks(){const {id,range}=sheetBase();const data=await sheetsFetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values/${range}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`);const values=data.values||[];if(!values.length)return[];const headers=values[0].map(String);return values.slice(1).filter(r=>String(r[0]||'').trim()).map(r=>rowToTask(headers,r))}
async function writeRemoteTasks(list){const {id,name,range}=sheetBase();await sheetsFetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values/${range}:clear`,{method:'POST',body:'{}'});const out=[SHEET_HEADERS,...list.map(taskToRow)];const start=encodeURIComponent("'"+name.replaceAll("'","''")+"'!A1");await sheetsFetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values/${start}?valueInputOption=RAW`,{method:'PUT',body:JSON.stringify({majorDimension:'ROWS',values:out})})}

function parseDMY(s){const m=String(s||'').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);return m?new Date(Number(m[3]),Number(m[2])-1,Number(m[1])):null}
function parseNum(v){const n=Number(String(v??'').replace('%','').replace(',','.').trim());return Number.isFinite(n)?n:0}
function parseTimeMinutes(v){const s=String(v||'').trim();if(!s)return null;const m=s.match(/^(\d{1,2}):(\d{2})/);if(m)return Number(m[1])*60+Number(m[2]);const digits=s.replace(/\D/g,'');if(digits.length===3)return Number(digits[0])*60+Number(digits.slice(1));if(digits.length===4)return Number(digits.slice(0,2))*60+Number(digits.slice(2));return null}
function avg(a){return a.length?a.reduce((x,y)=>x+y,0)/a.length:null}
function meaningfulRow(r){return Boolean(String(r.firstEntry||'').trim()||String(r.finish||'').trim()||parseNum(r.planned)>0||parseNum(r.done)>0||parseNum(r.tot)>0||parseNum(r.util)>0||parseNum(r.cancel)>0)}
function dayMetrics(date,rows){
 const morning=rows.filter(r=>r.activity==='בוקר');
 const fcotRows=morning.map(r=>parseTimeMinutes(r.firstEntry)).filter(v=>v!==null);
 const fcotOk=fcotRows.filter(v=>v<FCOT_TARGET_MINUTES).length;
 const tots=rows.map(r=>parseNum(r.tot)).filter(v=>v>0);
 const utils=rows.map(r=>parseNum(r.util)).filter(v=>v>0);
 const cancels=rows.reduce((s,r)=>s+parseNum(r.cancel),0);
 return{date,fcotPct:fcotRows.length?100*fcotOk/fcotRows.length:null,fcotOk,fcotTotal:fcotRows.length,tot:avg(tots),util:avg(utils),cancels}
}
function setTrend(id,current,previous,lowerBetter,unit,avg5){
 const el=document.getElementById(id);if(!el)return;
 if(current===null||current===undefined){el.textContent='אין נתונים';el.className='';return}
 let txt='';let cls='';
 if(previous!==null&&previous!==undefined){
  const d=current-previous;const arrow=d>0?'↑':d<0?'↓':'→';const mag=Math.abs(d);
  txt=`${arrow} ${mag<10?mag.toFixed(1):mag.toFixed(0)}${unit} מול יום קודם`;
  if(d!==0)cls=((lowerBetter&&d<0)||(!lowerBetter&&d>0))?'good':'bad';
 }else txt='אין יום קודם להשוואה';
 if(avg5!==null&&avg5!==undefined)txt+=` · ממוצע 5 ימים ${avg5.toFixed(unit==='%'?0:1)}${unit}`;
 el.textContent=txt;el.className=cls
}
function renderOrKpis(days){
 const status=document.getElementById('orKpiStatus');
 if(!days.length){
  ['fcotValue','utilValue','totValue','cancelValue'].forEach(id=>document.getElementById(id).textContent='—');
  status.textContent='OR Control · עדיין אין נתוני KPI שהוזנו';return
 }
 const cur=days[days.length-1],prev=days.length>1?days[days.length-2]:null,last5=days.slice(-5);
 document.getElementById('fcotValue').textContent=cur.fcotPct===null?'—':Math.round(cur.fcotPct)+'%';
 document.getElementById('fcotDetail').textContent=cur.fcotTotal?`${cur.fcotOk}/${cur.fcotTotal} חדרי בוקר לפני 07:45`:'אין זמני כניסה ראשונה';
 document.getElementById('utilValue').textContent=cur.util===null?'—':cur.util.toFixed(1)+'%';
 document.getElementById('utilDetail').textContent='ניצולת ממוצעת יומית';
 document.getElementById('totValue').textContent=cur.tot===null?'—':cur.tot.toFixed(1);
 document.getElementById('totDetail').textContent='דקות בממוצע';
 document.getElementById('cancelValue').textContent=String(cur.cancels);
 document.getElementById('cancelDetail').textContent='ביטולים ביום';
 setTrend('fcotTrend',cur.fcotPct,prev?.fcotPct??null,false,'%',avg(last5.map(x=>x.fcotPct).filter(x=>x!==null)));
 setTrend('utilTrend',cur.util,prev?.util??null,false,'%',avg(last5.map(x=>x.util).filter(x=>x!==null)));
 setTrend('totTrend',cur.tot,prev?.tot??null,true,' דק׳',avg(last5.map(x=>x.tot).filter(x=>x!==null)));
 setTrend('cancelTrend',cur.cancels,prev?.cancels??null,true,'',avg(last5.map(x=>x.cancels)));
 status.textContent=`מקור: OR Control · נתונים ל-${cur.date} · רענון ${new Date().toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'})}`
}
async function refreshOrKpis(){
 const btn=document.getElementById('refreshOrKpiBtn');if(btn)btn.disabled=true;
 const status=document.getElementById('orKpiStatus');status.textContent='OR Control · טוען מדדים…';
 try{
  const range=encodeURIComponent("'"+OR_CONTROL_DATA_SHEET+"'!A:O");
  const data=await sheetsFetch(`https://sheets.googleapis.com/v4/spreadsheets/${OR_CONTROL_SHEET_ID}/values/${range}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`);
  const values=data.values||[];if(values.length<2){renderOrKpis([]);return}
  const byDate=new Map();
  for(const r of values.slice(1)){
   const row={date:r[0]||'',room:r[1]||'',department:r[2]||'',activity:r[3]||'',firstEntry:r[4]||'',finish:r[5]||'',planned:r[6]||'',done:r[7]||'',tot:r[8]||'',util:r[9]||'',cancel:r[10]||''};
   if(!parseDMY(row.date)||!meaningfulRow(row))continue;
   if(!byDate.has(row.date))byDate.set(row.date,[]);byDate.get(row.date).push(row)
  }
  const days=[...byDate.entries()].sort((a,b)=>parseDMY(a[0])-parseDMY(b[0])).map(([d,rs])=>dayMetrics(d,rs));
  renderOrKpis(days);
  localStorage.setItem('executiveMasterTasks.orKpiCache',JSON.stringify(days.slice(-10)));
  localStorage.setItem('executiveMasterTasks.lastOrKpiRefresh',new Date().toISOString())
 }catch(e){console.error(e);status.textContent='OR Control · טעינת המדדים נכשלה: '+String(e?.message||e)}
 finally{if(btn)btn.disabled=false}
}
async function syncNow(){
 const btn=document.getElementById('syncNowBtn');if(btn)btn.disabled=true;syncStatus('מסנכרן…');
 try{
  const remote=await readRemoteTasks();const deleted=deletedIds();const remoteMap=new Map(remote.filter(t=>!deleted.has(t.id)).map(t=>[t.id,t]));
  for(const local of tasks){if(deleted.has(local.id))continue;const r=remoteMap.get(local.id);if(!r){remoteMap.set(local.id,{...local,_dirty:false});continue}if(local._dirty)remoteMap.set(local.id,{...r,...local,_dirty:false})}
  const merged=[...remoteMap.values()].sort((a,b)=>String(a.id).localeCompare(String(b.id),'en'));await writeRemoteTasks(merged);tasks=merged.map(t=>({...t,_dirty:false}));saveDeleted(new Set());persistLocal();
  await refreshOrKpis();
  const stamp=new Date().toLocaleString('he-IL',{dateStyle:'short',timeStyle:'short'});localStorage.setItem('executiveMasterTasks.lastSync',new Date().toISOString());syncStatus(`סונכרנו ${tasks.length} משימות + מדדי OR Control · ${stamp}`,'ok')
 }catch(err){console.error(err);const m=String(err?.message||err);if(m.includes('origin')||m.includes('403'))syncStatus('נדרשת בדיקת OAuth / הרשאות Google: '+m,'error');else syncStatus('הסנכרון נכשל: '+m,'error')}
 finally{if(btn)btn.disabled=false}
}
function disconnectGoogle(){if(googleAccessToken&&window.google?.accounts?.oauth2)google.accounts.oauth2.revoke(googleAccessToken,()=>{});googleAccessToken='';googleTokenExpiresAt=0;if(orKpiTimer)clearInterval(orKpiTimer);syncStatus('מנותק מ-Google');document.getElementById('orKpiStatus').textContent='OR Control · מנותק מ-Google'}

function installDirtyTracking(){
 const form=document.getElementById('taskForm');
 form.onsubmit=e=>{e.preventDefault();const original=document.getElementById('editTaskIdOriginal').value;const previous=tasks.find(t=>t.id===original)||{};const now=new Date().toISOString();const item={...previous,id:document.getElementById('taskId').value.trim(),domain:document.getElementById('taskDomain').value.trim(),title:document.getElementById('taskTitle').value.trim(),priority:document.getElementById('taskPriority').value,status:document.getElementById('taskStatus').value,owner:document.getElementById('taskOwner').value.trim(),nextFollowUp:document.getElementById('taskFollowup').value,nextAction:document.getElementById('taskNextAction').value.trim(),blocker:document.getElementById('taskBlocker').value.trim(),notes:document.getElementById('taskNotes').value.trim(),createdAt:previous.createdAt||now,lastUpdated:now,_dirty:true};const i=tasks.findIndex(t=>t.id===original);if(i>=0)tasks[i]=item;else tasks.push(item);if(original&&original!==item.id){const d=deletedIds();d.add(original);saveDeleted(d)}persistLocal();document.getElementById('taskDialog').close()};
 document.getElementById('deleteTaskBtn').onclick=()=>{const id=document.getElementById('editTaskIdOriginal').value;if(id&&confirm('למחוק את '+id+'?')){const d=deletedIds();d.add(id);saveDeleted(d);tasks=tasks.filter(t=>t.id!==id);persistLocal();document.getElementById('taskDialog').close()}}
}
function showLastSync(){const x=localStorage.getItem('executiveMasterTasks.lastSync');if(x)syncStatus('סנכרון אחרון: '+new Date(x).toLocaleString('he-IL',{dateStyle:'short',timeStyle:'short'}))}
function loadCachedOrKpis(){try{const x=JSON.parse(localStorage.getItem('executiveMasterTasks.orKpiCache')||'[]');if(Array.isArray(x)&&x.length){renderOrKpis(x);const t=localStorage.getItem('executiveMasterTasks.lastOrKpiRefresh');if(t)document.getElementById('orKpiStatus').textContent+=' · מטמון '+new Date(t).toLocaleString('he-IL',{dateStyle:'short',timeStyle:'short'})}}catch{}}
function startOrKpiAutoRefresh(){if(orKpiTimer)clearInterval(orKpiTimer);orKpiTimer=setInterval(()=>{if(googleAccessToken&&Date.now()<googleTokenExpiresAt-60000)refreshOrKpis()},5*60*1000)}
window.addEventListener('load',()=>{
 initGoogleClient();installDirtyTracking();showLastSync();loadCachedOrKpis();
 document.getElementById('googleConnectBtn').onclick=async()=>{try{await ensureGoogleToken();await syncNow();startOrKpiAutoRefresh()}catch(e){syncStatus('התחברות נכשלה: '+e.message,'error')}};
 document.getElementById('syncNowBtn').onclick=async()=>{await syncNow();startOrKpiAutoRefresh()};
 document.getElementById('googleDisconnectBtn').onclick=disconnectGoogle;
 document.getElementById('refreshOrKpiBtn').onclick=async()=>{try{await ensureGoogleToken();await refreshOrKpis();startOrKpiAutoRefresh()}catch(e){document.getElementById('orKpiStatus').textContent='OR Control · '+e.message}}
});