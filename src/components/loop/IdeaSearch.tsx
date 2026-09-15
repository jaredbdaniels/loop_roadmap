"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { STAGE_COLORS } from "@/lib/loop/constants";
import { searchItems } from "@/lib/loop/logic";
import type { Item } from "@/lib/loop/types";
import { useLoop } from "./store";

const MAX_RESULTS = 8;

function isTypingElsewhere(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

// The one search box that can find any idea regardless of which view, team
// filter, or "show killed" toggle is currently active — see `searchItems` in
// logic.ts. Lives in the top bar so it's available in every view, read-only
// share links included.
export function IdeaSearch() {
  const { items, openDetail } = useLoop();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const results = useMemo(
    () => searchItems(items, query, MAX_RESULTS),
    [items, query],
  );

  useEffect(() => setHighlighted(0), [query]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  // "/" jumps to the search box from anywhere in the app, the way it does in
  // most search-first tools — skipped while the reader is already typing into
  // some other field so it doesn't steal a literal "/" from a URL or note.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "/" && !isTypingElsewhere(document.activeElement)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const selectResult = (item: Item) => {
    openDetail(item.id);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  };

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => (h + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => (h - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      selectResult(results[highlighted]);
    }
  };

  const showPanel = open && query.trim().length > 0;

  return (
    <div className="idea-search" ref={rootRef}>
      <Search size={15} strokeWidth={2.2} className="idea-search-icon" aria-hidden />
      <input
        ref={inputRef}
        type="text"
        className="idea-search-input"
        placeholder="Search ideas…"
        aria-label="Search ideas"
        role="combobox"
        aria-expanded={showPanel}
        aria-autocomplete="list"
        aria-controls="idea-search-panel"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onInputKeyDown}
      />
      {!query && <kbd className="idea-search-kbd">/</kbd>}
      {query && (
        <button
          type="button"
          className="idea-search-clear"
          aria-label="Clear search"
          onClick={() => {
            setQuery("");
            inputRef.current?.focus();
          }}
        >
          <X size={13} strokeWidth={2.4} />
        </button>
      )}
      {showPanel && (
        <div className="idea-search-panel" id="idea-search-panel" role="listbox">
          {results.length === 0 ? (
            <div className="idea-search-empty">
              No ideas match “{query.trim()}”.
            </div>
          ) : (
            results.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={idx === highlighted}
                className={
                  "idea-search-result" + (idx === highlighted ? " active" : "")
                }
                onMouseEnter={() => setHighlighted(idx)}
                onClick={() => selectResult(item)}
              >
                <span
                  className="idea-search-result-stage"
                  style={{ background: STAGE_COLORS[item.stage] }}
                  aria-hidden
                />
                <span className="idea-search-result-body">
                  <span className="idea-search-result-title">{item.title}</span>
                  <span className="idea-search-result-meta">
                    {item.stage}
                    {item.mission && ` · ${item.mission}`}
                    {item.owner && ` · ${item.owner}`}
                    {item.killed && " · Killed"}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
