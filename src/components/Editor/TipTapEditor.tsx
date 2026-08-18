import React, { useCallback, useEffect, useImperativeHandle, useState, forwardRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { extractTipTapTaskStats } from './tipTapTaskExtraction';

import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Code,
  Table as TableIcon,
  Link as LinkIcon,
  Undo,
  Redo,
  Upload
} from 'lucide-react';

export interface TipTapEditorHandle {
  focus: () => void;
}

interface TipTapEditorProps {
  content: string;
  onChange: (html: string, plainText: string, taskCount: number, completedTaskCount: number) => void;
  onBlur?: () => void;
  onUploadImage?: (file: File) => Promise<string>;
  onReturnFocusToCards?: () => void;
}

export const TipTapEditor = forwardRef<TipTapEditorHandle, TipTapEditorProps>(({
  content,
  onChange,
  onBlur,
  onUploadImage,
  onReturnFocusToCards
}, ref) => {
  const [isImageDragActive, setIsImageDragActive] = useState(false);

  const resolveImageSource = useCallback(async (file: File): Promise<string> => {
    if (!file.type.startsWith('image/')) throw new Error(`“${file.name}” is geen afbeelding.`);
    if (file.size > 5 * 1024 * 1024) throw new Error(`“${file.name}” is groter dan 5 MB.`);
    if (onUploadImage) return await onUploadImage(file);

    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('De afbeelding kon niet worden gelezen.'));
      reader.onerror = () => reject(new Error('De afbeelding kon niet worden gelezen.'));
      reader.readAsDataURL(file);
    });
  }, [onUploadImage]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] }
      }),
      Underline,
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Image.configure({ inline: true, allowBase64: true }),
      Link.configure({
        autolink: true,
        linkOnPaste: true,
        openOnClick: false,
        HTMLAttributes: {
          target: '_blank',
          rel: 'noopener noreferrer'
        }
      })
    ],
    content: content || '<p></p>',
    editorProps: {
      handleKeyDown: (_view, event) => {
        if (event.key === 'Escape') {
          if (editor) editor.commands.blur();
          if (onReturnFocusToCards) onReturnFocusToCards();
          return true;
        }
        return false;
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false;
        const images = Array.from(event.dataTransfer?.files ?? []).filter(file => file.type.startsWith('image/'));
        if (images.length === 0) return false;
        event.preventDefault();
        setIsImageDragActive(false);

        const dropPosition = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? view.state.selection.from;
        void (async () => {
          let position = dropPosition;
          for (const file of images) {
            try {
              const src = await resolveImageSource(file);
              const imageNode = view.state.schema.nodes.image.create({ src, alt: file.name, title: file.name });
              const safePosition = Math.min(position, view.state.doc.content.size);
              view.dispatch(view.state.tr.insert(safePosition, imageNode));
              position = safePosition + imageNode.nodeSize;
            } catch (error) {
              window.alert(error instanceof Error ? error.message : 'De afbeelding kon niet worden ingevoegd.');
            }
          }
          view.focus();
        })();
        return true;
      }
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      const plainText = editor.getText();

      const { taskCount, completedTaskCount } = extractTipTapTaskStats(editor.getJSON());

      onChange(html, plainText, taskCount, completedTaskCount);
    },
    onBlur: () => {
      if (onBlur) onBlur();
    }
  }, [resolveImageSource]);

  useImperativeHandle(ref, () => ({
    focus: () => {
      if (editor) {
        editor.chain().focus().run();
      }
    }
  }), [editor]);

  useEffect(() => {
    if (editor && !editor.isFocused && content !== editor.getHTML()) {
      editor.commands.setContent(content || '<p></p>');
    }
  }, [content, editor]);

  if (!editor) return null;

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0 || !editor) return;
    for (const file of files) {
      try {
        const url = await resolveImageSource(file);
        editor.chain().focus().setImage({ src: url }).run();
      } catch (error) {
        console.error(error);
        window.alert(error instanceof Error ? error.message : 'De afbeelding kon niet worden opgeslagen.');
      }
    }
  };

  const handleAddLink = () => {
    const url = window.prompt('Voer de URL in:');
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="editor-toolbar">
        <button
          className={`toolbar-btn ${editor.isActive('bold') ? 'is-active' : ''}`}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Vet (Ctrl+B)"
        >
          <Bold size={15} />
        </button>

        <button
          className={`toolbar-btn ${editor.isActive('italic') ? 'is-active' : ''}`}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Cursief (Ctrl+I)"
        >
          <Italic size={15} />
        </button>

        <button
          className={`toolbar-btn ${editor.isActive('underline') ? 'is-active' : ''}`}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          title="Onderstreept (Ctrl+U)"
        >
          <UnderlineIcon size={15} />
        </button>

        <div className="toolbar-divider" />

        <button
          className={`toolbar-btn ${editor.isActive('heading', { level: 1 }) ? 'is-active' : ''}`}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          title="Kop 1"
        >
          <Heading1 size={15} />
        </button>

        <button
          className={`toolbar-btn ${editor.isActive('heading', { level: 2 }) ? 'is-active' : ''}`}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          title="Kop 2"
        >
          <Heading2 size={15} />
        </button>

        <button
          className={`toolbar-btn ${editor.isActive('heading', { level: 3 }) ? 'is-active' : ''}`}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          title="Kop 3"
        >
          <Heading3 size={15} />
        </button>

        <div className="toolbar-divider" />

        <button
          className={`toolbar-btn ${editor.isActive('bulletList') ? 'is-active' : ''}`}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="Opsomming"
        >
          <List size={15} />
        </button>

        <button
          className={`toolbar-btn ${editor.isActive('orderedList') ? 'is-active' : ''}`}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="Genummerde lijst"
        >
          <ListOrdered size={15} />
        </button>

        <button
          className={`toolbar-btn ${editor.isActive('taskList') ? 'is-active' : ''}`}
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          title="Takenlijst"
        >
          <CheckSquare size={15} />
        </button>

        <div className="toolbar-divider" />

        <button
          className={`toolbar-btn ${editor.isActive('blockquote') ? 'is-active' : ''}`}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          title="Citaat"
        >
          <Quote size={15} />
        </button>

        <button
          className={`toolbar-btn ${editor.isActive('codeBlock') ? 'is-active' : ''}`}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          title="Codeblok"
        >
          <Code size={15} />
        </button>

        <button
          className={`toolbar-btn ${editor.isActive('table') ? 'is-active' : ''}`}
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          title="Tabel invoegen"
        >
          <TableIcon size={15} />
        </button>

        <button
          className={`toolbar-btn ${editor.isActive('link') ? 'is-active' : ''}`}
          onClick={handleAddLink}
          title="Link invoegen"
        >
          <LinkIcon size={15} />
        </button>

        <label className="toolbar-btn" title="Afbeelding uploaden" style={{ cursor: 'pointer' }}>
          <Upload size={15} />
          <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleImageFileChange} />
        </label>

        <div className="toolbar-divider" />

        <button
          className="toolbar-btn"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="Ongedaan maken (Ctrl+Z)"
        >
          <Undo size={15} />
        </button>

        <button
          className="toolbar-btn"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="Opnieuw (Ctrl+Y)"
        >
          <Redo size={15} />
        </button>
      </div>

      <div
        className={`editor-content-area ${isImageDragActive ? 'image-drag-active' : ''}`}
        onDragEnter={event => {
          if (event.dataTransfer.types.includes('Files')) setIsImageDragActive(true);
        }}
        onDragOver={event => {
          if (event.dataTransfer.types.includes('Files')) event.preventDefault();
        }}
        onDragLeave={event => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsImageDragActive(false);
        }}
        onDrop={() => setIsImageDragActive(false)}
        onClick={() => {
          if (editor && !editor.isFocused) {
            editor.chain().focus().run();
          }
        }}
      >
        <EditorContent editor={editor} />
        {isImageDragActive && (
          <div className="image-drop-overlay" aria-hidden="true">
            <Upload size={22} />
            <span>Laat afbeeldingen los om ze in te voegen</span>
          </div>
        )}
      </div>
    </div>
  );
});

TipTapEditor.displayName = 'TipTapEditor';
