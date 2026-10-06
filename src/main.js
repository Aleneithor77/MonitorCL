const {app,BrowserWindow,Tray,Menu,nativeImage,ipcMain,Notification}=require('electron');
const path=require('path'),fs=require('fs'),Database=require('better-sqlite3');

const DEFAULTS={
 scheduledUrl:'https://www.panamacompra.gob.pa/Inicio/#/cotizaciones-en-linea/cotizaciones-en-linea?q=Qf1EjOi8GZhR3clJye',
 openUrl:'https://www.panamacompra.gob.pa/Inicio/#/cotizaciones-en-linea/cotizaciones-en-linea',
 scheduledInterval:30000,openInterval:3600000,
 schedules:[{days:[1,2,3,4,5],start:'06:00',end:'20:00'},{days:[6],start:'07:00',end:'14:00'}],
 soundDevice:'default',
 exclusions:[
 'ABRIGOS','Compra de brindis','guantes de nitrilo','termómetro','Compra de alimentos','compra de logo','con logo',
 'PIEZAS PARA EL VEHÍCULO','TOYOTA','compra de comida','instalación','TOYOTA HILUX','KIA SPORTAGE','mano de obra',
 'medallas','trofeos','SERVICIO DE REVISADO','REPARACIONES DE LAS PIEZAS','Confección Acrílicos para premiación','Capacitación',
 'Confección de placas de inventario','Servicio de mesura de terreno','SUMINISTRO E INSTALACIÓN','Gestionar alimentación',
 'Electroencefalograma','arreglo floral','ATRIL, FONDO DE PAPEL','Medicamento','Aripiprazol 15 mg','CATETERIZACION','Pan',
 'frescos','INSUMOS MEDICOS','Suministro e instalación','SONDA FOLEY','Dextrosa','INVERMECTINA','OFTALMOSCOPIO',
 'HOJAS DE BISTURÍ','HIPOPERFUSIÓN','HIDRALAZINA','MANGUITO ROTADOR','INSTRUMENTAL PARA ARTROSCOPIA','SOLUCIÓN GLUCONATO',
 'CLORHEXIDINA','DILUYENTE PARA RECUENTO','ELECTROMIOGRAFIA','NEUROFISIOLOGICAS','PRUEBAS PARA HEMOGRAMA',
 'PINZAS HEMOSTATICA','MONTELUKAST','DICLOFENACO','FLURIBIPROFEN','SUPROFEN','GOTAS OFTALMICAS',
 'SALES DE REHIDRATACIÓN ORAL','SONDA MINI LACRIMAL BODIAN','LASER QUIRURGICO','MICROALBUMINA','BILIRRUBINA','Insumos médicos','medicamentos'
 ],
 priorities:[
 'COMPUTADOR','COMPUTADORES','COMPUTADORA','COMPUTADORAS','PC','PCS','CPU','CPUS','WORKSTATION','WORKSTATIONS',
 'ESTACION DE TRABAJO','ESTACIONES DE TRABAJO','DESKTOP','DESKTOPS','TORRE','TORRES','LAPTOP','LAPTOPS','NOTEBOOK','NOTEBOOKS',
 'PORTATIL','PORTATILES','IMPRESORA','IMPRESORAS','MULTIFUNCIONAL','MULTIFUNCIONALES','PLOTTER','PLOTTERS',
 'FOTOCOPIADORA','FOTOCOPIADORAS','ESCANER','ESCANERES','ESCÁNER','ESCÁNERES','AIRE ACONDICIONADO','AIRES ACONDICIONADOS',
 'A/C','AA','SPLIT','SPLITS','MINI SPLIT','MINI SPLITS','INVERTER','REFRIGERADOR','REFRIGERADORES','NEVERA','NEVERAS',
 'CONGELADOR','CONGELADORES','FREEZER','FREEZERS','ENFRIADOR','ENFRIADORES','CUARTO FRIO','CUARTOS FRIOS',
 'LAVADORA','LAVADORAS','SECADORA','SECADORAS','CENTRO DE LAVADO','CENTROS DE LAVADO','PINTURA','PINTURAS','ESMALTE','ESMALTES',
 'LATEX','LÁTEX','ACRILICA','ACRILICAS','ACRÍLICA','ACRÍLICAS','MONITOR','MONITORES','SERVIDOR','SERVIDORES',
 'UPS','NO BREAK','NOBREAK','REGULADOR','REGULADORES'
 ]};

