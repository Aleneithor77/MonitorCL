const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('api',{
 getConfig:()=>ipcRenderer.invoke('get-config'),
 saveConfig:c=>ipcRenderer.invoke('save-config',c),
 resetConfig:()=>ipcRenderer.invoke('reset-config'),
 getStatus:()=>ipcRenderer.invoke('get-status'),
 getScanState:()=>ipcRenderer.invoke('get-scan-state'), showCurrentStatus:()=>ipcRenderer.invoke('show-current-status'),
 testSound:()=>ipcRenderer.invoke('test-sound')
});