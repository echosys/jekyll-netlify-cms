import React, { useState, useEffect, useMemo } from 'react';
import { Folder, Archive, FileText, Search, Layout, ChevronRight, ChevronDown } from 'lucide-react';

interface BUViewerProps {
  selectedStorageZip: string | null;
}

interface TreeNode {
  name: string;
  path: string;
  type: 'folder' | 'file';
  size?: number;
  mtime?: string;
  part?: string;
  children?: Record<string, TreeNode>;
}

export const BUViewer: React.FC<BUViewerProps> = ({ selectedStorageZip }) => {
  const [files, setFiles] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['root']));

  useEffect(() => {
    if (selectedStorageZip) {
      loadZipContents(selectedStorageZip);
    }
  }, [selectedStorageZip]);

  const loadZipContents = async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const api = (window as any).api;
      const res = await api.listBackupContents(path);
      if (res && Array.isArray(res)) {
        setFiles(res);
      } else if (res && res.error) {
        setError(res.error);
        setFiles([]);
      } else {
        setFiles([]);
      }

    } catch (err) {
      console.error(err);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };

  const treeData = useMemo(() => {
    const root: TreeNode = { name: 'Backup Root', path: 'root', type: 'folder', children: {} };
    
    files.forEach(file => {
      const parts = (file.rel_path || '').split('/');
      let current = root;
      
      parts.forEach((part: string, index: number) => {

        if (!part) return;
        const isLast = index === parts.length - 1;
        
        if (!current.children![part]) {
          current.children![part] = {
            name: part,
            path: parts.slice(0, index + 1).join('/'),
            type: isLast ? 'file' : 'folder',
            children: isLast ? undefined : {},
            size: isLast ? file.size : 0,
            mtime: isLast ? file.mtime : '',
            part: isLast ? file.archive_part : ''
          };
        }
        
        if (!isLast) {
          current = current.children![part];
        } else {
          // If it's a file, we could add up sizes for folders too
          // but for now let's just keep it simple
        }
      });
    });
    
    return root;
  }, [files]);

  const toggleFolder = (path: string) => {
    const next = new Set(expandedFolders);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    setExpandedFolders(next);
  };

  const matchesSearch = (node: TreeNode, query: string): boolean => {
    if (!query) return true;
    const q = query.toLowerCase();
    if (node.name.toLowerCase().includes(q)) return true;
    if (node.children) {
      return Object.values(node.children).some(child => matchesSearch(child, query));
    }
    return false;
  };

  const renderTree = (node: TreeNode, depth: number = 0) => {
    if (searchQuery && !matchesSearch(node, searchQuery)) return null;

    const isExpanded = expandedFolders.has(node.path) || !!searchQuery;
    const hasChildren = node.children && Object.keys(node.children).length > 0;

    return (
      <div key={node.path} className="flex flex-col">
        <div 
          className={`flex items-center gap-2 p-2 hover:bg-white-5 cursor-pointer border-b border-white-5 transition-colors group ${depth === 0 ? 'bg-black-40 font-bold' : 'tree-item-connector'}`}
          style={{ paddingLeft: `${depth * 20 + 12}px` }}
          onClick={() => node.type === 'folder' ? toggleFolder(node.path) : null}
        >
          <div className="flex items-center gap-2 flex-1 overflow-hidden">
            {node.type === 'folder' ? (
              <>
                {hasChildren ? (isExpanded ? <ChevronDown size={14} className="text-white-40" /> : <ChevronRight size={14} className="text-white-40" />) : <div className="w-3.5" />}
                <Folder size={14} className="text-accent-40" />
              </>
            ) : (
              <>
                <div className="w-3.5" />
                <FileText size={14} className="text-white-20" />
              </>
            )}
            <span className="truncate text-sm">{node.name}</span>
          </div>
          
          <div className="flex items-center gap-4 text-[10px] font-bold text-white-30 uppercase pr-4">
             {node.type === 'file' && (
               <>
                 <span className="w-20 text-right">{(node.size! / 1024 / 1024).toFixed(2)} MB</span>
                 <span className="w-16 text-center bg-accent-10 text-accent px-1.5 rounded">{node.part}</span>
               </>
             )}
          </div>
        </div>
        
        {node.type === 'folder' && isExpanded && node.children && (
          <div className={depth > 0 ? 'tree-container' : ''}>
            {Object.values(node.children)
              .sort((a, b) => {
                if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
                return a.name.localeCompare(b.name);
              })
              .map((child, j, arr) => (
                <div key={child.path} className={depth > 0 && j === arr.length - 1 ? 'tree-item-connector-last' : ''}>
                   {renderTree(child, depth + 1)}
                </div>
              ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-main-panel overflow-hidden">
      <div className="p-6 border-b border-white-5 flex items-center justify-between bg-black-20">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-black flex items-center gap-3 uppercase tracking-tightest">
            <Archive size={20} className="text-accent" /> Backup Viewer
          </h2>
          <p className="text-[10px] text-white-40 font-bold uppercase tracking-widest">
            {selectedStorageZip ? `Viewing Rollup: ${selectedStorageZip.split(/[\\/]/).pop()}` : 'Select a storage folder from the right panel'}
          </p>
        </div>
        
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white-20" />
          <input 
            type="text"
            placeholder="Filter rollup..."
            className="pl-9 pr-4 py-2 bg-black-40 border border-white-10 rounded-md text-sm outline-none focus:border-accent-40 w-[300px]"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
          </div>
        ) : files.length > 0 ? (
          <div className="flex flex-col">
            {renderTree(treeData)}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-white-20 gap-4 p-12 text-center">
            <Layout size={48} strokeWidth={1.5} className="opacity-40" />
            <div className="flex flex-col gap-1">
              <p className="text-sm font-black uppercase tracking-widest text-white-40">
                {error ? 'Load Error' : selectedStorageZip ? 'No files found' : 'No folder selected'}
              </p>
              {error && (
                <p className="text-xs text-red-400 font-medium">
                  {error} - Make sure this folder contains <code className="bg-black-40 px-1 rounded text-accent">backup_metadata.sqlite</code>
                </p>
              )}
              {!error && !selectedStorageZip && (
                <p className="text-xs text-white-30">
                  Select a Backup Folder from the right panel to browse its contents
                </p>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
