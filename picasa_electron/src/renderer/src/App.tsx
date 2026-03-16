import React, { useEffect, useState } from 'react';

declare global {
  interface Window { api: any }
}

function Modal({ children, onClose }: any) {
  return (
    <div style={{position:'fixed', left:0,top:0,right:0,bottom:0, background:'rgba(0,0,0,0.5)', display:'flex', justifyContent:'center', alignItems:'center'}}>
      <div style={{background:'#fff', padding:12, maxHeight:'80%', overflow:'auto', width:'80%'}}>
        <button onClick={onClose}>Close</button>
        {children}
      </div>
    </div>
  );
}

const App: React.FC = () => {
  const [tab, setTab] = useState<'folder'|'timeline'|'map'|'backup'>('folder');
  const [targets, setTargets] = useState<any[]>([]);
  const [workspacePath, setWorkspacePath] = useState('');
  const [backupPath, setBackupPath] = useState('');
  const [scannedFiles, setScannedFiles] = useState<any[]>([]);
  const [progress, setProgress] = useState<any>(null);
  const [newTarget, setNewTarget] = useState('');
  const [showThumbModal, setShowThumbModal] = useState(false);
  const [thumbs, setThumbs] = useState<any[]>([]);
  const [thumbModalTitle, setThumbModalTitle] = useState('');
  const [computeSha, setComputeSha] = useState(false);
  const [jobId, setJobId] = useState<number | null>(null);

  const refreshTargets = async () => {
    const api = (window as any).api;
    if (!api || !api.listBackupTargets) return;
    const t = await api.listBackupTargets();
    setTargets(t);
  };

  useEffect(() => {
    const api = (window as any).api;
    if (api) {
      api.onScanProgress((m: any) => {
        if (m.type === 'done') setScannedFiles(m.files || []);
        else console.log('scan message', m);
      });
      api.onBackupProgress((p: any) => setProgress(p));
      api.onThumbnailProgress((p: any) => console.log('thumb', p));
    } else {
      console.warn('window.api is not available — running outside Electron or preload not loaded');
    }
    refreshTargets();
  } , []);

  const onScan = async () => {
    if (!workspacePath) return alert('enter workspace path');
    await window.api.scanFolder(workspacePath);
  };

  const onMakeThumbs = async () => {
    if (scannedFiles.length === 0) return alert('scan first');
    // app cache DB example path (per-host) — in scaffold we use config/viewer_cache.sqlite
    const appCache = 'config/viewer_cache.sqlite';
    const filesForThumb = scannedFiles.slice(0, 50).map((f:any)=>({ path: f.absPath || f.path }));
    await window.api.generateThumbnails(filesForThumb, backupPath || './tmp_thumbs', appCache);
  };

  const onBackup = async () => {
    if (scannedFiles.length === 0) return alert('scan first');
    if (!backupPath) return alert('select backup root');
    const filesPayload = scannedFiles.slice(0, 100).map((f:any)=>({ absPath: f.absPath || f.path, rel: f.rel || (f.path ? f.path : f.absPath), driveName: f.driveName || 'root', size: f.size, mtime: f.mtime }));
    const job = await window.api.startBackup({ files: filesPayload, backupRoot: backupPath, computeSha256: computeSha });
    console.log('started job', job);
    if (job && job.jobId) setJobId(job.jobId);
  };

  const onAddTarget = async () => {
    if (!newTarget) return;
    await window.api.addBackupTarget(newTarget);
    setNewTarget('');
    await refreshTargets();
  };

  const onRemoveTarget = async (t: string) => {
    await window.api.removeBackupTarget(t);
    await refreshTargets();
  };

  const onCancel = async () => {
    if (!jobId) return;
    await window.api.cancelBackup(jobId);
    setJobId(null);
  };

  const viewWorkspaceCache = async () => {
    // viewer cache DB (app-local)
    const db = 'config/viewer_cache.sqlite';
    const rows = await window.api.listThumbnails(db, 200);
    if (rows.error) return alert(rows.error);
    setThumbs(rows);
    setThumbModalTitle('Workspace Cache Thumbnails');
    setShowThumbModal(true);
  };

  const viewBackupCache = async (backupRoot: string) => {
    // backup cache DB at backupRoot/backup_metadata.sqlite
    const db = backupRoot + '/backup_metadata.sqlite';
    const rows = await window.api.listThumbnails(db, 200);
    if (rows.error) return alert(rows.error);
    setThumbs(rows);
    setThumbModalTitle(`Backup Thumbnails — ${backupRoot}`);
    setShowThumbModal(true);
  };

  return (
    <div style={{display: 'flex', height: '100vh', flexDirection: 'column'}}>
      <div style={{padding: 8, borderBottom: '1px solid #ccc'}}>
        <button onClick={() => setTab('folder')}>Folder</button>
        <button onClick={() => setTab('timeline')}>Timeline</button>
        <button onClick={() => setTab('map')}>Map</button>
        <button onClick={() => setTab('backup')}>Backup</button>
      </div>
      <div style={{display: 'flex', flex: 1}}>
        <div style={{width: '15%', borderRight: '1px solid #ddd', padding: 8}}>
          <div>
            <h4>Workspace</h4>
            <input style={{width: '100%'}} value={workspacePath} onChange={(e)=>setWorkspacePath(e.target.value)} placeholder="/path/to/workspace" />
            <div style={{marginTop:6}}>
              <button onClick={onScan}>Scan</button>
              <button onClick={async ()=>{
                const res = await window.api.openFolderDialog({ title: 'Select workspace folder' });
                if (!res.canceled && res.paths && res.paths.length>0) {
                  setWorkspacePath(res.paths[0]);
                }
              }}>Browse...</button>
            </div>
            <button onClick={viewWorkspaceCache}>View Workspace Thumbnail Cache</button>
            <h4>Scanned files: {scannedFiles.length}</h4>
            {tab === 'folder' && <div style={{maxHeight: 400, overflow: 'auto'}}>
              {scannedFiles.slice(0,200).map((f,i)=>(<div key={i}>{f.absPath || f.path}</div>))}
            </div>}
          </div>
        </div>
        <div style={{flex: 1, padding: 8}}>
          {tab === 'backup' ? (
            <div>
              <h3>Backup</h3>
              <div>
                <label>Backup root (local folder):</label>
                <input style={{width: '60%'}} value={backupPath} onChange={(e)=>setBackupPath(e.target.value)} placeholder="/path/to/backup/root" />
                <button onClick={onBackup} disabled={!!jobId}>Start Backup</button>
                <button onClick={onMakeThumbs}>Generate Thumbnails</button>
                {jobId && <button onClick={onCancel} style={{marginLeft:8}}>Cancel</button>}
              </div>
              <div style={{marginTop: 12}}>
                <strong>Progress:</strong>
                <pre>{JSON.stringify(progress, null, 2)}</pre>
              </div>
              <label style={{marginLeft:12}}><input type="checkbox" checked={computeSha} onChange={(e)=>setComputeSha(e.target.checked)} /> Compute SHA256 (slower)</label>
            </div>
          ) : (
            <div>{tab} view</div>
          )}
        </div>
        <div style={{width: '10%', borderLeft: '1px solid #ddd', padding: 8}}>
          <div>
            <h4>Backup Targets</h4>
            <input style={{width: '100%'}} value={newTarget} onChange={(e)=>setNewTarget(e.target.value)} placeholder="/path/to/backup/root" />
            <button onClick={onAddTarget}>Add</button>
            <div style={{marginTop: 8, maxHeight: 400, overflow: 'auto'}}>
              {targets.length === 0 ? <div>No targets</div> : targets.map((t,i)=>(
                <div key={i} style={{display:'flex', justifyContent:'space-between'}}>
                  <span style={{fontSize:12}}>{t}</span>
                  <div>
                    <button onClick={()=>onRemoveTarget(t)}>Remove</button>
                    <button onClick={()=>viewBackupCache(t)}>View Cache</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {showThumbModal && (
        <Modal onClose={()=>setShowThumbModal(false)}>
          <h3>{thumbModalTitle}</h3>
          <div style={{display:'flex', flexWrap:'wrap'}}>
            {thumbs.map((t,i)=> (
              <div key={i} style={{margin:6, width:120}}>
                <img src={`data:image/jpeg;base64,${t.thumbBase64}`} style={{width:'100%'}} />
                <div style={{fontSize:10}}>{t.key}</div>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
};

export default App;

