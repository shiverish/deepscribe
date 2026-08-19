import React, { useState, useEffect } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { db } from '../../db/db';
import { createId } from '../../db/operations';
import {
  MAX_ARCHIVE_FILE_BYTES,
  MAX_ATTACHMENT_BYTES,
  MAX_PROJECT_JSON_CHARS,
  MAX_TOTAL_ATTACHMENT_BYTES,
  parseProjectArchive
} from '../../db/archive';
import type { Attachment, Project } from '../../types';
import { Download, Upload, X, FileArchive } from 'lucide-react';

interface ExportImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshData: () => void;
}

export const ExportImportModal: React.FC<ExportImportModalProps> = ({
  isOpen,
  onClose,
  onRefreshData
}) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('');

  useEffect(() => {
    if (!isOpen) return;
    db.projects.filter(project => !project.isTrash).toArray().then(projs => {
      setProjects(projs);
      setSelectedProjectId(current => projs.some(project => project.id === current) ? current : (projs[0]?.id ?? ''));
    });
    setStatusMessage('');

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleExportProject = async () => {
    if (!selectedProjectId) return;
    setIsExporting(true);
    setStatusMessage('Archief wordt samengesteld...');

    try {
      const project = await db.projects.get(selectedProjectId);
      if (!project) return;

      const blocks = await db.blocks.where('projectId').equals(selectedProjectId).toArray();
      const blockIds = blocks.map(b => b.id);
      const attachments = await db.attachments.where('blockId').anyOf(blockIds).toArray();
      const revisions = blockIds.length > 0 ? await db.revisions.where('blockId').anyOf(blockIds).toArray() : [];

      const zip = new JSZip();

      const exportData = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        project,
        blocks,
        revisions,
        attachmentsMeta: attachments.map(a => ({
          id: a.id,
          blockId: a.blockId,
          fileName: a.fileName,
          fileType: a.fileType,
          fileSize: a.fileSize,
          createdAt: a.createdAt
        }))
      };

      zip.file('project.json', JSON.stringify(exportData, null, 2));

      const attachmentsFolder = zip.folder('attachments');
      if (attachmentsFolder) {
        for (const att of attachments) {
          const base64Data = att.dataUrl
            ? (att.dataUrl.split(',')[1] || att.dataUrl)
            : att.localPath && window.electronAPI?.readAttachment
              ? await window.electronAPI.readAttachment(att.localPath)
              : null;
          if (!base64Data) throw new Error(`Bijlage “${att.fileName}” is niet meer beschikbaar.`);
          attachmentsFolder.file(att.id + '_' + att.fileName, base64Data, { base64: true });
        }
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const safeTitle = project.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      saveAs(content, `${safeTitle}_archive.deepscribe`);

      setStatusMessage('Export voltooid! Bestand is gedownload.');
    } catch (err) {
      console.error(err);
      setStatusMessage('Fout bij exporteren.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (file.size > MAX_ARCHIVE_FILE_BYTES) {
      setStatusMessage('Fout: dit archief is groter dan 250 MB.');
      return;
    }

    setIsImporting(true);
    setStatusMessage('Archief wordt ingelezen...');

    try {
      const zip = await JSZip.loadAsync(file);
      const jsonFile = zip.file('project.json');
      if (!jsonFile) {
        setStatusMessage('Fout: ongeldig DeepScribe archief (project.json ontbreekt).');
        setIsImporting(false);
        return;
      }

      const jsonStr = await jsonFile.async('string');
      if (jsonStr.length > MAX_PROJECT_JSON_CHARS) throw new Error('project.json is te groot.');
      const data = parseProjectArchive(JSON.parse(jsonStr) as unknown);

      const projectId = createId('proj');
      const blockIdMap = new Map(data.blocks.map(block => [block.id, createId('block')]));
      const currentProjects = await db.projects.filter(project => !project.isTrash).toArray();
      const project: Project = {
        ...data.project,
        id: projectId,
        order: currentProjects.reduce((highest, current) => Math.max(highest, current.order ?? -1), -1) + 1,
        isTrash: false,
        trashedAt: undefined,
        updatedAt: Date.now()
      };
      const blocks = data.blocks.map(block => ({
        ...block,
        id: blockIdMap.get(block.id)!,
        projectId,
        parentId: block.parentId ? blockIdMap.get(block.parentId)! : null
      }));
      const revisions = (data.revisions ?? []).map(revision => ({
        ...revision,
        id: createId('revision'),
        blockId: blockIdMap.get(revision.blockId)!,
        projectId
      }));

      const attachments: Attachment[] = [];
      let totalAttachmentBytes = 0;
      const attachmentsFolder = zip.folder('attachments');
      for (const meta of data.attachmentsMeta) {
        if (meta.fileSize > MAX_ATTACHMENT_BYTES) throw new Error(`Bijlage “${meta.fileName}” is groter dan 25 MB.`);
        totalAttachmentBytes += meta.fileSize;
        if (totalAttachmentBytes > MAX_TOTAL_ATTACHMENT_BYTES) throw new Error('De bijlagen zijn samen groter dan 150 MB.');
        const fileInZip = attachmentsFolder?.file(meta.id + '_' + meta.fileName);
        if (!fileInZip) throw new Error(`Bijlage ontbreekt in archief: ${meta.fileName}.`);
        const base64 = await fileInZip.async('base64');
        const blockId = blockIdMap.get(meta.blockId)!;
        const attachmentId = createId('attachment');
        if (window.electronAPI?.importAttachment) {
          const stored = await window.electronAPI.importAttachment({
            projectId,
            blockId,
            fileName: meta.fileName,
            base64
          });
          attachments.push({ ...meta, id: attachmentId, blockId, localPath: stored.localPath });
        } else {
          attachments.push({ ...meta, id: attachmentId, blockId, dataUrl: `data:${meta.fileType};base64,${base64}` });
        }
      }

      await db.transaction('rw', db.projects, db.blocks, db.attachments, db.revisions, async () => {
        await db.projects.add(project);
        await db.blocks.bulkAdd(blocks);
        if (attachments.length) await db.attachments.bulkAdd(attachments);
        if (revisions.length) await db.revisions.bulkAdd(revisions);
      });

      setStatusMessage(data.normalizedTagBlocks > 0
        ? `Import afgerond. Tags in ${data.normalizedTagBlocks} blok${data.normalizedTagBlocks === 1 ? '' : 'ken'} zijn opgeschoond.`
        : 'Import succesvol afgerond! Project is hersteld.');
      onRefreshData();
    } catch (err) {
      console.error(err);
      setStatusMessage(err instanceof Error ? `Import afgebroken: ${err.message}` : 'Fout bij importeren van archief.');
    } finally {
      setIsImporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(7, 10, 18, 0.8)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '520px',
          maxWidth: '90vw',
          background: 'var(--bg-surface)',
          backdropFilter: 'var(--glass-backdrop)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 0 30px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(10, 15, 26, 0.8)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '1rem', fontWeight: 600 }}>
            <FileArchive size={18} color="#00F0FF" />
            <span>Project Exporteren & Importeren</span>
          </div>

          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ background: 'var(--bg-card)', padding: 16, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <h4 style={{ color: 'var(--neon-cyan)', marginBottom: 8, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Download size={16} /> Exporteer Project (.deepscribe)
            </h4>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 12 }}>
              Exporteer een compleet project inclusief alle tekstblokken, hiërarchische niveaus en bijlagen als een draagbaar archief.
            </p>

            <div style={{ display: 'flex', gap: 10 }}>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                style={{
                  flex: 1,
                  background: 'rgba(7, 10, 18, 0.8)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '6px',
                  color: 'var(--text-primary)',
                  padding: '8px 12px',
                  outline: 'none',
                  fontSize: '0.85rem'
                }}
              >
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>

              <button
                onClick={handleExportProject}
                disabled={isExporting || !selectedProjectId}
                style={{
                  background: 'rgba(0, 240, 255, 0.12)',
                  border: '1px solid var(--neon-cyan)',
                  color: 'var(--neon-cyan)',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <Download size={14} />
                <span>{isExporting ? 'Exporteren...' : 'Download'}</span>
              </button>
            </div>
          </div>

          <div style={{ background: 'var(--bg-card)', padding: 16, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <h4 style={{ color: 'var(--neon-magenta)', marginBottom: 8, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Upload size={16} /> Importeer Project Archief
            </h4>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 12 }}>
              Laad een eerder geëxporteerd `.deepscribe` of `.zip` archief in.
            </p>

            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                background: 'rgba(255, 0, 127, 0.12)',
                border: '1px dashed var(--neon-magenta)',
                color: 'var(--neon-magenta)',
                padding: '10px 16px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: 600,
                width: '100%'
              }}
            >
              <Upload size={16} />
              <span>Selecteer .deepscribe bestand</span>
              <input type="file" accept=".deepscribe,.zip" style={{ display: 'none' }} onChange={handleImportFile} disabled={isImporting} />
            </label>
          </div>

          {statusMessage && (
            <div
              style={{
                padding: '10px 14px',
                background: 'rgba(0, 240, 255, 0.08)',
                border: '1px solid var(--border-card)',
                borderRadius: '6px',
                color: 'var(--text-primary)',
                fontSize: '0.8rem'
              }}
            >
              {statusMessage}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
