"use client";

import { Bot } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent as ReactClipboardEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { AgentAvatar } from "@/components/features/agents/AgentAvatar";
import { Badge } from "@/components/ui/Badge";
import { cx } from "@/components/ui/classes";
import type { Agent } from "@/lib/types";
import {
  automaticMentionSpaceAtCaretBoundary,
  editorText,
  insertLineBreak,
  insertPlainText,
  mentionTokenAtCaretBoundary,
  placeCaretAtChildOffset,
  placeCaretAtEnd,
  rangeFromTextOffsets,
  readEditorSelection,
  restoreEditorSelection,
  serializeEditor,
} from "./composer-dom";
import { shouldRestoreComposerFocus } from "./composer-focus";
import {
  measurePickerFrame,
  pickerOptionDescription,
  pickerOptionKey,
  pickerOptionText,
  rankAgentMentions,
  type PickerFrame,
  type PickerOption,
} from "./composer-picker";
import { createMentionToken, renderEditorValue, truncateComposerValue } from "./composer-tokens";

const MESSAGE_TEXT_LIMIT = 100_000;
const EDGE_EPSILON = 2;

interface ComposerEditorProps {
  agentId: string | undefined;
  /** The agents an `@` can name. */
  agents: Agent[];
  value: string;
  placeholder: string;
  ariaLabel: string;
  disabled: boolean;
  /** `compact` is one short line. */
  size?: "default" | "compact";
  focusRequest?: number;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  /** Tab sends the message into the agent's running turn. Absent, Tab moves the focus as usual. */
  onSteer?: (() => void) | undefined;
  /** Told when the mention picker opens or closes, so the queue panel can give up the same space. */
  onPickerOpenChange?: (open: boolean) => void;
}

interface MentionContext {
  query: string;
  start: number;
  end: number;
}