let cfg,db,mainWin,tray,timers=[],isScanning=false,appQuitting=false,alertWins=[];
const dataDir=()=>app.getPath('userData'),configPath=()=>path.join(dataDir(),'config.json');
const norm=s=>String(s||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/[^\\p{L}\\p{N}]+/gu,' ').replace(/\\s+/g,' ').trim().toUpperCase();
const clone=o=>JSON.parse(JSON.stringify(o));
function loadConfig(){try{cfg={...clone(DEFAULTS),...JSON.parse(fs.readFileSync(configPath(),'utf8'))}}catch{cfg=clone(DEFAULTS);saveConfig()}}
function saveConfig(){fs.mkdirSync(dataDir(),{recursive:true});fs.writeFileSync(configPath(),JSON.stringify(cfg,null,2),'utf8')}
function initDb(){db=new Database(path.join(dataDir(),'monitorcl.db'));db.pragma('journal_mode=WAL');db.exec('CREATE TABLE IF NOT EXISTS records(cl TEXT PRIMARY KEY,detected_at TEXT,source TEXT,modality TEXT,entity TEXT,description TEXT,date_text TEXT,url TEXT,classification TEXT,notified INTEGER DEFAULT 0)')}
function inSchedule(){const n=new Date(),day=n.getDay()||7,min=n.getHours()*60+n.getMinutes();return (cfg.schedules||[]).some(s=>s.days.includes(day)&&min>=hm(s.start)&&min<hm(s.end))}
function hm(x){const [h,m]=String(x||'00:00').split(':').map(Number);return h*60+m}
function classify(raw,mod){if(!/^GLOBAL$/i.test(norm(mod)))return null;const h=norm(raw);if(cfg.exclusions.some(x=>h.includes(norm(x))))return null;return cfg.priorities.some(x=>h.includes(norm(x)))?'ALTA':'NORMAL'}
function esc(s){return String(s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function closeAlert(w){try{if(w&&!w.isDestroyed())w.close()}catch{}alertWins=alertWins.filter(x=>x!==w)}
function showAlert(r,high){
 const w=new BrowserWindow({width:430,height:300,frame:false,resizable:false,alwaysOnTop:true,skipTaskbar:true,show:false,backgroundColor:high?'#fff4a8':'#fff9c4',webPreferences:{contextIsolation:true}});
 alertWins.push(w);
 const title=high?'ALTA PRIORIDAD':'NUEVA COTIZACIÓN';
 const bg=high?'#fff4a8':'#fff9c4';
 const html='<!doctype html><html><body style="margin:0;font:14px Segoe UI;background:'+bg+';border:4px solid #d40000;box-sizing:border-box;height:100vh;padding:18px;color:#222"><button onclick="window.close()" style="position:absolute;right:10px;top:8px;border:0;background:transparent;font-size:22px;cursor:pointer">×</button><div style="font-size:21px;font-weight:800">'+esc(title)+'</div><div style="margin-top:12px;font-weight:700">CL: '+esc(r.cl)+'</div><div style="margin-top:8px">'+esc(r.entity)+'</div><div style="margin-top:8px;line-height:1.35">'+esc(r.description)+'</div><div style="margin-top:10px;font-weight:600">'+esc(r.date)+'</div><div style="position:absolute;bottom:12px;left:18px;font-size:12px;color:#666">MONITOR CL 👀</div></body></html>';
 w.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html));
 w.once('ready-to-show',()=>{if(!w.isDestroyed()){w.show();w.focus()}});
 w.on('closed',()=>{alertWins=alertWins.filter(x=>x!==w)});
 setTimeout(()=>closeAlert(w),high?20000:12000);
 db.prepare('UPDATE records SET notified=1 WHERE cl=?').run(r.cl);
}
async function waitForRows(win,timeout=15000){
 const start=Date.now();
 while(Date.now()-start<timeout){
  try{const n=await win.webContents.executeJavaScript(`document.querySelectorAll('tr a[href*="solicitud-de-cotizacion"]').length`);if(n>0)return true}catch{}
  await new Promise(r=>setTimeout(r,500));
 }
 return false;
}
async function extract(win){return win.webContents.executeJavaScript(`(()=>Array.from(document.querySelectorAll('tr')).map(tr=>{const a=tr.querySelector('a[href*="solicitud-de-cotizacion"]');if(!a)return null;const c=Array.from(tr.querySelectorAll('td')).map(x=>x.innerText.trim());return {cl:(a.innerText||'').trim(),url:a.href,c,raw:tr.innerText}}).filter(Boolean))()`)}
function modalityFrom(c,raw){
 const direct=c.find(x=>/^Global$/i.test(x)||/^Rengl[oó]n$/i.test(x));
 if(direct)return direct;
 const m=String(raw||'').match(/\b(Global|Rengl[oó]n)\b/i);
 return m?m[1]:'';
}
async function scan(url,source){
 if(!inSchedule()||isScanning)return;
 isScanning=true; let win=null;
 try{
  for(let attempt=1;attempt<=3;attempt++){
   try{
    win=new BrowserWindow({show:false,webPreferences:{contextIsolation:true}});
    await win.loadURL(url,{waitUntil:'domcontentloaded',timeout:30000});
    if(!await waitForRows(win,15000))throw new Error('Sin cotizaciones visibles tras cargar la página');
    const rows=await extract(win),seen=new Set();
    for(const r of rows){
     if(!r.cl||seen.has(r.cl)||db.prepare('SELECT 1 FROM records WHERE cl=?').get(r.cl))continue;
     seen.add(r.cl);
     const mod=modalityFrom(r.c,r.raw);
     const cls=classify(r.raw,mod);
     const rec={cl:r.cl,detected_at:new Date().toISOString(),source,modality:mod,entity:r.c[3]||'',description:r.c[2]||r.raw,date_text:r.c[5]||'',url:r.url,classification:cls};
     db.prepare('INSERT INTO records VALUES(@cl,@detected_at,@source,@modality,@entity,@description,@date_text,@url,@classification,0)').run(rec);
     if(cls)showAlert({cl:r.cl,entity:rec.entity,description:rec.description,date:rec.date_text},cls==='ALTA');
    }
    return;
   }catch(err){
    if(attempt===3)console.error('MONITOR CL: fallo de captura',source,err?.message||err);
    await new Promise(r=>setTimeout(r,1000*attempt));
   }finally{if(win){try{win.destroy()}catch{}win=null}}
  }
 }finally{isScanning=false}
}
function restartTimers(){timers.forEach(clearInterval);timers=[];if(cfg.scheduledInterval>0)timers.push(setInterval(()=>scan(cfg.scheduledUrl,'Programadas'),cfg.scheduledInterval));if(cfg.openInterval>0)timers.push(setInterval(()=>scan(cfg.openUrl,'Abiertas'),cfg.openInterval));scan(cfg.scheduledUrl,'Programadas')}
function icon(){return nativeImage.createFromBuffer(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAQAAAC1+jfqAAAAC0lEQVR42mNkYGD4DwABBAEAHjOcWQAAAABJRU5ErkJggg==','base64'))}
function openWindow(){mainWin.show();mainWin.focus()}
function listWindow(title,sql){const rows=db.prepare(sql).all();const w=new BrowserWindow({width:760,height:520,show:true,title,webPreferences:{contextIsolation:true}});const esc=s=>String(s||'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));w.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<style>body{font:14px Segoe UI;padding:20px}h2{margin-top:0}.r{padding:12px 0;border-bottom:1px solid #ddd}button{padding:8px 16px}</style><h2>'+esc(title)+'</h2>'+rows.map(r=>'<div class="r"><b>'+esc(r.cl)+'</b><br>'+esc(r.entity)+'<br>'+esc(r.description)+'<br>'+esc(r.date_text)+'</div>').join('')+'<br><button onclick="window.close()">Cerrar</button>'))}
function trayMenu(){tray.setContextMenu(Menu.buildFromTemplate([{label:'Registros nuevos — últimos 30 minutos',click:()=>listWindow('Registros nuevos — últimos 30 minutos',"SELECT * FROM records WHERE detected_at>=datetime('now','-30 minutes') ORDER BY detected_at DESC")},{label:'Alta prioridad — últimos 20 minutos',click:()=>listWindow('Alta prioridad — últimos 20 minutos',"SELECT * FROM records WHERE classification='ALTA' AND detected_at>=datetime('now','-20 minutes') ORDER BY detected_at DESC")},{type:'separator'},{label:'Configuración',click:openWindow},{label:'Cerrar Monitor CL',click:()=>{appQuitting=true;app.quit()}}]))}
app.on('second-instance',()=>openWindow());
app.on('before-quit',()=>{appQuitting=true;timers.forEach(clearInterval);alertWins.forEach(closeAlert)});
app.whenReady().then(()=>{if(!app.requestSingleInstanceLock())return app.quit();if(process.platform==='win32')app.setLoginItemSettings({openAtLogin:true,path:process.execPath,args:['--hidden']});loadConfig();initDb();mainWin=new BrowserWindow({width:920,height:760,show:false,title:'MONITOR CL 👀',webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true}});mainWin.loadFile(path.join(__dirname,'index.html'));mainWin.on('close',e=>{if(!appQuitting){e.preventDefault();mainWin.hide()}});tray=new Tray(icon());tray.setToolTip('MONITOR CL 👀');trayMenu();restartTimers()});
ipcMain.handle('get-config',()=>cfg);
ipcMain.handle('save-config',(e,c)=>{cfg={...clone(DEFAULTS),...c};saveConfig();restartTimers();return cfg});
ipcMain.handle('reset-config',()=>{cfg=clone(DEFAULTS);saveConfig();restartTimers();return cfg});
ipcMain.handle('get-status',()=>inSchedule()?'ACTIVO':'EN ESPERA');
ipcMain.handle('test-sound',()=>{new Notification({title:'MONITOR CL 👀',body:'Prueba de sonido — salida predeterminada de Windows',silent:false}).show();return true});
