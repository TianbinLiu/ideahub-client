import { useState, useRef, useEffect } from "react";
import { apiFetch } from "../api";

interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  maxLength?: number;
}

export function MentionTextarea({
  value,
  onChange,
  placeholder = "Write something...",
  className = "",
  disabled = false,
  maxLength,
}: MentionTextareaProps) {
  const [suggestions, setSuggestions] = useState<{ username: string; _id: string }[]>([]);
  const [highlight, setHighlight] = useState(-1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Detect @mention trigger and fetch suggestions
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursorPos = textarea.selectionStart;
    const text = value.slice(0, cursorPos);
    
    // Find the last @ symbol and text after it
    const lastAtIndex = text.lastIndexOf("@");
    if (lastAtIndex === -1) {
      setSuggestions([]);
      return;
    }

    const afterAt = text.slice(lastAtIndex + 1);
    
    // Only show suggestions if @ is followed by text (alphanumeric or non-space)
    if (!afterAt || afterAt.includes(" ")) {
      setSuggestions([]);
      return;
    }

    // Debounce suggestion fetch
    const timer = setTimeout(async () => {
      try {
        const res = await apiFetch<{ users: { username: string; _id: string }[] }>(
          `/api/users/search?q=${encodeURIComponent(afterAt)}&limit=8`
        ).catch(() => ({ users: [] }));
        setSuggestions(res.users || []);
        setHighlight(-1);
      } catch {
        setSuggestions([]);
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [value]);

  function insertMention(username: string) {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursorPos = textarea.selectionStart;
    const text = value.slice(0, cursorPos);
    
    const lastAtIndex = text.lastIndexOf("@");
    if (lastAtIndex === -1) return;

    const beforeAt = value.slice(0, lastAtIndex);
    const afterCursor = value.slice(cursorPos);
    const newValue = `${beforeAt}@${username} ${afterCursor}`;
    
    onChange(newValue);
    setSuggestions([]);
    
    // Restore cursor position
    setTimeout(() => {
      const newCursorPos = lastAtIndex + username.length + 2;
      textarea.focus();
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight(h => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight(h => Math.max(h - 1, -1));
    } else if (e.key === "Enter" && highlight >= 0) {
      e.preventDefault();
      insertMention(suggestions[highlight].username);
    } else if (e.key === "Tab" && highlight >= 0) {
      e.preventDefault();
      insertMention(suggestions[highlight].username);
    }
  }

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={maxLength}
        className={className}
      />
      
      {suggestions.length > 0 && (
        <div
          ref={suggestionsRef}
          className="absolute top-full left-0 mt-1 w-48 bg-gray-800 border border-gray-700 rounded-lg z-50 max-h-40 overflow-y-auto"
        >
          {suggestions.map((u, idx) => (
            <div
              key={u._id}
              className={`px-3 py-2 cursor-pointer text-sm ${
                idx === highlight ? "bg-gray-700" : ""
              } hover:bg-gray-700`}
              onMouseEnter={() => setHighlight(idx)}
              onMouseLeave={() => setHighlight(-1)}
              onClick={() => insertMention(u.username)}
            >
              @{u.username}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