export function ComposerEditor(props: ComposerEditorProps) {
  const { agentId, agents, value, disabled, focusRequest = 0 } = props;
  const editorRef = useRef<HTMLDivElement>(null);
  const [mention, setMentionState] = useState<MentionContext | null>(null);
  const mentionRef = useRef<MentionContext | null>(null);
  const [activeOption, setActiveOptionState] = useState(0);
  const [pickerFrame, setPickerFrame] = useState<PickerFrame>({ mount: undefined, bottom: 0 });
  const [fades, setFades] = useState({ top: false, bottom: false });
  const listRef = useRef<HTMLDivElement>(null);
  const optionElements = useRef(new Map<string, HTMLElement>());
  const [compositionRevision, setCompositionRevision] = useState(0);

  const lastAgentId = useRef<string | undefined | null>(null);
  const lastEmittedValue = useRef("");
  const lastFocusRequest = useRef(0);
  const savedCaret = useRef<number | null>(null);
  const composing = useRef(false);
  const caretFrame = useRef<number | undefined>(undefined);

  const setMention = (next: MentionContext | null) => {
    mentionRef.current = next;
    setMentionState(next);
  };

  /*
   * Measured again on every keystroke, and almost always the same two values. Keeping the old
   * object when nothing moved stops the picker from replaying its entrance animation per character.
   */
  const updatePickerFrame = (editor: HTMLElement) => {
    const next = measurePickerFrame(editor);
    setPickerFrame((previous) => (previous.mount === next.mount && previous.bottom === next.bottom ? previous : next));
  };

  const matchingOptions = useMemo<PickerOption[]>(() => {
    if (!mention) return [];
    const others = agents.filter((agent) => agent.id !== agentId);
    return rankAgentMentions(others, mention.query).map((agent) => ({ type: "agent" as const, agent }));
  }, [agents, agentId, mention]);
  const pickerOpen = mention !== null && matchingOptions.length > 0;

  const onPickerOpenChange = props.onPickerOpenChange;
  useEffect(() => {
    onPickerOpenChange?.(pickerOpen);
  }, [pickerOpen, onPickerOpenChange]);

  const measureFades = () => {
    const list = listRef.current;
    if (!list) return;
    const remaining = list.scrollHeight - list.scrollTop - list.clientHeight;
    const next = { top: list.scrollTop > EDGE_EPSILON, bottom: remaining > EDGE_EPSILON };
    setFades((previous) => (previous.top === next.top && previous.bottom === next.bottom ? previous : next));
  };
  // The list has no scrollbar, so the fade is the only sign that more options wait below it.
  useEffect(() => {
    if (!pickerOpen) return;
    const frame = window.requestAnimationFrame(measureFades);
    return () => window.cancelAnimationFrame(frame);
  }, [pickerOpen, matchingOptions.length]);

  function scheduleCaretScroll() {
    const editor = editorRef.current;
    const view = editor?.ownerDocument.defaultView;
    if (!view || caretFrame.current !== undefined) return;
    caretFrame.current = view.requestAnimationFrame(() => {
      caretFrame.current = undefined;
      const surface = editorRef.current;
      if (!surface || surface.ownerDocument.activeElement !== surface) return;
      const selection = readEditorSelection(surface);
      if (!selection) return;
      const range = rangeFromTextOffsets(surface, selection.focus, selection.focus);
      if (!range) return;
      const text = editorText(surface);
      const trailingLine =
        selection.focus === text.length && text.endsWith("\n") && surface.lastChild instanceof HTMLBRElement ? surface.lastChild : null;
      const rect = trailingLine?.getBoundingClientRect() ?? range.getClientRects?.()[0];
      if (!rect?.height || !surface.offsetHeight) return;
      const box = surface.getBoundingClientRect();
      const scale = box.height / surface.offsetHeight;
      if (rect.top < box.top) surface.scrollTop += Math.floor((rect.top - box.top) / scale);
      else if (rect.bottom > box.bottom) surface.scrollTop += Math.ceil((rect.bottom - box.bottom) / scale);
    });
  }

  function emitValue() {
    const editor = editorRef.current;
    if (!editor) return;
    let next = serializeEditor(editor);
    if (next.length > MESSAGE_TEXT_LIMIT) {
      next = truncateComposerValue(next, MESSAGE_TEXT_LIMIT);
      renderEditorValue(editor, next, agents);
      placeCaretAtEnd(editor);
    }
    lastEmittedValue.current = next;
    props.onValueChange(next);
    scheduleCaretScroll();
  }

  function mentionAtSelection(): MentionContext | null {
    const editor = editorRef.current;
    if (!editor) return null;
    const selection = readEditorSelection(editor);
    if (!selection || selection.anchor !== selection.focus) return null;
    const beforeCaret = editorText(editor).slice(0, selection.focus);
    const match = beforeCaret.match(/(?:^|\s)@([^@$\n\uFFFC]{0,60})$/u);
    if (!match) return null;
    const query = match[1] ?? "";
    return { query, start: beforeCaret.length - query.length - 1, end: beforeCaret.length };
  }

  function updateMention() {
    const next = mentionAtSelection();
    const current = mentionRef.current;
    const editor = editorRef.current;
    if (next && editor) updatePickerFrame(editor);
    if (current?.start === next?.start && current?.end === next?.end && current?.query === next?.query) return;
    setMention(next);
    setActiveOptionState(0);
  }

  function ensureEditorSelection() {
    const editor = editorRef.current;
    if (editor && !readEditorSelection(editor)) placeCaretAtEnd(editor);
  }

  function insertOption(option: PickerOption) {
    const editor = editorRef.current;
    const context = mentionRef.current;
    if (!editor || !context) return;
    const range = rangeFromTextOffsets(editor, context.start, context.end);
    if (!range) return;
    range.deleteContents();
    const token = createMentionToken(option.agent);
    const trailingSpace = document.createTextNode(" ");
    range.insertNode(trailingSpace);
    range.insertNode(token);
    const selection = window.getSelection();
    range.setStartAfter(trailingSpace);
    range.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(range);
    setMention(null);
    emitValue();
    editor.focus();
  }

  function moveActiveOption(delta: number, optionCount: number) {
    const next = (activeOption + delta + optionCount) % optionCount;
    setActiveOptionState(next);
    const option = matchingOptions[next];
    if (option) queueMicrotask(() => optionElements.current.get(pickerOptionKey(option))?.scrollIntoView?.({ block: "nearest" }));
  }

  function handleMentionPickerKeyDown(event: ReactKeyboardEvent): boolean {
    const context = mentionRef.current;
    if (!context) return false;
    const current = mentionAtSelection();
    if (!current || current.start !== context.start || current.end !== context.end || current.query !== context.query) {
      setMention(null);
      return false;
    }
    if (event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) return false;
    if (event.key === "Escape") {
      event.preventDefault();
      setMention(null);
      return true;
    }
    if (matchingOptions.length === 0) return false;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActiveOption(1, matchingOptions.length);
      return true;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActiveOption(-1, matchingOptions.length);
      return true;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      const option = matchingOptions[activeOption];
      if (option) insertOption(option);
      return true;
    }
    return false;
  }

  function removeAdjacentMention(key: "Backspace" | "Delete"): boolean {
    const editor = editorRef.current;
    if (!editor) return false;
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (!range?.collapsed || !editor.contains(range.commonAncestorContainer)) return false;
    const token = mentionTokenAtCaretBoundary(editor, range, key);
    const tokenParent = token?.parentNode;
    if (!token || !tokenParent) return false;
    const caretOffset = Array.from(tokenParent.childNodes).indexOf(token as ChildNode);
    token.remove();
    setMention(null);
    emitValue();
    editor.focus();
    placeCaretAtChildOffset(tokenParent, Math.min(caretOffset, tokenParent.childNodes.length));
    return true;
  }

  function removeAutomaticMentionSpace(): boolean {
    const editor = editorRef.current;
    if (!editor) return false;
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (!range?.collapsed || !editor.contains(range.commonAncestorContainer)) return false;
    const boundary = automaticMentionSpaceAtCaretBoundary(editor, range);
    if (!boundary) return false;
    boundary.text.deleteData(boundary.offset - 1, 1);
    if (!boundary.text.data) boundary.text.remove();
    const tokenParent = boundary.token.parentNode;
    if (!tokenParent) return false;
    const caretOffset = Array.from(tokenParent.childNodes).indexOf(boundary.token as ChildNode) + 1;
    setMention(null);
    emitValue();
    editor.focus();
    placeCaretAtChildOffset(tokenParent, caretOffset);
    return true;
  }

  function removeTrailingLineBreak(): boolean {
    const editor = editorRef.current;
    if (!editor) return false;
    const text = editorText(editor);
    const selection = readEditorSelection(editor);
    if (!text.endsWith("\n") || !selection || selection.anchor !== text.length || selection.focus !== text.length) return false;
    const range = rangeFromTextOffsets(editor, text.length - 1, text.length);
    if (!range) return false;
    const nativeSelection = window.getSelection();
    nativeSelection?.removeAllRanges();
    nativeSelection?.addRange(range);
    insertPlainText(editor, "");
    emitValue();
    updateMention();
    return true;
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const editor = editorRef.current;
    if (disabled || !editor) return;
    /*
     * The browser owns the IME composition buffer. The key that starts a composition comes before
     * `compositionstart` and without `isComposing`; Chromium marks it with keyCode 229 ("Process").
     */
    if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229 || event.key === "Process") return;
    if (handleMentionPickerKeyDown(event)) return;
    if (event.key === "Tab" && props.onSteer && !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      props.onSteer();
      return;
    }
    if (event.key === "Backspace" && removeAutomaticMentionSpace()) {
      event.preventDefault();
      return;
    }
    if ((event.key === "Backspace" || event.key === "Delete") && removeAdjacentMention(event.key)) {
      event.preventDefault();
      return;
    }
    ensureEditorSelection();
    if (event.key === "Backspace" && removeTrailingLineBreak()) {
      event.preventDefault();
      return;
    }
    if (event.key.toLocaleLowerCase() === "a" && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey) {
      event.preventDefault();
      const range = document.createRange();
      range.selectNodeContents(editor);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      return;
    }
    if (event.key === "Enter" && event.shiftKey) {
      event.preventDefault();
      insertLineBreak(editor);
      emitValue();
      updateMention();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      props.onSubmit();
    }
  }

  /*
   * Every plain character takes the same road: this handler cancels the native insert and asks the
   * browser to insert the text. The text comes from the input event, not from the key.
   */
  function handleBeforeInput(event: InputEvent) {
    const editor = editorRef.current;
    if (!editor || disabled || composing.current || event.isComposing) return;
    const lineBreak = event.inputType === "insertLineBreak" || event.inputType === "insertParagraph";
    if (!lineBreak && (event.inputType !== "insertText" || !event.data)) return;
    event.preventDefault();
    if (lineBreak) insertLineBreak(editor);
    else if (event.data) insertPlainText(editor, event.data);
    emitValue();
    updateMention();
  }

  function handlePaste(event: ReactClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    const editor = editorRef.current;
    if (!editor || disabled) return;
    const text = event.clipboardData.getData("text/plain").replace(/\r\n?/g, "\n").slice(0, MESSAGE_TEXT_LIMIT);
    if (!text) return;
    insertPlainText(editor, text);
    emitValue();
    updateMention();
  }

  const latest = useRef({ handleBeforeInput, updateMention, scheduleCaretScroll });
  latest.current = { handleBeforeInput, updateMention, scheduleCaretScroll };

  // React's onBeforeInput is not the browser's `beforeinput`, so the editor listens for the real one.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const listener = (event: InputEvent) => latest.current.handleBeforeInput(event);
    editor.addEventListener("beforeinput", listener);
    return () => editor.removeEventListener("beforeinput", listener);
  }, []);

  // Puts the draft in the editor when it changed elsewhere, as after a send or a quick action, so typing keeps its caret.
  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor || (composing.current && agentId === lastAgentId.current)) return;
    const draftChanged = agentId !== lastAgentId.current;
    const contentChanged = draftChanged || value !== lastEmittedValue.current;
    const selection = !draftChanged && editor.ownerDocument.activeElement === editor ? readEditorSelection(editor) : null;
    const scrollTop = draftChanged ? 0 : editor.scrollTop;
    const focusRequested = focusRequest > lastFocusRequest.current;
    if (draftChanged) savedCaret.current = null;
    if (contentChanged) {
      lastAgentId.current = agentId;
      lastEmittedValue.current = value;
      renderEditorValue(editor, value, agents);
      setMention(null);
    }
    if (selection && contentChanged) {
      restoreEditorSelection(editor, selection);
      scheduleCaretScroll();
    }
    editor.scrollTop = scrollTop;
    if (focusRequested) {
      lastFocusRequest.current = focusRequest;
      // Text that the user selected in the draft stays selected.
      const draftSelection = contentChanged ? null : readEditorSelection(editor);
      editor.focus({ preventScroll: true });
      if (!draftSelection || draftSelection.anchor === draftSelection.focus) placeCaretAtEnd(editor);
      scheduleCaretScroll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compositionRevision, agentId, value, agents, focusRequest, disabled]);

  // Coming back to the window puts the caret back here, so the first keys are not lost.
  useEffect(() => {
    const view = editorRef.current?.ownerDocument.defaultView;
    if (!view) return;
    let focusInFrame = false;
    const noteFrameFocus = () => {
      focusInFrame = view.document.activeElement instanceof view.HTMLIFrameElement;
    };
    const restoreFocus = () => {
      if (focusInFrame || view.matchMedia?.("(hover: none), (pointer: coarse)").matches) return;
      const editor = editorRef.current;
      if (editor && shouldRestoreComposerFocus(editor)) {
        editor.focus({ preventScroll: true });
        latest.current.scheduleCaretScroll();
      }
    };
    view.addEventListener("blur", noteFrameFocus);
    view.addEventListener("focus", restoreFocus);
    return () => {
      view.removeEventListener("blur", noteFrameFocus);
      view.removeEventListener("focus", restoreFocus);
    };
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const document = editor.ownerDocument;
    const selectionChanged = () => {
      if (document.activeElement === editor) savedCaret.current = readEditorSelection(editor)?.focus ?? savedCaret.current;
      // A dismissed picker stays closed until the user types or clicks again.
      if (mentionRef.current) latest.current.updateMention();
    };
    document.addEventListener("selectionchange", selectionChanged);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => latest.current.scheduleCaretScroll());
    observer?.observe(editor);
    return () => {
      document.removeEventListener("selectionchange", selectionChanged);
      observer?.disconnect();
      if (caretFrame.current !== undefined) editor.ownerDocument.defaultView?.cancelAnimationFrame(caretFrame.current);
    };
  }, []);

  return (
    <div className="composer-editor-root" data-size={props.size ?? "default"}>
      {value === "" ? (
        <span className="composer-editor-placeholder" aria-hidden="true">
          {props.placeholder}
        </span>
      ) : null}
      <div
        ref={editorRef}
        className="composer-editor-surface"
        contentEditable={disabled ? "false" : "true"}
        suppressContentEditableWarning
        role="textbox"
        tabIndex={disabled ? -1 : 0}
        aria-label={props.ariaLabel}
        aria-disabled={disabled ? "true" : "false"}
        aria-multiline="true"
        aria-keyshortcuts={props.onSteer ? "Tab" : undefined}
        spellCheck
        data-cuelume-type=""
        onFocus={ensureEditorSelection}
        onInput={() => {
          emitValue();
          updateMention();
        }}
        onClick={updateMention}
        onKeyDown={handleKeyDown}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={() => {
          composing.current = false;
          setCompositionRevision((revision) => revision + 1);
        }}
        onPaste={handlePaste}
        onBlur={() => {
          composing.current = false;
          // A menu can return the focus to the editor within this delay; keep the picker it opened.
          window.setTimeout(() => {
            const ownerDocument = editorRef.current?.ownerDocument;
            if (!ownerDocument?.hasFocus() || ownerDocument.activeElement !== editorRef.current) setMention(null);
          }, 100);
        }}
      />
      {pickerOpen
        ? createPortal(
            <div
              className="mention-picker"
              style={{ "--mention-picker-bottom": `${pickerFrame.bottom}px`, "--mention-picker-rows": matchingOptions.length } as React.CSSProperties}
            >
              <div
                ref={listRef}
                role="listbox"
                className={cx("mention-picker-list", fades.top && "scroll-fade-top", fades.bottom && "scroll-fade-bottom")}
                aria-label="Insert mention"
                onScroll={measureFades}
              >
                {matchingOptions.map((option, index) => {
                  const description = pickerOptionDescription(option);
                  return (
                    <div
                      key={pickerOptionKey(option)}
                      ref={(element) => {
                        if (element) optionElements.current.set(pickerOptionKey(option), element);
                        else optionElements.current.delete(pickerOptionKey(option));
                      }}
                      role="option"
                      aria-selected={activeOption === index}
                      aria-label={pickerOptionText(option)}
                      className={cx("mention-picker-option", activeOption === index && "mention-picker-option-active")}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        // The composer focuses its editor on any pointerdown that is not a control.
                        event.stopPropagation();
                      }}
                      onMouseEnter={() => setActiveOptionState(index)}
                      onClick={() => insertOption(option)}
                    >
                      <AgentAvatar agent={option.agent} />
                      <strong>{option.agent.name}</strong>
                      {description ? <span className="mention-picker-description">{description}</span> : null}
                      <Badge className="mention-picker-badge" variant="ghost">
                        <Bot aria-hidden="true" />
                        Agent
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </div>,
            pickerFrame.mount ?? document.body,
          )
        : null}
    </div>
  );
}
