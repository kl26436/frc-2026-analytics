import { useState, useRef, useCallback, useEffect } from 'react';
import { Bot, Send, Square, RotateCcw, Zap, ChevronDown } from 'lucide-react';
import { streamClaude, type ClaudeModel } from '../utils/claudeApi';

interface ClaudeChatProps {
  /** The system/data prompt to send (built by the caller) */
  prompt: string;
  /** Optional label shown above the response area */
  title?: string;
  /** Optional description shown below the title */
  description?: string;
  /** Default model */
  defaultModel?: ClaudeModel;
  /** Called when analysis completes with the full response text */
  onComplete?: (response: string) => void;
  /** Extra class names for the container */
  className?: string;
  /** localStorage key — when set, results are cached and restored on remount */
  cacheKey?: string;
}

interface CachedResult {
  response: string;
  usage: { input?: number; output?: number };
  model: ClaudeModel;
  savedAt: number;
}

type Status = 'idle' | 'streaming' | 'done' | 'error';

export default function ClaudeChat({
  prompt,
  title = 'AI Analysis',
  description,
  defaultModel = 'claude-haiku-4-5-20251001',
  onComplete,
  className = '',
  cacheKey,
}: ClaudeChatProps) {
  const STORAGE_KEY = cacheKey ? `claude_cache_${cacheKey}` : null;

  // Load cached result on mount
  const cached: CachedResult | null = (() => {
    if (!STORAGE_KEY) return null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as CachedResult) : null;
    } catch {
      return null;
    }
  })();

  const [response, setResponse] = useState(cached?.response ?? '');
  const [status, setStatus] = useState<Status>(cached ? 'done' : 'idle');
  const [error, setError] = useState('');
  const [model, setModel] = useState<ClaudeModel>(cached?.model ?? defaultModel);
  const [usage, setUsage] = useState<{ input?: number; output?: number }>(cached?.usage ?? {});
  const [modelOpen, setModelOpen] = useState(false);
  const abortRef = useRef(false);
  const responseRef = useRef(cached?.response ?? '');
  const usageRef = useRef<{ input?: number; output?: number }>(cached?.usage ?? {});
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll during streaming
  useEffect(() => {
    if (status === 'streaming' && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [response, status]);

  const run = useCallback(async () => {
    setResponse('');
    setError('');
    setUsage({});
    setStatus('streaming');
    abortRef.current = false;
    responseRef.current = '';
    usageRef.current = {};

    try {
      for await (const event of streamClaude(prompt, model)) {
        if (abortRef.current) break;

        switch (event.type) {
          case 'text':
            responseRef.current += event.text || '';
            setResponse(responseRef.current);
            break;
          case 'error':
            setError(event.error || 'Unknown error');
            setStatus('error');
            return;
          case 'usage':
            if (event.usage?.input_tokens) {
              usageRef.current = { ...usageRef.current, input: event.usage.input_tokens };
              setUsage(prev => ({ ...prev, input: event.usage!.input_tokens }));
            }
            break;
          case 'usage_final':
            if (event.usage?.output_tokens) {
              usageRef.current = { ...usageRef.current, output: event.usage.output_tokens };
              setUsage(prev => ({ ...prev, output: event.usage!.output_tokens }));
            }
            break;
          case 'done':
            break;
        }
      }

      if (!abortRef.current) {
        setStatus('done');
        onComplete?.(responseRef.current);
        if (STORAGE_KEY) {
          try {
            const toCache: CachedResult = {
              response: responseRef.current,
              usage: usageRef.current,
              model,
              savedAt: Date.now(),
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(toCache));
          } catch { /* quota exceeded — ignore */ }
        }
      } else {
        setStatus('idle');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Stream failed';
      setError(message);
      setStatus('error');
    }
  }, [prompt, model, onComplete]);

  const stop = useCallback(() => {
    abortRef.current = true;
    setStatus('idle');
  }, []);

  const estimatedCost = usage.input && usage.output
    ? model.includes('haiku')
      ? ((usage.input * 0.8 + usage.output * 4) / 1_000_000).toFixed(4)
      : ((usage.input * 3 + usage.output * 15) / 1_000_000).toFixed(4)
    : null;

  return (
    <div className={`bg-surface rounded-lg border border-border p-4 md:p-6 ${className}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Bot size={20} />
            {title}
          </h2>
          {description && (
            <p className="text-sm text-textSecondary mt-1">{description}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Model Selector */}
          <div className="relative">
            <button
              onClick={() => setModelOpen(!modelOpen)}
              disabled={status === 'streaming'}
              className="flex items-center gap-1.5 px-3 py-2 bg-card border border-border rounded-lg text-sm text-textSecondary hover:text-textPrimary transition-colors disabled:opacity-50"
            >
              <Zap size={14} />
              {model.includes('haiku') ? 'Haiku' : 'Sonnet'}
              <ChevronDown size={12} />
            </button>
            {modelOpen && (
              <div className="absolute right-0 top-full mt-1 bg-surface border border-border rounded-lg shadow-lg py-1 min-w-[180px] z-50">
                <button
                  onClick={() => { setModel('claude-haiku-4-5-20251001'); setModelOpen(false); }}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-interactive transition-colors ${
                    model.includes('haiku') ? 'text-success font-medium' : 'text-textSecondary'
                  }`}
                >
                  Haiku 4.5 — Fast & cheap
                </button>
                <button
                  onClick={() => { setModel('claude-sonnet-4-6'); setModelOpen(false); }}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-interactive transition-colors ${
                    model.includes('sonnet') ? 'text-success font-medium' : 'text-textSecondary'
                  }`}
                >
                  Sonnet 4 — Deeper analysis
                </button>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          {status === 'streaming' ? (
            <button
              onClick={stop}
              className="flex items-center gap-2 px-4 py-2 bg-danger/20 text-danger rounded-lg text-sm font-medium hover:bg-danger/30 transition-colors"
            >
              <Square size={14} />
              Stop
            </button>
          ) : (
            <button
              onClick={run}
              disabled={!prompt}
              className="flex items-center gap-2 px-4 py-2 bg-success/20 text-success rounded-lg text-sm font-medium hover:bg-success/30 transition-colors disabled:opacity-50"
            >
              {status === 'done' || status === 'error' ? <RotateCcw size={14} /> : <Send size={14} />}
              {status === 'done' || status === 'error' ? 'Re-run' : 'Analyze'}
            </button>
          )}
        </div>
      </div>

      {/* Response Area */}
      {(status !== 'idle' || response) && (
        <div
          ref={scrollRef}
          className="bg-card rounded-lg border border-border p-4 max-h-[600px] overflow-y-auto"
        >
          {status === 'streaming' && !response && (
            <div className="flex items-center gap-2 text-textMuted text-sm">
              <div className="w-2 h-2 bg-success rounded-full animate-pulse" />
              Thinking...
            </div>
          )}

          {response && (
            <div className="prose prose-invert prose-sm max-w-none">
              <MarkdownRenderer content={response} />
              {status === 'streaming' && (
                <span className="inline-block w-2 h-4 bg-success/60 animate-pulse ml-0.5" />
              )}
            </div>
          )}

          {error && (
            <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 text-sm text-danger">
              {error}
            </div>
          )}
        </div>
      )}

      {/* Footer — usage stats + cache info */}
      <div className="flex items-center justify-between mt-2">
        <div className="flex gap-4 text-xs text-textMuted">
          {usage.input && <span>{usage.input.toLocaleString()} input tokens</span>}
          {usage.output && <span>{usage.output.toLocaleString()} output tokens</span>}
          {estimatedCost && <span>~${estimatedCost}</span>}
        </div>
        {STORAGE_KEY && cached && status === 'done' && (
          <div className="flex items-center gap-3 text-xs text-textMuted">
            <span>Saved {new Date(cached.savedAt).toLocaleTimeString()}</span>
            <button
              onClick={() => {
                localStorage.removeItem(STORAGE_KEY);
                setResponse('');
                setUsage({});
                setStatus('idle');
                responseRef.current = '';
                usageRef.current = {};
              }}
              className="text-danger hover:text-danger/80 transition-colors"
            >
              Clear
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Simple Markdown Renderer ──────────────────────────────────────────────────

function MarkdownRenderer({ content }: { content: string }) {
  const lines = content.split('\n');
  const elements: React.ReactElement[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Headers
    if (line.startsWith('### ')) {
      elements.push(<h3 key={i} className="text-base font-bold mt-4 mb-2 text-textPrimary">{renderInline(line.slice(4))}</h3>);
      i++; continue;
    }
    if (line.startsWith('## ')) {
      elements.push(<h2 key={i} className="text-lg font-bold mt-5 mb-2 text-textPrimary">{renderInline(line.slice(3))}</h2>);
      i++; continue;
    }
    if (line.startsWith('# ')) {
      elements.push(<h1 key={i} className="text-xl font-bold mt-6 mb-3 text-textPrimary">{renderInline(line.slice(2))}</h1>);
      i++; continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      elements.push(<hr key={i} className="border-border my-4" />);
      i++; continue;
    }

    // Unordered list items
    if (/^[-*] /.test(line.trimStart())) {
      const listItems: React.ReactElement[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i].trimStart())) {
        listItems.push(<li key={i} className="ml-4">{renderInline(lines[i].trimStart().slice(2))}</li>);
        i++;
      }
      elements.push(<ul key={`ul-${i}`} className="list-disc pl-4 my-2 space-y-1">{listItems}</ul>);
      continue;
    }

    // Ordered list items
    if (/^\d+\. /.test(line.trimStart())) {
      const listItems: React.ReactElement[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i].trimStart())) {
        const text = lines[i].trimStart().replace(/^\d+\. /, '');
        listItems.push(<li key={i} className="ml-4">{renderInline(text)}</li>);
        i++;
      }
      elements.push(<ol key={`ol-${i}`} className="list-decimal pl-4 my-2 space-y-1">{listItems}</ol>);
      continue;
    }

    // Code block
    if (line.trimStart().startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      elements.push(
        <pre key={`code-${i}`} className="bg-surfaceElevated rounded-lg p-3 my-2 overflow-x-auto text-xs font-mono text-textSecondary">
          <code>{codeLines.join('\n')}</code>
        </pre>
      );
      continue;
    }

    // Table
    if (line.includes('|') && line.trim().startsWith('|')) {
      const tableRows: string[][] = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim().startsWith('|')) {
        const cells = lines[i].split('|').filter(c => c.trim() !== '').map(c => c.trim());
        // Skip separator rows (|---|---|)
        if (cells.every(c => /^[-:]+$/.test(c))) { i++; continue; }
        tableRows.push(cells);
        i++;
      }
      if (tableRows.length > 0) {
        const [header, ...body] = tableRows;
        elements.push(
          <div key={`table-${i}`} className="overflow-x-auto my-3">
            <table className="w-full text-xs border border-border">
              <thead>
                <tr className="bg-surfaceElevated">
                  {header.map((cell, ci) => (
                    <th key={ci} className="px-3 py-1.5 text-left font-semibold border-b border-border">{cell}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((row, ri) => (
                  <tr key={ri} className={ri % 2 === 0 ? 'bg-card' : ''}>
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-3 py-1.5 border-b border-border/50">{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      i++; continue;
    }

    // Paragraph
    elements.push(<p key={i} className="my-2 text-textSecondary leading-relaxed">{renderInline(line)}</p>);
    i++;
  }

  return <>{elements}</>;
}

function renderInline(text: string): React.ReactNode {
  // Bold, italic, code, inline formatting
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*|`(.+?)`|_(.+?)_)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) {
      parts.push(<strong key={key++} className="font-bold text-textPrimary">{match[2]}</strong>);
    } else if (match[3]) {
      parts.push(<code key={key++} className="bg-surfaceElevated px-1.5 py-0.5 rounded text-xs font-mono text-success">{match[3]}</code>);
    } else if (match[4]) {
      parts.push(<em key={key++}>{match[4]}</em>);
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? <>{parts}</> : text;
}
