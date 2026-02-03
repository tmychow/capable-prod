"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";

interface MarkdownProps {
  children: string;
  className?: string;
}

export function Markdown({ children, className = "" }: MarkdownProps) {
  return (
    <div className={`prose prose-sm dark:prose-invert max-w-none prose-p:my-2 prose-headings:my-3 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-pre:bg-zinc-100 prose-pre:dark:bg-zinc-800 prose-code:text-sm prose-code:before:content-none prose-code:after:content-none ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              {children}
            </a>
          ),
          code: ({ className, children, ...props }) => {
            const isInline = !className;
            if (isInline) {
              return (
                <code
                  className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-sm font-mono"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
