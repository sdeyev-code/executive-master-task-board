const $=id=>document.getElementById(id);
const STORAGE="executiveMasterTasks.v1";
const priorities=["גבוהה","בינונית","נמוכה"];
const statuses=["חדש","בביצוע","ממתין לאחר","במעקב","חסום","דורש החלטה","הושלם","ארכיון"];
const seed=[
{id:"OR-01",title:"שיפור FCOT",domain:"OR Operations",priority:"גבוהה",status:"בביצוע",owner:"",nextFollowUp:"",blocker:"",nextAction:"להמשיך מעקב יומי לפי חדר ומחלקה",notes:""},
{id:"OR-02",title:"שיפור ניצולת חדרי ניתוח",domain:"OR Operations",priority:"גבוהה",status:"בביצוע",owner:"",nextFollowUp:"",blocker:"",nextAction:"להשוות Planned vs Actual",notes:""},
{id:"OR-03",title:"TOT – Turnover Time",domain:"OR Operations",priority:"גבוהה",status:"בביצוע",owner:"",nextFollowUp:"",blocker:"",nextAction:"למדוד זמן הכנת חדר בין ניתוחים לפי חדר",notes:""},
{id:"OR-04",title:"הפחתת ביטולי ניתוחים",domain:"OR Operations",priority:"גבוהה",status:"בביצוע",owner:"",nextFollowUp:"",blocker:"",nextAction:"פילוח סיבות ביטול ומעקב שבועי",notes:""},
{id:"OR-07",title:"תוכנית חדרי ניתוח נובמבר 2026",domain:"OR Planning",priority:"גבוהה",status:"במעקב",owner:"",nextFollowUp:"2026-09-28T09:00",blocker:"",nextAction:"7 חדרים + אמבולטורי + 2 ססיות",notes:""},
{id:"HR-01",title:"מעקב הפסקות צוות חדר ניתוח",domain:"HR",priority:"גבוהה",status:"במעקב",owner:"",nextFollowUp:"2026-09-22T09:00",blocker:"",nextAction:"לקבוע אחראי למילוי טבלת הפסקות הצוות",notes:""},
{id:"PR-01",title:"Video Laryngoscope McGrath",domain:"Procurement",priority:"גבוהה",status:"ממתין לאחר",owner:"מנהל אדמיניסטרטיבי",nextFollowUp:"2026-09-22T09:00",blocker:"",nextAction:"בדיקת סטטוס וקביעת מועד מעקב נוסף",notes:""},
{id:"PR-02",title:"US נייד להרדמה",domain:"Procurement",priority:"בינונית",status:"ממתין לאחר",owner:"מנהל אדמיניסטרטיבי",nextFollowUp:"2026-09-22T09:00",blocker:"",nextAction:"בדיקת סטטוס וקביעת מועד מעקב נוסף",notes:""},
{id:"PR-03",title:"Mini C-Arm",domain:"Procurement",priority:"בינונית",status:"ממתין לאחר",owner:"מנהל אדמיניסטרטיבי",nextFollowUp:"2026-09-22T09:00",blocker:"",nextAction:"בדיקת סטטוס וקביעת מועד מעקב נוסף",notes:""},
{id:"FIN-01",title:"קידוד נכון של ניתוחים – כל המחלקות",domain:"Finance & Coding",priority:"בינונית",status:"במעקב",owner:"",nextFollowUp:"",blocker:"",nextAction:"Audit של פרוצדורות וקודים חריגים",notes:""},
{id:"Q-01",title:"RCA ואירועים חריגים",domain:"Quality & Safety",priority:"גבוהה",status:"במעקב",owner:"",nextFollowUp:"",blocker:"",nextAction:"לוודא סגירת פעולות מתקנות",notes:""},
{id:"EX-02",title:"חסמים בין-מחלקתיים",domain:"Executive",priority:"גבוהה",status:"בביצוע",owner:"",nextFollowUp:"",blocker:"",nextAction:"להציף חסמים שלא נסגרו מעל 7 ימים",notes:""}
].map(x=>({...x,lastUpdated:new Date().toISOString()}));
let tasks=JSON.parse(localStorage.getItem(STORAGE)||"null")||structuredClone(seed);
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));
const rank=p=>priorities.indexOf(p)<0?99:priorities.indexOf(p);
const open=t=>!["הושלם","ארכיון"].includes(t.status);
const fmt=d=>d?new Intl.DateTimeFormat("he-IL",{dateStyle:"short",timeStyle:"short"}).format(new Date(d)):"—";
function save(){localStorage.setItem(STORAGE,JSON.stringify(tasks));render();}
function card(t){return '<div class="task-card" onclick="openEdit(\''+esc(t.id)+'\')"><div class="row"><div><h4>'+esc(t.id)+' · '+esc(t.title)+'</h4><p>'+esc(t.nextAction||t.domain)+'</p></div><span class="chip">'+esc(t.status)+'</span></div></div>'}
function go(v){document.querySelectorAll(".view").forEach(x=>x.classList.remove("active-view"));$(v+"View").classList.add("active-view");document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.view===v));const m={dashboard:["Dashboard","תמונת מצב ניהולית"],master:["Master Task List","כל התהליכים והמשימות"],followup:["Follow-up Center","מה דורש מעקב עכשיו"],brief:["Executive Brief","פעולות, חסמים והחלטות"],sync:["Sync & Backup","Google Sheet וגיבוי"]}[v];$("pageTitle").textContent=m[0];$("pageSubtitle").textContent=m[1]}
function render(){
 const o=tasks.filter(open),due=o.filter(t=>t.nextFollowUp&&new Date(t.nextFollowUp)<=new Date());
 $("metrics").innerHTML=[["דחוף",o.filter(t=>t.priority==="גבוהה").length],["מעקבים שהגיע זמנם",due.length],["ממתין לאחרים",o.filter(t=>t.status==="ממתין לאחר").length],["חסום",o.filter(t=>t.status==="חסום").length]].map(x=>'<div class="metric-card"><span>'+x[0]+'</span><strong>'+x[1]+'</strong></div>').join("");
 const top=[...o].sort((a,b)=>rank(a.priority)-rank(b.priority)||String(a.nextFollowUp||"9999").localeCompare(String(b.nextFollowUp||"9999"))).slice(0,3);
 $("topThree").innerHTML=top.map(card).join("")||'<p class="muted">אין משימות פתוחות.</p>';
 $("upcomingFollowups").innerHTML=o.filter(t=>t.nextFollowUp).sort((a,b)=>new Date(a.nextFollowUp)-new Date(b.nextFollowUp)).slice(0,6).map(card).join("")||'<p class="muted">אין מעקבים מתוזמנים.</p>';
 const q=$("searchInput").value.trim().toLowerCase(),sf=$("statusFilter").value,pf=$("priorityFilter").value;
 $("taskTableBody").innerHTML=tasks.filter(t=>(!q||((t.id+" "+t.domain+" "+t.title).toLowerCase().includes(q)))&&(!sf||t.status===sf)&&(!pf||t.priority===pf)).sort((a,b)=>rank(a.priority)-rank(b.priority)||a.id.localeCompare(b.id)).map(t=>'<tr onclick="openEdit(\''+esc(t.id)+'\')"><td><strong>'+esc(t.id)+'</strong></td><td>'+esc(t.domain)+'</td><td>'+esc(t.title)+'</td><td>'+esc(t.priority)+'</td><td>'+esc(t.status)+'</td><td>'+esc(t.owner||"—")+'</td><td>'+fmt(t.nextFollowUp)+'</td></tr>').join("");
 $("dueList").innerHTML=due.sort((a,b)=>new Date(a.nextFollowUp)-new Date(b.nextFollowUp)).map(card).join("")||'<p class="muted">אין מעקבים באיחור.</p>';
 $("soonList").innerHTML=o.filter(t=>t.nextFollowUp&&new Date(t.nextFollowUp)>new Date()).sort((a,b)=>new Date(a.nextFollowUp)-new Date(b.nextFollowUp)).slice(0,12).map(card).join("")||'<p class="muted">אין מעקבים קרובים.</p>';
 $("briefTop").innerHTML=top.map(card).join("");
 $("briefDecision").innerHTML=o.filter(t=>["דורש החלטה","חסום"].includes(t.status)).map(card).join("")||'<p class="muted">אין כרגע.</p>';
 $("briefWaiting").innerHTML=o.filter(t=>t.status==="ממתין לאחר").map(card).join("")||'<p class="muted">אין כרגע.</p>';
 $("briefStale").innerHTML=o.filter(t=>Date.now()-new Date(t.lastUpdated)>604800000).map(card).join("")||'<p class="muted">אין משימות ישנות ללא עדכון.</p>';
 $("openSheetLink").href="https://docs.google.com/spreadsheets/d/"+$("sheetIdInput").value.trim()+"/edit";
}
function resetForm(){$("taskForm").reset();$("editTaskIdOriginal").value="";$("deleteTaskBtn").classList.add("hidden");$("dialogTitle").textContent="משימה חדשה"}
function openNew(){resetForm();$("taskPriority").value="בינונית";$("taskStatus").value="חדש";$("taskDialog").showModal()}
window.openEdit=id=>{const t=tasks.find(x=>x.id===id);if(!t)return;resetForm();$("dialogTitle").textContent="עריכת "+t.id;$("editTaskIdOriginal").value=t.id;$("taskId").value=t.id;$("taskDomain").value=t.domain;$("taskTitle").value=t.title;$("taskPriority").value=t.priority;$("taskStatus").value=t.status;$("taskOwner").value=t.owner||"";$("taskFollowup").value=t.nextFollowUp||"";$("taskNextAction").value=t.nextAction||"";$("taskBlocker").value=t.blocker||"";$("taskNotes").value=t.notes||"";$("deleteTaskBtn").classList.remove("hidden");$("taskDialog").showModal()}
document.querySelectorAll(".nav-item").forEach(b=>b.onclick=()=>go(b.dataset.view));
$("newTaskBtn").onclick=openNew;
["searchInput","statusFilter","priorityFilter","sheetIdInput"].forEach(id=>$(id).oninput=render);
statuses.forEach(s=>{$("statusFilter").insertAdjacentHTML("beforeend","<option>"+s+"</option>");$("taskStatus").insertAdjacentHTML("beforeend","<option>"+s+"</option>")});
priorities.forEach(p=>{$("priorityFilter").insertAdjacentHTML("beforeend","<option>"+p+"</option>");$("taskPriority").insertAdjacentHTML("beforeend","<option>"+p+"</option>")});
$("taskForm").onsubmit=e=>{e.preventDefault();const original=$("editTaskIdOriginal").value,item={id:$("taskId").value.trim(),domain:$("taskDomain").value.trim(),title:$("taskTitle").value.trim(),priority:$("taskPriority").value,status:$("taskStatus").value,owner:$("taskOwner").value.trim(),nextFollowUp:$("taskFollowup").value,nextAction:$("taskNextAction").value.trim(),blocker:$("taskBlocker").value.trim(),notes:$("taskNotes").value.trim(),lastUpdated:new Date().toISOString()};const i=tasks.findIndex(t=>t.id===original);i>=0?tasks[i]=item:tasks.push(item);save();$("taskDialog").close()};
$("deleteTaskBtn").onclick=()=>{const id=$("editTaskIdOriginal").value;if(id&&confirm("למחוק את "+id+"?")){tasks=tasks.filter(t=>t.id!==id);save();$("taskDialog").close()}};
function dl(name,data,type){const b=new Blob([data],{type}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),500)}
$("exportJsonBtn").onclick=()=>dl("MasterTasks.json",JSON.stringify(tasks,null,2),"application/json");
$("exportCsvBtn").onclick=()=>{const cols=["id","title","domain","priority","status","owner","nextFollowUp","blocker","nextAction","notes","lastUpdated"];const q=v=>/[",\n]/.test(String(v??""))?'"'+String(v??"").replaceAll('"','""')+'"':String(v??"");dl("MasterTasks.csv",[cols.join(","),...tasks.map(t=>cols.map(k=>q(t[k])).join(","))].join("\n"),"text/csv;charset=utf-8")};
$("importJsonInput").onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{const x=JSON.parse(await f.text());if(!Array.isArray(x))throw 0;tasks=x;save();alert("הייבוא הושלם.")}catch{alert("קובץ JSON לא תקין.")}};
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js"));
render();