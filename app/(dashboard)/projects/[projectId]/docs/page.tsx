'use client'
import { useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { FileText, Folder, FolderOpen } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import type { Components } from 'react-markdown'
import { useDocsTree, type DocsTreeNode } from '@/hooks/useDocs'
import { DocActionModal, type DocActionPhase } from '@/components/docs/DocActionModal'

const markdownComponents: Components = {
  h1: ({ children }) => <h1 className="text-2xl font-bold text-text-primary mt-0 mb-4 leading-tight">{children}</h1>,
  h2: ({ children }) => <h2 className="text-lg font-semibold text-text-primary mt-7 mb-3 pb-2 border-b border-border-default">{children}</h2>,
  h3: ({ children }) => <h3 className="text-base font-semibold text-text-primary mt-5 mb-2">{children}</h3>,
  p: ({ children }) => <p className="text-sm text-text-primary leading-7 mb-4">{children}</p>,
  ul: ({ children }) => <ul className="mb-4 space-y-1 pl-5 list-disc marker:text-text-faint">{children}</ul>,
  ol: ({ children }) => <ol className="mb-4 space-y-1 pl-5 list-decimal marker:text-text-muted">{children}</ol>,
  li: ({ children }) => <li className="text-sm text-text-primary leading-7 pl-1">{children}</li>,
  blockquote: ({ children }) => <blockquote className="my-4 pl-4 border-l-2 border-accent-blue text-text-secondary italic [&>p]:mb-0">{children}</blockquote>,
  code: ({ className, children }) => className?.startsWith('language-')
    ? <code className={`${className} text-[13px] leading-relaxed`}>{children}</code>
    : <code className="text-[13px] font-mono bg-bg-secondary text-accent-blue rounded px-1.5 py-0.5 border border-border-strong">{children}</code>,
  pre: ({ children }) => <pre className="my-4 rounded-lg bg-[#0d1117] border border-border-default p-4 overflow-x-auto text-[13px] leading-relaxed">{children}</pre>,
}

function countNodes(node: DocsTreeNode): { folders: number; files: number } {
  if (node.type === 'file') return { folders: 0, files: 1 }
  return (node.children ?? []).reduce(
    (acc, child) => {
      const next = countNodes(child)
      return { folders: acc.folders + next.folders, files: acc.files + next.files }
    },
    { folders: 1, files: 0 },
  )
}

function countAll(nodes: DocsTreeNode[]): { folders: number; files: number } {
  return nodes.reduce(
    (acc, node) => {
      const next = countNodes(node)
      return { folders: acc.folders + next.folders, files: acc.files + next.files }
    },
    { folders: 0, files: 0 },
  )
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })
}

const NO_SELECTION_PATH = '__none__'

export default function DocsPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { data, isLoading, isError, refetch } = useDocsTree(projectId)
  const [selected, setSelected] = useState<DocsTreeNode | null>(null)
  const [actionPhase, setActionPhase] = useState<DocActionPhase | null>(null)

  const nodes = data?.nodes ?? []
  const counts = useMemo(() => countAll(nodes), [nodes])
  const headerFolder = selected?.type === 'folder' ? selected : null

  if (isLoading) return <div className="text-text-secondary text-sm">Loading docs...</div>
  if (isError) return <div className="text-accent-red text-sm">Failed to load docs.</div>

  if (nodes.length === 0) {
    return (
      <div>
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-text-primary">Docs</h1>
          <p className="text-xs text-text-muted mt-0.5">No markdown files found in this project.</p>
        </div>
        <div className="border border-dashed border-border-default rounded-[8px] p-8 text-center">
          <div className="text-text-secondary text-sm">Add a `.md` file anywhere in the project to populate this view.</div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">Docs</h1>
          <p className="text-xs text-text-muted mt-0.5">
            {counts.folders} folder{counts.folders === 1 ? '' : 's'} · {counts.files} file{counts.files === 1 ? '' : 's'}
          </p>
        </div>
        {headerFolder && (
          <div className="text-right max-w-[55%]">
            <div className="text-[10px] uppercase tracking-[0.04em] text-text-faint mb-1">Folder</div>
            <div className="text-text-primary text-[13px] font-mono truncate">{headerFolder.relativePath}</div>
            <div className="text-text-muted text-[11px] mt-1">
              {headerFolder.children?.length ?? 0} item{(headerFolder.children?.length ?? 0) === 1 ? '' : 's'} · modified {formatDate(headerFolder.modifiedAt)}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-[minmax(320px,520px)_1fr] gap-4 flex-1 min-h-0">
        <div className="bg-bg-primary border border-border-default rounded-[8px] overflow-hidden min-h-0">
          <div className="px-4 py-3 border-b border-border-default text-[11px] uppercase tracking-[0.04em] text-text-muted">
            Project docs
          </div>
          <div className="p-2 overflow-y-auto h-full">
            {nodes.map((node) => (
              <TreeNode
                key={node.relativePath}
                node={node}
                depth={0}
                selectedPath={selected?.relativePath ?? NO_SELECTION_PATH}
                onSelect={setSelected}
              />
            ))}
          </div>
        </div>

        <div className="bg-bg-primary border border-border-default rounded-[8px] min-h-0 overflow-hidden">
          {selected ? (
            <div className="h-full flex flex-col">
              <div className="px-5 py-4 border-b border-border-default flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    {selected.type === 'folder'
                      ? <FolderOpen size={16} className="text-accent-blue flex-shrink-0" />
                      : <FileText size={16} className="text-text-secondary flex-shrink-0" />
                    }
                    <h2 className="text-text-primary text-base font-semibold truncate">{selected.name}</h2>
                  </div>
                  <div className="text-text-faint text-xs mt-1 font-mono">{selected.relativePath}</div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <DocActionButton label="Brainstorm" onClick={() => setActionPhase('brainstorm')} />
                  <DocActionButton label="Make spec" onClick={() => setActionPhase('spec')} />
                  <DocActionButton label="Make plan" onClick={() => setActionPhase('plan')} />
                  <DocActionButton label="Develop" onClick={() => setActionPhase('develop')} />
                </div>
              </div>
              {selected.type === 'file' && /\.mdx?$/i.test(selected.name) ? (
                <div className="flex-1 overflow-y-auto px-7 py-6">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={markdownComponents}>
                    {selected.content ?? ''}
                  </ReactMarkdown>
                </div>
              ) : (
                <div className="p-5 grid grid-cols-2 gap-3 text-sm">
                  <Detail label="Type" value={selected.type} />
                  <Detail label="Size" value={formatBytes(selected.size)} />
                  <Detail label="Modified" value={formatDate(selected.modifiedAt)} />
                  {selected.type === 'folder' && (
                    <Detail label="Children" value={`${selected.children?.length ?? 0}`} />
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-text-muted text-sm">
              Select a folder or file from the docs tree.
            </div>
          )}
        </div>
      </div>
      {actionPhase && selected && (
        <DocActionModal
          open
          projectId={projectId}
          phase={actionPhase}
          sourceFile={selected.relativePath}
          sourceName={selected.name}
          onClose={() => setActionPhase(null)}
          onStarted={() => { void refetch() }}
        />
      )}
    </div>
  )
}

function DocActionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[6px] px-2.5 py-1 text-[12px] bg-bg-secondary text-text-secondary border border-border-default hover:bg-bg-tertiary hover:text-text-primary"
    >
      {label}
    </button>
  )
}

function TreeNode({
  node,
  depth,
  selectedPath,
  onSelect,
}: {
  node: DocsTreeNode
  depth: number
  selectedPath: string
  onSelect: (node: DocsTreeNode) => void
}) {
  const [expanded, setExpanded] = useState(depth < 1)
  const isFolder = node.type === 'folder'
  const isSelected = selectedPath === node.relativePath
  const children = node.children ?? []

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          onSelect(node)
          if (isFolder) setExpanded((value) => !value)
        }}
        className={`w-full flex items-center gap-2 rounded-[6px] px-2 py-1.5 text-left ${
          isSelected ? 'bg-bg-tertiary text-text-primary' : 'text-text-secondary hover:bg-bg-secondary hover:text-text-primary'
        }`}
        style={{ paddingLeft: 8 + depth * 14 }}
      >
        {isFolder
          ? expanded
            ? <FolderOpen size={14} className="text-accent-blue flex-shrink-0" />
            : <Folder size={14} className="text-accent-blue flex-shrink-0" />
          : <FileText size={14} className="text-text-muted flex-shrink-0" />
        }
        <span className="text-[13px] truncate">{node.name}</span>
        {isFolder && (
          <span className="ml-auto text-[10px] text-text-faint">{children.length}</span>
        )}
      </button>
      {isFolder && expanded && children.length > 0 && (
        <div>
          {children.map((child) => (
            <TreeNode
              key={child.relativePath}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-bg-secondary rounded-[6px] px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.04em] text-text-faint mb-1">{label}</div>
      <div className="text-text-primary text-[13px]">{value}</div>
    </div>
  )
}
